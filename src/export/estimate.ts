import { findTrack, hasAudio, isSourceTimed, type Project } from '../timeline/model';
import { CODECS, type ExportFormat, type ExportQuality } from './protocol';

/*
 * Perkiraan ukuran hasil ekspor dari bitrate yang dipakai mediabunny untuk tiap `Quality`
 * (rumus disalin dari mediabunny/src/encode.ts; tes memastikan angkanya tetap sama).
 * Encoder memakai kualitas konstan bila browser mendukung, jadi ukuran sebenarnya ikut isi video:
 * rekaman layar atau gambar diam jauh lebih kecil, rekaman kamera yang banyak gerak mendekati angka ini.
 */

const QUALITY_LEVEL: Record<ExportQuality, number> = { low: 0.25, medium: 0.5, high: 0.75 };
const VIDEO_EFFICIENCY = { avc: 1, vp9: 0.6 } as const;
const AAC_RATES = [96_000, 128_000, 160_000, 192_000];
/** Overhead kontainer MP4/WebM (indeks dan header), kira-kira. */
const CONTAINER_OVERHEAD = 1.01;

function bitrateFactor(quality: ExportQuality): number {
  return 0.3 * Math.exp(2.5538 * QUALITY_LEVEL[quality]);
}

export function videoBitrate(format: ExportFormat, width: number, height: number, quality: ExportQuality): number {
  const scale = Math.pow((width * height) / (1920 * 1080), 0.95);
  const bitrate = 3_000_000 * scale * VIDEO_EFFICIENCY[CODECS[format].video] * bitrateFactor(quality);
  return Math.ceil(bitrate / 1000) * 1000;
}

export function audioBitrate(format: ExportFormat, quality: ExportQuality): number {
  const factor = bitrateFactor(quality);
  if (CODECS[format].audio === 'aac') {
    const target = 128_000 * factor;
    return AAC_RATES.reduce((best, r) => (Math.abs(r - target) < Math.abs(best - target) ? r : best));
  }
  return Math.round(Math.max(6000, 64_000 * factor) / 1000) * 1000;
}

/** True bila ekspor akan berisi trek audio (sama dengan aturan di worker ekspor). */
export function projectHasAudio(project: Project): boolean {
  return project.clips.some(
    (c) => isSourceTimed(c) && hasAudio(c) && c.volume > 0 && !findTrack(project, c.trackId)?.muted,
  );
}

export interface EstimateInput {
  format: ExportFormat;
  width: number;
  height: number;
  quality: ExportQuality;
  /** Detik. */
  seconds: number;
  withAudio: boolean;
}

/** Perkiraan ukuran berkas dalam byte. */
export function estimateBytes(o: EstimateInput): number {
  const bps = videoBitrate(o.format, o.width, o.height, o.quality) + (o.withAudio ? audioBitrate(o.format, o.quality) : 0);
  return Math.round(((bps * o.seconds) / 8) * CONTAINER_OVERHEAD);
}
