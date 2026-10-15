/**
 * Alamat helper YouTube lokal (tools/yt-helper.mjs, `npm run yt`). Juga dipakai CSP di vite.config.ts.
 * Port harus sama dengan PORT di helper.
 */
export const YT_HELPER_ORIGIN = 'http://127.0.0.1:7878';
/** Sumber thumbnail pratinjau sebelum video diunduh. */
export const YT_THUMB_ORIGIN = 'https://i.ytimg.com';

const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);
const PATH_PREFIXES = new Set(['shorts', 'live', 'embed', 'v']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * ID video dari link YouTube (watch, youtu.be, shorts, live, embed), atau null.
 * Parameter lain seperti `list=` dan `si=` diabaikan, jadi yang diunduh hanya satu video itu.
 */
export function parseYouTubeId(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null | undefined;
  if (host === 'youtu.be') id = parts[0];
  else if (parts[0] === 'watch') id = url.searchParams.get('v');
  else if (parts[0] && PATH_PREFIXES.has(parts[0])) id = parts[1];
  return id && VIDEO_ID.test(id) ? id : null;
}

/** Thumbnail kecil (320×180) dari YouTube untuk pratinjau sebelum diunduh. */
export function youTubeThumb(id: string): string {
  return `${YT_THUMB_ORIGIN}/vi/${id}/mqdefault.jpg`;
}

/** Nama berkas yang aman dari judul video. */
export function fileNameFromTitle(title: string, ext: string): string {
  const base = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 100)
    .trim();
  return `${base || 'video-youtube'}.${ext}`;
}
