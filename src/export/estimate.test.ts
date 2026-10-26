import { describe, expect, it } from 'vitest';
import { audio, projectWith, video } from '../timeline/test-helpers';
import type { ExportFormat, ExportQuality } from './protocol';
import { audioBitrate, estimateBytes, projectHasAudio, videoBitrate } from './estimate';

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
  it('memakai bitrate yang cukup untuk rekaman kamera', () => {
    // H.264 1080p30: rendah / sedang / tinggi.
    expect(videoBitrate('mp4', 1920, 1080, 'low')).toBe(3_732_000);
    expect(videoBitrate('mp4', 1920, 1080, 'medium')).toBe(6_221_000);
    expect(videoBitrate('mp4', 1920, 1080, 'high')).toBe(9_953_000);
    // 720p sedang jauh di atas bawaan mediabunny (sekitar 1,5 Mbps) yang membuat hasil kotak-kotak.
    expect(videoBitrate('mp4', 1280, 720, 'medium')).toBeGreaterThan(2_500_000);
    // VP9 lebih efisien.
    expect(videoBitrate('webm', 1920, 1080, 'medium')).toBeLessThan(videoBitrate('mp4', 1920, 1080, 'medium'));
    // Mengikuti laju frame.
    expect(videoBitrate('mp4', 1280, 720, 'medium', 60)).toBe(videoBitrate('mp4', 1280, 720, 'medium', 30) * 2);
  });

  it('bitrate naik sesuai kualitas dan resolusi', () => {
    for (const format of FORMATS) {
      for (const [w, h] of SIZES) {
        const [low, mid, high] = QUALITIES.map((q) => videoBitrate(format, w, h, q));
        expect(low).toBeLessThan(mid ?? 0);
        expect(mid).toBeLessThan(high ?? 0);
      }
      expect(videoBitrate(format, 3840, 2160, 'medium')).toBeGreaterThan(videoBitrate(format, 1920, 1080, 'medium'));
      expect(audioBitrate(format, 'low')).toBeLessThan(audioBitrate(format, 'high'));
    }
    expect(audioBitrate('mp4', 'medium')).toBe(128_000);
    expect(audioBitrate('webm', 'medium')).toBe(96_000);
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
