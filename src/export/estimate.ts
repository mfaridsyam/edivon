import { findTrack, hasAudio, isSourceTimed, type Project } from '../timeline/model';
import { CODECS, type ExportFormat, type ExportQuality } from './protocol';

/*
 * Bitrate ekspor, dipakai bersama oleh worker (target encoder) dan dialog (perkiraan ukuran).
 *
 * Bitrate bawaan mediabunny untuk Quality('medium') hanya sekitar 1,5 Mbps di 720p dan 3,2 Mbps di 1080p.
 * Untuk rekaman kamera, terutama CCTV yang berderau, itu menghasilkan blok-blok kotak. Di sini targetnya
 * dihitung dari bit per piksel per frame, mendekati anjuran umum untuk unggahan video
 * (1080p30 H.264: sekitar 4 / 6 / 10 Mbps untuk rendah / sedang / tinggi).
 */

/** Bit per piksel per frame untuk H.264. */
const VIDEO_BPP: Record<ExportQuality, number> = { low: 0.06, medium: 0.1, high: 0.16 };
/** VP9 butuh bitrate lebih kecil untuk mutu yang setara. */
const VIDEO_EFFICIENCY = { avc: 1, vp9: 0.7 } as const;
const MIN_VIDEO_BITRATE = 500_000;
const AUDIO_BITRATE: Record<'aac' | 'opus', Record<ExportQuality, number>> = {
  aac: { low: 96_000, medium: 128_000, high: 192_000 },
  opus: { low: 64_000, medium: 96_000, high: 128_000 },
};
/** Overhead kontainer MP4/WebM (indeks dan header), kira-kira. */
const CONTAINER_OVERHEAD = 1.01;

export function videoBitrate(
  format: ExportFormat,
  width: number,
  height: number,
  quality: ExportQuality,
  fps = 30,
): number {
  const bitrate = width * height * fps * VIDEO_BPP[quality] * VIDEO_EFFICIENCY[CODECS[format].video];
  return Math.max(MIN_VIDEO_BITRATE, Math.round(bitrate / 1000) * 1000);
}

export function audioBitrate(format: ExportFormat, quality: ExportQuality): number {
  return AUDIO_BITRATE[CODECS[format].audio][quality];
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

/** Ukuran berkas (byte) dari bitrate total dan durasi, termasuk overhead kontainer. */
export function bytesFor(bitsPerSecond: number, seconds: number): number {
  return Math.round(((bitsPerSecond * seconds) / 8) * CONTAINER_OVERHEAD);
}

/** Perkiraan ukuran berkas dalam byte. */
export function estimateBytes(o: EstimateInput): number {
  const bps = videoBitrate(o.format, o.width, o.height, o.quality) + (o.withAudio ? audioBitrate(o.format, o.quality) : 0);
  return bytesFor(bps, o.seconds);
}
