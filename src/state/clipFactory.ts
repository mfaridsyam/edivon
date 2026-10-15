import {
  DEFAULT_ADJUST,
  DEFAULT_CROP,
  DEFAULT_TRANSFORM,
  EFFECT_DEFAULT_FRAMES,
  IMAGE_DEFAULT_FRAMES,
  TEXT_DEFAULT_FRAMES,
  frameSize,
  newId,
  type Aspect,
  type Clip,
  type EffectClip,
  type EffectId,
  type TextClip,
} from '../timeline/model';
import { FPS } from '../timeline/time';
import type { MediaItem } from './media';

export type TextPresetId = 'title' | 'subtitle' | 'caption';

export interface TextPreset {
  id: TextPresetId;
  label: string;
  text: string;
  fontSize: number;
  /** Posisi vertikal sebagai fraksi tinggi bingkai dari tengah. */
  yFrac: number;
}

export const TEXT_PRESETS: readonly TextPreset[] = [
  { id: 'title', label: 'Judul', text: 'Judul', fontSize: 104, yFrac: 0 },
  { id: 'subtitle', label: 'Subjudul', text: 'Subjudul', fontSize: 64, yFrac: 0.12 },
  { id: 'caption', label: 'Keterangan', text: 'Keterangan', fontSize: 44, yFrac: 0.38 },
];

/** Durasi klip (frame) untuk media saat pertama ditaruh di timeline. */
export function mediaClipFrames(media: MediaItem): number {
  if (media.kind === 'image') return IMAGE_DEFAULT_FRAMES;
  return Math.max(1, Math.floor(media.duration * FPS + 1e-6));
}

export function clipFromMedia(media: MediaItem, trackId: string, start: number): Clip {
  const base = { id: newId('clip'), trackId, start, duration: mediaClipFrames(media) };
  switch (media.kind) {
    case 'image':
      return {
        ...base,
        type: 'image',
        mediaId: media.id,
        name: media.name,
        transform: DEFAULT_TRANSFORM,
        adjust: DEFAULT_ADJUST,
        crop: DEFAULT_CROP,
      };
    case 'video':
      return {
        ...base,
        type: 'video',
        mediaId: media.id,
        name: media.name,
        in: 0,
        sourceDuration: media.duration,
        speed: 1,
        volume: 1,
        hasAudio: media.hasAudio,
        transform: DEFAULT_TRANSFORM,
        adjust: DEFAULT_ADJUST,
        crop: DEFAULT_CROP,
      };
    case 'audio':
      return {
        ...base,
        type: 'audio',
        mediaId: media.id,
        name: media.name,
        in: 0,
        sourceDuration: media.duration,
        speed: 1,
        volume: 1,
      };
  }
}

export function textClipFromPreset(
  preset: TextPreset,
  aspect: Aspect,
  trackId: string,
  start: number,
  duration = TEXT_DEFAULT_FRAMES,
): TextClip {
  const { height } = frameSize(aspect);
  return {
    id: newId('clip'),
    type: 'text',
    trackId,
    start,
    duration,
    text: preset.text,
    fontSize: preset.fontSize,
    textColor: 'white',
    transform: { ...DEFAULT_TRANSFORM, y: Math.round(preset.yFrac * height) },
    adjust: DEFAULT_ADJUST,
  };
}

export function effectClip(effect: EffectId, trackId: string, start: number, duration = EFFECT_DEFAULT_FRAMES): EffectClip {
  return { id: newId('clip'), type: 'effect', trackId, start, duration, effect, opacity: 1 };
}
