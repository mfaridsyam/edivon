import { create } from 'zustand';
import { newId } from '../timeline/model';
import { importFiles } from './importMedia';
import { editor } from './store';
import { YT_HELPER_ORIGIN, fileNameFromTitle } from './youtubeLink';

/**
 * Unduhan YouTube lewat helper lokal (tools/yt-helper.mjs). Browser tidak bisa mengambil video YouTube
 * sendiri, jadi helper di 127.0.0.1 yang menjalankan yt-dlp. Hasilnya diambil sebagai Blob lalu diimpor
 * seperti berkas lokal, sehingga pratinjau, efek, dan ekspor tetap berjalan di browser.
 *
 * Helper baru dihubungi saat pengguna menempel link, tidak saat halaman dimuat.
 */

export type YtFormat = 'mp4' | 'mp3';

export interface YtVideo {
  id: string;
  title: string;
  channel: string;
  /** Detik. */
  duration: number;
  isLive: boolean;
}

export type HelperStatus =
  | { state: 'unknown' }
  | { state: 'checking' }
  | { state: 'offline' }
  | { state: 'ready'; ytdlp: string | null; outdated: boolean; ffmpeg: boolean };

export type YtLookup = { state: 'loading' } | { state: 'ready'; video: YtVideo } | { state: 'error'; error: string };

export type YtPhase = 'starting' | 'queued' | 'preparing' | 'downloading' | 'processing' | 'transferring' | 'error';

export interface YtJob {
  /** ID lokal, ada sejak tombol Unduh ditekan. */
  key: string;
  videoId: string;
  format: YtFormat;
  title: string;
  phase: YtPhase;
  /** 0..1 */
  progress: number;
  error?: string;
}

interface YouTubeState {
  helper: HelperStatus;
  lookups: Partial<Record<string, YtLookup>>;
  jobs: YtJob[];
}

export const useYouTube = create<YouTubeState>()(() => ({
  helper: { state: 'unknown' },
  lookups: {},
  jobs: [],
}));

/** Jawaban helper untuk satu unduhan. */
interface JobSnapshot {
  id: string;
  status: 'queued' | 'preparing' | 'downloading' | 'processing' | 'done' | 'error';
  progress: number;
  title: string;
  error?: string;
}

interface StatusBody {
  app?: string;
  ytdlp: string | null;
  outdated: boolean;
  ffmpeg: boolean;
}

/** Helper tidak bisa dihubungi (belum dijalankan, atau izin jaringan lokal ditolak browser). */
class HelperOffline extends Error {}

const POLL_MS = 500;
const controllers = new Map<string, AbortController>();
const helperJobIds = new Map<string, string>();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${YT_HELPER_ORIGIN}${path}`, { cache: 'no-store', ...init });
  } catch (e) {
    if (init?.signal?.aborted) throw e;
    throw new HelperOffline();
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Helper menjawab ${res.status}.`);
  return body as T;
}

function messageOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Terjadi kesalahan.';
}

/** True bila helper berjalan dan alatnya lengkap. */
export function helperUsable(h: HelperStatus): boolean {
  return h.state === 'ready' && h.ytdlp !== null && !h.outdated && h.ffmpeg;
}

export async function checkHelper(): Promise<boolean> {
  useYouTube.setState({ helper: { state: 'checking' } });
  try {
    // Batas waktu longgar: Chrome bisa menahan permintaan sampai pengguna menjawab izin jaringan lokal.
    const s = await request<StatusBody>('/status', { signal: AbortSignal.timeout(60_000) });
    if (s.app !== 'klip-yt') throw new HelperOffline();
    const helper: HelperStatus = { state: 'ready', ytdlp: s.ytdlp, outdated: s.outdated, ffmpeg: s.ffmpeg };
    useYouTube.setState({ helper });
    return helperUsable(helper);
  } catch {
    useYouTube.setState({ helper: { state: 'offline' } });
    return false;
  }
}

/** Memakai status terakhir bila helper sudah siap; selain itu memeriksa ulang. */
async function ensureHelper(): Promise<boolean> {
  const h = useYouTube.getState().helper;
  if (h.state === 'ready') return helperUsable(h);
  return checkHelper();
}

function setLookup(id: string, lookup: YtLookup | undefined): void {
  useYouTube.setState((s) => ({ lookups: { ...s.lookups, [id]: lookup } }));
}

/** Membaca judul, channel, dan durasi untuk pratinjau sebelum diunduh. */
export async function lookupVideo(id: string): Promise<void> {
  const existing = useYouTube.getState().lookups[id];
  if (existing && existing.state !== 'error') return;
  if (!(await ensureHelper())) return;
  setLookup(id, { state: 'loading' });
  try {
    const video = await request<YtVideo>(`/videos/${id}`);
    setLookup(id, { state: 'ready', video });
  } catch (e) {
    if (e instanceof HelperOffline) {
      useYouTube.setState({ helper: { state: 'offline' } });
      setLookup(id, undefined);
    } else {
      setLookup(id, { state: 'error', error: messageOf(e) });
    }
  }
}

function patchJob(key: string, patch: Partial<YtJob>): void {
  useYouTube.setState((s) => ({ jobs: s.jobs.map((j) => (j.key === key ? { ...j, ...patch } : j)) }));
}

function dropJob(key: string): void {
  useYouTube.setState((s) => ({ jobs: s.jobs.filter((j) => j.key !== key) }));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * Memulai unduhan. Mengembalikan false bila helper belum siap (pesannya tampil di panel),
 * sehingga link yang ditempel tidak perlu dihapus.
 */
export async function startDownload(videoId: string, format: YtFormat): Promise<boolean> {
  if (!(await ensureHelper())) return false;
  const lookup = useYouTube.getState().lookups[videoId];
  const title = lookup?.state === 'ready' ? lookup.video.title : '';
  const key = newId('yt');
  useYouTube.setState((s) => ({ jobs: [...s.jobs, { key, videoId, format, title, phase: 'starting', progress: 0 }] }));
  editor.get().announce(`Mengunduh ${title || 'video YouTube'} sebagai ${format.toUpperCase()}.`);
  void runJob(key, videoId, format);
  return true;
}

async function runJob(key: string, videoId: string, format: YtFormat): Promise<void> {
  const ctrl = new AbortController();
  controllers.set(key, ctrl);
  try {
    let snap = await request<JobSnapshot>('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, format }),
      signal: ctrl.signal,
    });
    helperJobIds.set(key, snap.id);
    while (snap.status !== 'done') {
      if (snap.status === 'error') throw new Error(snap.error ?? 'Unduhan gagal.');
      patchJob(key, { phase: snap.status, progress: snap.progress, ...(snap.title ? { title: snap.title } : {}) });
      await sleep(POLL_MS, ctrl.signal);
      snap = await request<JobSnapshot>(`/jobs/${snap.id}`, { signal: ctrl.signal });
    }

    patchJob(key, { phase: 'transferring', progress: 1, title: snap.title });
    let res: Response;
    try {
      res = await fetch(`${YT_HELPER_ORIGIN}/jobs/${snap.id}/file`, { cache: 'no-store', signal: ctrl.signal });
    } catch (e) {
      if (ctrl.signal.aborted) throw e;
      throw new HelperOffline();
    }
    if (!res.ok) throw new Error('Berkas hasil tidak bisa diambil dari helper.');
    const blob = await res.blob();
    const type = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';
    const file = new File([blob], fileNameFromTitle(snap.title || videoId, format), { type });
    dropJob(key);
    importFiles([file]);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    let message = messageOf(e);
    if (e instanceof HelperOffline) {
      useYouTube.setState({ helper: { state: 'offline' } });
      message = 'Helper YouTube tidak bisa dihubungi. Pastikan npm run yt masih berjalan.';
    }
    patchJob(key, { phase: 'error', error: message });
    editor.get().announce(`Unduhan YouTube gagal: ${message}`);
  } finally {
    controllers.delete(key);
    helperJobIds.delete(key);
  }
}

export function cancelDownload(key: string): void {
  const helperId = helperJobIds.get(key);
  controllers.get(key)?.abort();
  if (helperId) {
    void fetch(`${YT_HELPER_ORIGIN}/jobs/${helperId}`, { method: 'DELETE' }).catch(() => {});
  }
  dropJob(key);
  editor.get().announce('Unduhan dibatalkan.');
}

export function dismissDownload(key: string): void {
  dropJob(key);
}

export function retryDownload(key: string): void {
  const job = useYouTube.getState().jobs.find((j) => j.key === key);
  if (!job) return;
  dropJob(key);
  void startDownload(job.videoId, job.format);
}
