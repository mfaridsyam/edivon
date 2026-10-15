import { PREVIEW_FONT } from '../engine/preview';
import { resolveTextColors } from '../engine/tokens';
import type { MediaItem } from '../state/media';
import type { Project } from '../timeline/model';
import type { ExportMedia, ExportSettings, FontSource, StartMessage, WorkerMessage } from './protocol';

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

/** Font teks video untuk worker; dimuat dari origin sendiri (public/fonts). */
function fontSources(): FontSource[] {
  const url = (file: string) => new URL(`/fonts/${file}`, window.location.href).href;
  return [
    { family: 'Figtree', weight: '600', url: url('figtree-latin-600-normal.woff2'), unicodeRange: LATIN },
    { family: 'Figtree', weight: '600', url: url('figtree-latin-ext-600-normal.woff2'), unicodeRange: LATIN_EXT },
  ];
}

export interface ExportCallbacks {
  onProgress: (done: number, total: number) => void;
  onWarning: (message: string) => void;
  onDone: (blob: Blob, extension: string) => void;
  onError: (message: string) => void;
}

export interface ExportJob {
  cancel: () => void;
}

/** Menjalankan ekspor di Web Worker. Batalkan = hentikan worker; tidak ada data yang keluar dari perangkat. */
export function startExport(project: Project, media: MediaItem[], settings: ExportSettings, cb: ExportCallbacks): ExportJob {
  const used = new Set(project.clips.flatMap((c) => ('mediaId' in c ? [c.mediaId] : [])));
  const exportMedia: ExportMedia[] = media
    .filter((m) => used.has(m.id) && m.status === 'ready')
    .map((m) => ({ id: m.id, kind: m.kind, name: m.name, file: m.file }));

  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'klip-ekspor' });
  let finished = false;
  const stop = () => {
    finished = true;
    worker.terminate();
  };

  worker.addEventListener('message', (e: MessageEvent<WorkerMessage>) => {
    if (finished) return;
    const msg = e.data;
    switch (msg.type) {
      case 'progress':
        cb.onProgress(msg.done, msg.total);
        break;
      case 'warning':
        cb.onWarning(msg.message);
        break;
      case 'done':
        stop();
        cb.onDone(new Blob([msg.buffer], { type: msg.mimeType }), msg.extension);
        break;
      case 'error':
        stop();
        cb.onError(msg.message);
        break;
    }
  });
  worker.addEventListener('error', (e) => {
    if (finished) return;
    stop();
    cb.onError(e.message || 'Worker ekspor berhenti tiba-tiba.');
  });

  const start: StartMessage = {
    type: 'start',
    project,
    media: exportMedia,
    settings,
    textColors: resolveTextColors(),
    fontFamily: PREVIEW_FONT,
    fonts: fontSources(),
  };
  worker.postMessage(start);

  return { cancel: stop };
}

/** Mengunduh hasil lewat <a download>. */
export function downloadBlob(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
