import { Quality } from 'mediabunny';
import { describe, expect, it } from 'vitest';
import { audio, projectWith, video } from '../timeline/test-helpers';
import { CODECS, type ExportFormat, type ExportQuality } from './protocol';
import { audioBitrate, estimateBytes, projectHasAudio, videoBitrate } from './estimate';

/** Bitrate yang benar-benar dipakai mediabunny (metode internal, hanya untuk memastikan rumus kita sama). */
interface InternalQuality {
  _toVideoBitrate(codec: string, width: number, height: number): number;
  _toAudioBitrate(codec: string): number;
}

const FORMATS: ExportFormat[] = ['mp4', 'webm'];
const QUALITIES: ExportQuality[] = ['low', 'medium', 'high'];
const SIZES = [
  [1280, 720],
  [1920, 1080],
  [3840, 2160],
  [1080, 1920],
  [1080, 1080],
] as const;

describe('perkiraan ukuran ekspor', () => {
  it('memakai bitrate yang sama dengan mediabunny', () => {
    for (const format of FORMATS) {
      for (const quality of QUALITIES) {
        const q = new Quality(quality) as unknown as InternalQuality;
        for (const [w, h] of SIZES) {
          expect(videoBitrate(format, w, h, quality)).toBe(q._toVideoBitrate(CODECS[format].video, w, h));
        }
        expect(audioBitrate(format, quality)).toBe(q._toAudioBitrate(CODECS[format].audio));
      }
    }
  });

  it('menghitung byte dari bitrate dan durasi', () => {
    const base = { format: 'mp4', width: 1280, height: 720, quality: 'medium', seconds: 60 } as const;
    const silent = estimateBytes({ ...base, withAudio: false });
    const withAudio = estimateBytes({ ...base, withAudio: true });
    expect(silent).toBe(Math.round(((videoBitrate('mp4', 1280, 720, 'medium') * 60) / 8) * 1.01));
    expect(withAudio - silent).toBe(Math.round(((audioBitrate('mp4', 'medium') * 60) / 8) * 1.01));
    expect(estimateBytes({ ...base, seconds: 120, withAudio: false })).toBeCloseTo(silent * 2, -1);
    expect(estimateBytes({ ...base, quality: 'high', withAudio: false })).toBeGreaterThan(silent);
  });

  it('hanya menghitung audio bila ada klip yang terdengar', () => {
    const silentVideo = { ...video('v', 0, 30), hasAudio: false };
    expect(projectHasAudio(projectWith(silentVideo))).toBe(false);
    expect(projectHasAudio(projectWith(video('v', 0, 30)))).toBe(true);
    expect(projectHasAudio(projectWith({ ...video('v', 0, 30), volume: 0 }))).toBe(false);

    const p = projectWith(audio('a', 0, 30));
    const muted = { ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, muted: true } : t)) };
    expect(projectHasAudio(p)).toBe(true);
    expect(projectHasAudio(muted)).toBe(false);
  });
});
