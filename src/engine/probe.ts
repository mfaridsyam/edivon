import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { MediaKind } from '../state/media';

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Bisa dibaca dan didekode WebCodecs untuk ekspor. */
  exportable: boolean;
}

const EXTENSIONS: Record<string, MediaKind> = {
  mp4: 'video', m4v: 'video', mov: 'video', webm: 'video', mkv: 'video', ogv: 'video',
  mp3: 'audio', m4a: 'audio', aac: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio', flac: 'audio',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', bmp: 'image',
};

/** Jenis media dari MIME type, dengan cadangan ekstensi berkas. */
export function mediaKindOf(file: File): MediaKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSIONS[ext] ?? null;
}

/** Membaca metadata kontainer lewat mediabunny (tanpa mendekode seluruh berkas). */
async function probeContainer(file: File) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead())) return null;
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();
    return {
      duration,
      width: video ? await video.getDisplayWidth() : 0,
      height: video ? await video.getDisplayHeight() : 0,
      hasVideo: video !== null,
      hasAudio: audio !== null,
      videoDecodable: video ? await video.canDecode() : false,
      audioDecodable: audio ? await audio.canDecode() : false,
    };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

function elementMetadata(el: HTMLMediaElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error('Format ini tidak bisa diputar di browser ini.'));
    };
    const cleanup = () => {
      el.removeEventListener('loadedmetadata', done);
      el.removeEventListener('error', fail);
    };
    el.addEventListener('loadedmetadata', done);
    el.addEventListener('error', fail);
    el.preload = 'metadata';
    el.src = url;
  });
}

export async function probeVideo(file: File, url: string): Promise<ProbeResult> {
  const el = document.createElement('video');
  el.muted = true;
  const [meta, container] = await Promise.all([
    elementMetadata(el, url).then(
      () => ({ duration: el.duration, width: el.videoWidth, height: el.videoHeight }),
      (e: unknown) => e as Error,
    ),
    probeContainer(file),
  ]);
  el.removeAttribute('src');
  el.load();
  if (meta instanceof Error) throw meta;
  const duration = Number.isFinite(meta.duration) && meta.duration > 0 ? meta.duration : (container?.duration ?? 0);
  if (!(duration > 0)) throw new Error('Durasi video tidak bisa dibaca.');
  return {
    duration: container?.duration && container.duration > 0 ? container.duration : duration,
    width: meta.width || container?.width || 0,
    height: meta.height || container?.height || 0,
    hasAudio: container ? container.hasAudio : true,
    exportable: Boolean(container?.hasVideo && container.videoDecodable),
  };
}

export async function probeAudio(file: File, url: string): Promise<ProbeResult> {
  const el = document.createElement('audio');
  const [meta, container] = await Promise.all([
    elementMetadata(el, url).then(
      () => el.duration,
      (e: unknown) => e as Error,
    ),
    probeContainer(file),
  ]);
  el.removeAttribute('src');
  el.load();
  if (meta instanceof Error) throw meta;
  const duration = container?.duration && container.duration > 0 ? container.duration : meta;
  if (!(Number.isFinite(duration) && duration > 0)) throw new Error('Durasi audio tidak bisa dibaca.');
  return {
    duration,
    width: 0,
    height: 0,
    hasAudio: true,
    exportable: Boolean(container?.hasAudio && container.audioDecodable),
  };
}

export async function probeImage(file: File): Promise<ProbeResult & { bitmap: ImageBitmap }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Gambar ini tidak bisa dibaca.');
  }
  return { duration: 0, width: bitmap.width, height: bitmap.height, hasAudio: false, exportable: true, bitmap };
}
