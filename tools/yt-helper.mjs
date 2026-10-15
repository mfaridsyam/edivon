// Helper YouTube untuk Klip: `npm run yt`.
//
// Klip berjalan sepenuhnya di browser, dan browser tidak bisa mengambil video dari YouTube. Helper ini
// berjalan di komputermu sendiri (hanya 127.0.0.1), memanggil yt-dlp untuk mengunduh satu video sebagai
// MP4 atau MP3 ke folder sementara, lalu menyerahkan berkasnya ke tab Klip. Setelah diambil, berkas
// sementaranya dihapus.
//
// Butuh yt-dlp 2025.11.12 atau lebih baru dan ffmpeg. Di Windows: `winget install yt-dlp.yt-dlp`
// (ikut memasang FFmpeg). Lokasi lain bisa diatur dengan variabel YTDLP dan FFMPEG.
// Origin tambahan yang boleh memakai helper: KLIP_ORIGINS="https://a.example,https://b.example".
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, rmSync } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Sama dengan YT_HELPER_ORIGIN di src/state/youtubeLink.ts. */
export const PORT = 7878;
const PROTOCOL = 1;
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ORIGINS = new Set([
  'https://edivon.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  ...(process.env.KLIP_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
]);

/** Versi pertama yang memakai JavaScript runtime eksternal untuk YouTube (`--js-runtimes`). */
const MIN_YTDLP = '2025.11.12';
const MAX_RUNNING = 2;
const INFO_TTL_MS = 30 * 60_000;
const JOB_TTL_MS = 30 * 60_000;
const ROOT = join(tmpdir(), 'klip-yt');

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Format yt-dlp per pilihan. MP4 memilih H.264 + AAC ≤1080p agar mudah didekode browser dan hemat memori. */
const FORMAT_ARGS = {
  mp4: [
    '-f',
    'bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b',
    '--merge-output-format',
    'mp4',
  ],
  mp3: ['-f', 'ba[acodec^=mp4a]/ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0'],
};

/* ---------- Pembacaan keluaran yt-dlp (diekspor untuk tes) ---------- */

export const PROGRESS_TEMPLATE =
  'download:KLIP-PROGRESS %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s';

/**
 * Menafsirkan satu baris keluaran yt-dlp.
 * @returns {{ type: 'streams', count: number } | { type: 'stream' } | { type: 'progress', fraction: number } | { type: 'processing' } | { type: 'error', message: string } | null}
 */
export function parseLine(line) {
  const text = line.trim();
  let m = /^\[info\] [^:]+: Downloading \d+ format\(s\): (\S+)/.exec(text);
  if (m) return { type: 'streams', count: m[1].split('+').length };
  if (text.startsWith('[download] Destination:')) return { type: 'stream' };
  m = /^KLIP-PROGRESS (\S+) (\S+) (\S+)$/.exec(text);
  if (m) {
    const done = Number(m[1]);
    const total = Number(m[2]) || Number(m[3]);
    if (!(done >= 0) || !(total > 0)) return null;
    return { type: 'progress', fraction: Math.min(1, done / total) };
  }
  if (/^\[(Merger|ExtractAudio|VideoConvertor|VideoRemuxer)\]/.test(text)) return { type: 'processing' };
  if (text.startsWith('ERROR:')) return { type: 'error', message: friendlyError(text) };
  return null;
}

/** Pesan error yt-dlp yang umum, dalam bahasa yang dipakai Klip. */
export function friendlyError(raw) {
  const text = raw.replace(/^ERROR:\s*/, '').replace(/^\[[^\]]+\]\s*[A-Za-z0-9_-]{11}:\s*/, '');
  if (/private video/i.test(text)) return 'Video ini privat.';
  if (/confirm your age|age.restricted|inappropriate for some users/i.test(text))
    return 'Video ini dibatasi usia dan butuh login YouTube.';
  if (/not a bot/i.test(text)) return 'YouTube meminta verifikasi bahwa kamu bukan bot. Coba lagi nanti.';
  if (/members.only|join this channel/i.test(text)) return 'Video ini khusus anggota channel.';
  if (/live event|is live|premieres in/i.test(text)) return 'Siaran langsung atau premiere belum bisa diunduh.';
  if (/ffmpeg|ffprobe/i.test(text)) return 'ffmpeg tidak ditemukan. Pasang dengan: winget install yt-dlp.FFmpeg';
  if (/unavailable|does not exist|removed/i.test(text)) return 'Video tidak tersedia.';
  if (/unable to download|timed out|connection|getaddrinfo|network/i.test(text))
    return 'Koneksi ke YouTube gagal. Periksa internetmu lalu coba lagi.';
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** True bila versi yt-dlp (YYYY.MM.DD[.n]) setidaknya `min`. */
export function versionAtLeast(version, min) {
  const parse = (v) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(version);
  const b = parse(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

/* ---------- Proses ---------- */

/** Menjalankan perintah singkat dan mengumpulkan keluarannya. */
function run(cmd, args, { timeout = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => killTree(child), timeout);
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** Menghentikan proses beserta anaknya (yt-dlp menjalankan ffmpeg). */
function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {});
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

/** @type {{ cmd: string, pre: string[], version: string } | null} */
let ytdlp = null;
let ffmpeg = false;
/** @type {string[]} */
let ffmpegArgs = [];

async function detectTools() {
  const candidates = process.env.YTDLP
    ? [[process.env.YTDLP]]
    : [['yt-dlp'], ['python', '-m', 'yt_dlp'], ['python3', '-m', 'yt_dlp']];
  for (const [cmd, ...pre] of candidates) {
    const r = await run(cmd, [...pre, '--version'], { timeout: 20_000 }).catch(() => null);
    const version = r?.code === 0 ? r.stdout.trim().split(/\s+/)[0] : '';
    if (version && /^\d{4}\.\d{2}\.\d{2}/.test(version)) {
      ytdlp = { cmd, pre, version };
      break;
    }
  }

  const location = process.env.FFMPEG;
  ffmpegArgs = location ? ['--ffmpeg-location', location] : [];
  const probe = location ? (/\.exe$|ffmpeg$/i.test(location) ? location : join(location, 'ffmpeg')) : 'ffmpeg';
  const r = await run(probe, ['-version'], { timeout: 20_000 }).catch(() => null);
  ffmpeg = r?.code === 0;
}

function ytdlpOutdated() {
  return ytdlp !== null && !versionAtLeast(ytdlp.version, MIN_YTDLP);
}

/** Argumen dasar: Node yang menjalankan helper ini dipakai sebagai JavaScript runtime untuk YouTube. */
function baseArgs() {
  const js = ytdlpOutdated() ? [] : ['--js-runtimes', `node:${process.execPath}`];
  return [...(ytdlp?.pre ?? []), '--no-colors', '--no-playlist', ...js, ...ffmpegArgs];
}

/* ---------- Info video ---------- */

/** @type {Map<string, { at: number, raw: string, info: VideoInfo }>} */
const infoCache = new Map();
/** Permintaan info yang sedang berjalan, agar pratinjau dan unduhan tidak menjalankan yt-dlp dua kali. */
const infoPending = new Map();

/** @typedef {{ id: string, title: string, channel: string, duration: number, isLive: boolean }} VideoInfo */

/** @returns {Promise<{ raw: string, info: VideoInfo }>} */
function videoInfo(id) {
  const cached = infoCache.get(id);
  if (cached && Date.now() - cached.at < INFO_TTL_MS) return Promise.resolve(cached);
  let pending = infoPending.get(id);
  if (!pending) {
    pending = fetchInfo(id).finally(() => infoPending.delete(id));
    infoPending.set(id, pending);
  }
  return pending;
}

async function fetchInfo(id) {
  if (!ytdlp) throw new Error('yt-dlp belum terpasang.');
  const { cmd } = ytdlp;
  const r = await run(cmd, [...baseArgs(), '-J', '--', `https://www.youtube.com/watch?v=${id}`]);
  if (r.code !== 0) {
    const line = r.stderr.split(/\r?\n/).reverse().find((l) => l.startsWith('ERROR:'));
    throw new Error(line ? friendlyError(line) : 'Info video tidak bisa dibaca.');
  }
  const data = JSON.parse(r.stdout);
  const info = {
    id,
    title: String(data.title ?? id),
    channel: String(data.channel ?? data.uploader ?? ''),
    duration: Number(data.duration) || 0,
    isLive: Boolean(data.is_live) || data.live_status === 'is_upcoming',
  };
  const entry = { at: Date.now(), raw: r.stdout, info };
  infoCache.set(id, entry);
  return entry;
}

/* ---------- Unduhan ---------- */

/**
 * @typedef {'queued' | 'preparing' | 'downloading' | 'processing' | 'done' | 'error'} JobStatus
 * @typedef {{
 *   id: string, videoId: string, format: 'mp4' | 'mp3', status: JobStatus, progress: number,
 *   title: string, error?: string, dir: string, file?: string, size?: number,
 *   child?: import('node:child_process').ChildProcess, canceled: boolean, updated: number
 * }} Job
 */

/** @type {Map<string, Job>} */
const jobs = new Map();
/** @type {Job[]} */
const queue = [];
let running = 0;

function snapshot(job) {
  return {
    id: job.id,
    videoId: job.videoId,
    format: job.format,
    status: job.status,
    progress: job.progress,
    title: job.title,
    error: job.error,
    size: job.size,
  };
}

function update(job, patch) {
  Object.assign(job, patch, { updated: Date.now() });
}

function enqueue(job) {
  queue.push(job);
  pump();
}

function pump() {
  while (running < MAX_RUNNING && queue.length > 0) {
    const job = queue.shift();
    if (!job || job.canceled) continue;
    running += 1;
    void execute(job).finally(() => {
      running -= 1;
      pump();
    });
  }
}

async function execute(job) {
  try {
    update(job, { status: 'preparing' });
    const { raw, info } = await videoInfo(job.videoId);
    if (info.isLive) throw new Error('Siaran langsung atau premiere belum bisa diunduh.');
    update(job, { title: info.title });
    if (job.canceled) return;

    await mkdir(job.dir, { recursive: true });
    const infoPath = join(job.dir, 'info.json');
    await writeFile(infoPath, raw);

    const args = [
      ...baseArgs(),
      ...FORMAT_ARGS[job.format],
      '--newline',
      '--no-part',
      '--progress-template',
      PROGRESS_TEMPLATE,
      '-o',
      join(job.dir, 'media.%(ext)s'),
      '--load-info-json',
      infoPath,
    ];
    if (job.canceled) return;
    const code = await download(job, args);
    if (job.canceled) return;
    if (code !== 0) throw new Error(job.error ?? 'Unduhan gagal.');

    const name = `media.${job.format}`;
    const file = join(job.dir, name);
    const { size } = await stat(file).catch(async () => {
      const found = (await readdir(job.dir)).join(', ');
      throw new Error(`Berkas hasil tidak ditemukan (${found || 'folder kosong'}).`);
    });
    update(job, { status: 'done', progress: 1, file, size });
    log(`selesai: ${info.title} (${job.format.toUpperCase()}, ${(size / 1e6).toFixed(1)} MB)`);
  } catch (e) {
    if (job.canceled) return;
    const message = e instanceof Error ? e.message : String(e);
    update(job, { status: 'error', error: message });
    log(`gagal: ${job.videoId}: ${message}`);
    void rm(job.dir, { recursive: true, force: true });
  } finally {
    job.child = undefined;
  }
}

/** Menjalankan yt-dlp dan memperbarui progres job dari keluarannya. */
function download(job, args) {
  return new Promise((resolve, reject) => {
    if (!ytdlp) return reject(new Error('yt-dlp belum terpasang.'));
    const child = spawn(ytdlp.cmd, args, { windowsHide: true, detached: process.platform !== 'win32' });
    job.child = child;
    update(job, { status: 'downloading', progress: 0 });

    let streams = 1;
    let index = -1;
    const onLine = (line) => {
      const ev = parseLine(line);
      if (!ev) return;
      if (ev.type === 'streams') streams = ev.count;
      else if (ev.type === 'stream') index += 1;
      else if (ev.type === 'progress' && job.status === 'downloading') {
        const overall = (Math.max(0, index) + ev.fraction) / streams;
        if (overall > job.progress) update(job, { progress: Math.min(1, overall) });
      } else if (ev.type === 'processing') update(job, { status: 'processing', progress: 1 });
      else if (ev.type === 'error') job.error = ev.message;
    };
    lines(child.stdout, onLine);
    lines(child.stderr, onLine);
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function lines(stream, onLine) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split(/\r?\n|\r/);
    buffer = parts.pop() ?? '';
    for (const part of parts) onLine(part);
  });
  stream.on('end', () => buffer && onLine(buffer));
}

function removeJob(job) {
  job.canceled = true;
  if (job.child) killTree(job.child);
  jobs.delete(job.id);
  const i = queue.indexOf(job);
  if (i >= 0) queue.splice(i, 1);
  // Di Windows berkas baru bisa dihapus setelah yt-dlp/ffmpeg benar-benar berhenti.
  setTimeout(() => void rm(job.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }), 1000);
}

/* ---------- HTTP ---------- */

function log(text) {
  const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
  console.log(`[${time}] ${text}`);
}

function cors(req, res) {
  const origin = req.headers.origin ?? '';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    // Chrome meminta izin akses jaringan lokal untuk situs publik yang memanggil 127.0.0.1.
    if (req.headers['access-control-request-private-network']) {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error('Permintaan terlalu besar.');
  }
  return JSON.parse(body || '{}');
}

async function handle(req, res) {
  // Hanya untuk Klip: tolak host lain (DNS rebinding) dan origin yang tidak dikenal.
  if (!HOSTS.has(req.headers.host ?? '')) return json(res, 403, { error: 'Host tidak dikenal.' });
  const origin = req.headers.origin;
  if (!origin || !ORIGINS.has(origin)) {
    log(`ditolak: origin ${origin ?? '(kosong)'}. Tambahkan lewat KLIP_ORIGINS bila ini Klip milikmu.`);
    return json(res, 403, { error: 'Origin tidak diizinkan.' });
  }
  cors(req, res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && url.pathname === '/status') {
    return json(res, 200, {
      app: 'klip-yt',
      protocol: PROTOCOL,
      ytdlp: ytdlp?.version ?? null,
      outdated: ytdlpOutdated(),
      ffmpeg,
    });
  }

  if (req.method === 'GET' && parts[0] === 'videos' && parts.length === 2) {
    const id = parts[1] ?? '';
    if (!VIDEO_ID.test(id)) return json(res, 400, { error: 'ID video tidak valid.' });
    try {
      const { info } = await videoInfo(id);
      return json(res, 200, info);
    } catch (e) {
      return json(res, 422, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/jobs') {
    const body = await readJson(req).catch(() => null);
    const videoId = body?.videoId;
    const format = body?.format;
    if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return json(res, 400, { error: 'ID video tidak valid.' });
    if (format !== 'mp4' && format !== 'mp3') return json(res, 400, { error: 'Format harus mp4 atau mp3.' });
    if (!ytdlp) return json(res, 503, { error: 'yt-dlp belum terpasang.' });
    const id = randomUUID();
    /** @type {Job} */
    const job = {
      id,
      videoId,
      format,
      status: 'queued',
      progress: 0,
      title: infoCache.get(videoId)?.info.title ?? '',
      dir: join(ROOT, id),
      canceled: false,
      updated: Date.now(),
    };
    jobs.set(id, job);
    log(`mulai: ${videoId} sebagai ${format.toUpperCase()}`);
    enqueue(job);
    return json(res, 201, snapshot(job));
  }

  if (parts[0] === 'jobs' && parts.length >= 2) {
    const job = jobs.get(parts[1] ?? '');
    if (!job) return json(res, 404, { error: 'Unduhan tidak ditemukan.' });

    if (req.method === 'GET' && parts.length === 2) return json(res, 200, snapshot(job));

    if (req.method === 'DELETE' && parts.length === 2) {
      log(`dibatalkan: ${job.title || job.videoId}`);
      removeJob(job);
      return res.writeHead(204).end();
    }

    if (req.method === 'GET' && parts[2] === 'file' && parts.length === 3) {
      if (job.status !== 'done' || !job.file) return json(res, 409, { error: 'Unduhan belum selesai.' });
      res.writeHead(200, {
        'Content-Type': job.format === 'mp3' ? 'audio/mpeg' : 'video/mp4',
        'Content-Length': String(job.size ?? 0),
        'Cache-Control': 'no-store',
      });
      const stream = createReadStream(job.file);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
      // Berkas sementara dihapus begitu sudah diserahkan ke Klip.
      res.on('close', () => {
        stream.destroy();
        if (res.writableFinished) removeJob(job);
      });
      return;
    }
  }

  return json(res, 404, { error: 'Tidak ditemukan.' });
}

function sweep() {
  const now = Date.now();
  for (const job of jobs.values()) {
    const finished = job.status === 'done' || job.status === 'error';
    if (finished && now - job.updated > JOB_TTL_MS) removeJob(job);
  }
  for (const [id, entry] of infoCache) if (now - entry.at > INFO_TTL_MS) infoCache.delete(id);
}

async function main() {
  await rm(ROOT, { recursive: true, force: true }).catch(() => {});
  await detectTools();

  console.log('Helper YouTube untuk Klip');
  if (ytdlp) {
    console.log(`  yt-dlp  ${ytdlp.version}${ytdlpOutdated() ? `  (terlalu lama, butuh ${MIN_YTDLP}+; perbarui: winget upgrade yt-dlp.yt-dlp atau yt-dlp -U)` : ''}`);
  } else {
    console.log('  yt-dlp  TIDAK DITEMUKAN. Pasang: winget install yt-dlp.yt-dlp  (atau atur variabel YTDLP)');
  }
  console.log(`  ffmpeg  ${ffmpeg ? 'ada' : 'TIDAK DITEMUKAN. Pasang: winget install yt-dlp.FFmpeg  (atau atur variabel FFMPEG)'}`);
  console.log(`  node    ${process.version} (JavaScript runtime untuk YouTube)`);
  console.log(`  origin  ${[...ORIGINS].join(', ')}`);

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      log(`error: ${e instanceof Error ? e.stack : e}`);
      if (!res.headersSent) json(res, 500, { error: 'Kesalahan di helper.' });
      else res.destroy();
    });
  });
  server.on('error', (e) => {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} sudah dipakai. Mungkin helper sudah berjalan di jendela lain.`);
    } else {
      console.error(e);
    }
    process.exit(1);
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\nSiap di http://127.0.0.1:${PORT}. Biarkan jendela ini terbuka selama memakai Klip. Ctrl+C untuk berhenti.\n`);
  });
  setInterval(sweep, 60_000).unref();

  const stop = () => {
    for (const job of jobs.values()) if (job.child) killTree(job.child);
    // Beri waktu proses anak berhenti sebelum folder sementara dihapus.
    setTimeout(() => {
      try {
        rmSync(ROOT, { recursive: true, force: true });
      } catch {
        // Folder akan dibersihkan saat helper dijalankan lagi.
      }
      process.exit(0);
    }, 300);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
