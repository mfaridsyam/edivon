import { FPS } from './time';

export type TrackKind = 'video' | 'audio' | 'text' | 'effect';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  /** Lapisan disembunyikan (tombol mata). */
  hidden: boolean;
  /** Audio lajur dibisukan (tombol volume). */
  muted: boolean;
}

export type Aspect = '16:9' | '9:16' | '1:1';
export type Speed = 0.5 | 1 | 2 | 4;
export const SPEEDS: readonly Speed[] = [0.5, 1, 2, 4];

export type TextColorId = 'white' | 'ink' | 'accent' | 'danger';
export type EffectId = 'grayscale' | 'sepia' | 'warm' | 'cool' | 'fade' | 'blur';

/** Posisi dalam piksel bingkai acuan (sisi pendek 1080), titik pusat di tengah bingkai. */
export interface Transform {
  x: number;
  y: number;
  /** 1 = pas di dalam bingkai (contain). */
  scale: number;
  /** Derajat, searah jarum jam. */
  rotation: number;
  /** 0..1 */
  opacity: number;
}

/** −100..100, 0 = tanpa perubahan. */
export interface ColorAdjust {
  brightness: number;
  contrast: number;
  saturation: number;
}

/** Fraksi 0..1 yang dipotong dari tiap sisi sumber. */
export interface Crop {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface ClipBase {
  id: string;
  trackId: string;
  /** Frame awal di timeline. */
  start: number;
  /** Durasi di timeline, dalam frame (≥ 1). */
  duration: number;
}

interface Visual {
  transform: Transform;
  adjust: ColorAdjust;
}

interface SourceTimed {
  mediaId: string;
  name: string;
  /** Detik di sumber pada awal klip. */
  in: number;
  /** Durasi total sumber dalam detik, untuk membatasi trim. */
  sourceDuration: number;
  speed: Speed;
  /** 0..2, 1 = asli. */
  volume: number;
}

export interface VideoClip extends ClipBase, Visual, SourceTimed {
  type: 'video';
  crop: Crop;
  hasAudio: boolean;
}

export interface ImageClip extends ClipBase, Visual {
  type: 'image';
  mediaId: string;
  name: string;
  crop: Crop;
}

export interface AudioClip extends ClipBase, SourceTimed {
  type: 'audio';
}

export interface TextClip extends ClipBase, Visual {
  type: 'text';
  text: string;
  /** Ukuran dalam piksel bingkai acuan. */
  fontSize: number;
  textColor: TextColorId;
}

export interface EffectClip extends ClipBase {
  type: 'effect';
  effect: EffectId;
  /** Kekuatan efek 0..1, diatur lewat opasitas. */
  opacity: number;
}

export type Clip = VideoClip | ImageClip | AudioClip | TextClip | EffectClip;
export type ClipType = Clip['type'];
export type VisualClip = VideoClip | ImageClip | TextClip;
export type MediaClip = VideoClip | AudioClip;

export interface Project {
  name: string;
  aspect: Aspect;
  tracks: Track[];
  clips: Clip[];
}

/* ---------- Konstanta dan pembuat objek ---------- */

export const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
export const DEFAULT_ADJUST: ColorAdjust = { brightness: 0, contrast: 0, saturation: 0 };
export const DEFAULT_CROP: Crop = { left: 0, right: 0, top: 0, bottom: 0 };

export const IMAGE_DEFAULT_FRAMES = 5 * FPS;
export const TEXT_DEFAULT_FRAMES = 3 * FPS;
export const EFFECT_DEFAULT_FRAMES = 3 * FPS;

const TRACK_LABEL: Record<TrackKind, string> = {
  video: 'Video',
  audio: 'Audio',
  text: 'Teks',
  effect: 'Efek',
};

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}-${idCounter}`;
}

export function frameSize(aspect: Aspect): { width: number; height: number } {
  switch (aspect) {
    case '16:9':
      return { width: 1920, height: 1080 };
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
  }
}

export function createProject(): Project {
  return {
    name: 'Proyek tanpa judul',
    aspect: '16:9',
    tracks: [
      { id: 'track-text-1', kind: 'text', name: 'Teks', hidden: false, muted: false },
      { id: 'track-video-2', kind: 'video', name: 'Video 2', hidden: false, muted: false },
      { id: 'track-video-1', kind: 'video', name: 'Video 1', hidden: false, muted: false },
      { id: 'track-audio-1', kind: 'audio', name: 'Audio 1', hidden: false, muted: false },
    ],
    clips: [],
  };
}

/* ---------- Kueri ---------- */

export function clipEnd(clip: Clip): number {
  return clip.start + clip.duration;
}

export function projectDuration(project: Project): number {
  let end = 0;
  for (const c of project.clips) end = Math.max(end, clipEnd(c));
  return end;
}

export function findClip(project: Project, id: string): Clip | undefined {
  return project.clips.find((c) => c.id === id);
}

export function findTrack(project: Project, id: string): Track | undefined {
  return project.tracks.find((t) => t.id === id);
}

/** Klip pada satu lajur, terurut menurut waktu mulai. */
export function clipsOnTrack(project: Project, trackId: string): Clip[] {
  return project.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
}

export function trackAccepts(kind: TrackKind, type: ClipType): boolean {
  switch (kind) {
    case 'video':
      return type === 'video' || type === 'image';
    case 'audio':
      return type === 'audio';
    case 'text':
      return type === 'text';
    case 'effect':
      return type === 'effect';
  }
}

export function trackKindFor(type: ClipType): TrackKind {
  switch (type) {
    case 'video':
    case 'image':
      return 'video';
    case 'audio':
      return 'audio';
    case 'text':
      return 'text';
    case 'effect':
      return 'effect';
  }
}

export function isVisual(clip: Clip): clip is VisualClip {
  return clip.type === 'video' || clip.type === 'image' || clip.type === 'text';
}

export function isSourceTimed(clip: Clip): clip is MediaClip {
  return clip.type === 'video' || clip.type === 'audio';
}

export function hasAudio(clip: Clip): boolean {
  return clip.type === 'audio' || (clip.type === 'video' && clip.hasAudio);
}

/** Durasi maksimum klip di timeline (frame) yang masih didukung sumbernya. */
export function maxDuration(clip: Clip): number {
  if (!isSourceTimed(clip)) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor(((clip.sourceDuration - clip.in) / clip.speed) * FPS + 1e-6));
}

/** Detik sumber untuk frame timeline tertentu di dalam klip. */
export function sourceTimeAt(clip: MediaClip, frame: number): number {
  return clip.in + ((frame - clip.start) / FPS) * clip.speed;
}

export function clipLabel(clip: Clip): string {
  switch (clip.type) {
    case 'text':
      return clip.text.trim() || 'Teks kosong';
    case 'effect':
      return EFFECT_LABEL[clip.effect];
    default:
      return clip.name;
  }
}

export const EFFECT_LABEL: Record<EffectId, string> = {
  grayscale: 'Hitam putih',
  sepia: 'Sepia',
  warm: 'Hangat',
  cool: 'Sejuk',
  fade: 'Pudar',
  blur: 'Kabur',
};

export const CLIP_TYPE_LABEL: Record<ClipType, string> = {
  video: 'Video',
  image: 'Gambar',
  audio: 'Audio',
  text: 'Teks',
  effect: 'Efek',
};

export function nextTrackName(project: Project, kind: TrackKind): string {
  const label = TRACK_LABEL[kind];
  let n = 1;
  const names = new Set(project.tracks.map((t) => t.name));
  while (names.has(`${label} ${n}`) || (kind === 'text' && n === 1 && names.has(label))) n += 1;
  return `${label} ${n}`;
}
