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

/** Preset media sosial yang bisa di-encode browser ini (semuanya butuh MP4: H.264 + AAC). */
export async function detectPresetSupport(
  presets: readonly { id: string; width: number; height: number; videoBitrate: number }[],
): Promise<Set<string>> {
  const ok = new Set<string>();
  if (!hasWebCodecs()) return ok;
  const audio = await canEncodeAudio(CODECS.mp4.audio, {
    numberOfChannels: AUDIO_CHANNELS,
    sampleRate: AUDIO_RATE,
    quality: new Quality('medium'),
  }).catch(() => false);
  if (!audio) return ok;
  for (const p of presets) {
    const video = await canEncodeVideo(CODECS.mp4.video, {
      width: p.width,
      height: p.height,
      frameRate: 30,
      quality: new Quality({ bitrate: p.videoBitrate }),
    }).catch(() => false);
    if (video) ok.add(p.id);
  }
  return ok;
}
