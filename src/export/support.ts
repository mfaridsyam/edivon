import { Quality, canEncodeAudio, canEncodeVideo } from 'mediabunny';
import { sizeForShortSide, type Aspect } from '../timeline/model';
import { AUDIO_CHANNELS, AUDIO_RATE, CODECS, type ExportFormat, type ExportResolution } from './protocol';

export const RESOLUTIONS: readonly ExportResolution[] = [720, 1080, 2160];

/** Ukuran keluaran (genap) untuk rasio dan sisi pendek tertentu. */
export function outputSize(aspect: Aspect, short: ExportResolution): { width: number; height: number } {
  return sizeForShortSide(aspect, short);
}

export function hasWebCodecs(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

export interface FormatSupport {
  format: ExportFormat;
  /** Resolusi yang bisa di-encode untuk format ini. */
  resolutions: ExportResolution[];
}

/** Memeriksa kombinasi format dan resolusi yang bisa di-encode browser ini. */
export async function detectSupport(aspect: Aspect): Promise<FormatSupport[]> {
  if (!hasWebCodecs()) return [];
  const results: FormatSupport[] = [];
  for (const format of ['mp4', 'webm'] as const) {
    const codecs = CODECS[format];
    const audioOk = await canEncodeAudio(codecs.audio, {
      numberOfChannels: AUDIO_CHANNELS,
      sampleRate: AUDIO_RATE,
      quality: new Quality('medium'),
    }).catch(() => false);
    if (!audioOk) continue;
    const resolutions: ExportResolution[] = [];
    for (const r of RESOLUTIONS) {
      const { width, height } = outputSize(aspect, r);
      const ok = await canEncodeVideo(codecs.video, { width, height, frameRate: 30, quality: new Quality('medium') }).catch(
        () => false,
      );
      if (ok) resolutions.push(r);
    }
    if (resolutions.length > 0) results.push({ format, resolutions });
  }
  return results;
}

/**
 * Resolusi (sisi pendek) yang bisa dipakai preset media sosial di browser ini. Preset butuh MP4
 * (H.264 + AAC); bentuk tegak dan lanskap sama-sama diperiksa. Kosong bila MP4 tidak didukung.
 */
export async function detectSocialSupport(): Promise<(720 | 1080)[]> {
  if (!hasWebCodecs()) return [];
  const audio = await canEncodeAudio(CODECS.mp4.audio, {
    numberOfChannels: AUDIO_CHANNELS,
    sampleRate: AUDIO_RATE,
    quality: new Quality('medium'),
  }).catch(() => false);
  if (!audio) return [];
  const ok: (720 | 1080)[] = [];
  for (const short of [720, 1080] as const) {
    const long = Math.round((short * 16) / 9 / 2) * 2;
    let all = true;
    for (const [width, height] of [
      [short, long],
      [long, short],
    ] as const) {
      const video = await canEncodeVideo(CODECS.mp4.video, {
        width,
        height,
        frameRate: 30,
        quality: new Quality({ bitrate: 8_000_000 }),
      }).catch(() => false);
      all &&= video;
    }
    if (all) ok.push(short);
  }
  return ok;
}
