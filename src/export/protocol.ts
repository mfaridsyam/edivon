import type { Project, TextColorId } from '../timeline/model';

export type ExportFormat = 'mp4' | 'webm';
export type ExportQuality = 'low' | 'medium' | 'high';
/** Sisi pendek bingkai keluaran dalam piksel. */
export type ExportResolution = 720 | 1080 | 2160;

export interface ExportSettings {
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  quality: ExportQuality;
  /** Bitrate video (bps) dari preset; bila kosong dihitung dari resolusi dan kualitas. */
  videoBitrate?: number;
  /** Bitrate audio (bps) dari preset. */
  audioBitrate?: number;
  /** Area komposisi di dalam bingkai keluaran bila rasionya berbeda (sisanya hitam). */
  inner?: { x: number; y: number; width: number; height: number };
}

export interface ExportMedia {
  id: string;
  kind: 'video' | 'audio' | 'image';
  name: string;
  file: File;
}

export interface FontSource {
  family: string;
  url: string;
  weight: string;
  unicodeRange: string;
}

/** Pesan dari main thread ke worker. */
export interface StartMessage {
  type: 'start';
  project: Project;
  media: ExportMedia[];
  settings: ExportSettings;
  textColors: Record<TextColorId, string>;
  fontFamily: string;
  fonts: FontSource[];
}

/** Pesan dari worker ke main thread. */
export type WorkerMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'warning'; message: string }
  | { type: 'done'; buffer: ArrayBuffer; mimeType: string; extension: string }
  | { type: 'error'; message: string };

export const CODECS: Record<ExportFormat, { video: 'avc' | 'vp9'; audio: 'aac' | 'opus'; label: string }> = {
  mp4: { video: 'avc', audio: 'aac', label: 'MP4 (H.264)' },
  webm: { video: 'vp9', audio: 'opus', label: 'WebM (VP9)' },
};

export const AUDIO_RATE = 48000;
export const AUDIO_CHANNELS = 2;
