import { readToken } from './tokens';

const THUMB_W = 320;
const THUMB_H = 180;

function canvasToUrl(canvas: HTMLCanvasElement, type = 'image/jpeg'): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Thumbnail gagal dibuat.'))),
      type,
      0.82,
    );
  });
}

function sizedCanvas(srcW: number, srcH: number): HTMLCanvasElement {
  const scale = Math.min(1, THUMB_W / srcW, THUMB_H / srcH) || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  return canvas;
}

function once(el: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      el.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      el.removeEventListener(event, ok);
      reject(new Error('Video tidak bisa dibaca.'));
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener('error', fail, { once: true });
  });
}

/** Mengambil satu frame (10% durasi, maks. 1 detik) sebagai thumbnail. */
export async function videoThumbnail(url: string, duration: number): Promise<string> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const loaded = once(video, 'loadeddata');
  video.src = url;
  try {
    await loaded;
    const seeked = once(video, 'seeked');
    video.currentTime = Math.min(1, duration * 0.1);
    await seeked;
    const canvas = sizedCanvas(video.videoWidth, video.videoHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Kanvas tidak tersedia.');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await canvasToUrl(canvas);
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

export async function imageThumbnail(bitmap: ImageBitmap): Promise<string> {
  const canvas = sizedCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kanvas tidak tersedia.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvasToUrl(canvas, 'image/png');
}

/** Batas ukuran berkas audio yang didekode untuk gambar gelombang. */
const WAVEFORM_MAX_BYTES = 40 * 1024 * 1024;
const BARS = 48;

/** Gambar gelombang sederhana dari puncak amplitudo. Null bila berkas terlalu besar atau gagal didekode. */
export async function audioThumbnail(file: File): Promise<string | null> {
  if (file.size > WAVEFORM_MAX_BYTES) return null;
  try {
    const data = await file.arrayBuffer();
    const ctxAudio = new OfflineAudioContext(1, 1, 44100);
    const buffer = await ctxAudio.decodeAudioData(data);
    const channel = buffer.getChannelData(0);
    const per = Math.max(1, Math.floor(channel.length / BARS));
    const peaks: number[] = [];
    for (let i = 0; i < BARS; i++) {
      let max = 0;
      const end = Math.min(channel.length, (i + 1) * per);
      for (let j = i * per; j < end; j += 8) max = Math.max(max, Math.abs(channel[j] ?? 0));
      peaks.push(max);
    }
    const top = Math.max(0.01, ...peaks);

    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = readToken('--clip-audio');
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    ctx.fillStyle = readToken('--ink-muted');
    const gap = 2;
    const barW = (THUMB_W - 24 - gap * (BARS - 1)) / BARS;
    for (let i = 0; i < BARS; i++) {
      const h = Math.max(3, ((peaks[i] ?? 0) / top) * (THUMB_H - 48));
      const x = 12 + i * (barW + gap);
      ctx.fillRect(x, (THUMB_H - h) / 2, barW, h);
    }
    return await canvasToUrl(canvas, 'image/png');
  } catch {
    return null;
  }
}
