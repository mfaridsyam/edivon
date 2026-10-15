import { TEXT_LINE_HEIGHT, mediaRect, textFont } from './compositor';
import type { VisualClip } from '../timeline/model';

/*
 * Batas lapisan visual di pratinjau, dengan geometri yang sama seperti compositor. Dipakai untuk
 * memilih, menggeser, dan mengubah skala klip langsung di pratinjau.
 */

export interface ClipBounds {
  id: string;
  /** Titik pusat transformasi (piksel pratinjau). */
  cx: number;
  cy: number;
  /** Derajat, searah jarum jam. */
  rotation: number;
  /** Persegi terlihat dalam koordinat lokal relatif terhadap (cx, cy), sebelum rotasi. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoundsEnv {
  /** Ukuran pratinjau dalam piksel. */
  width: number;
  height: number;
  /** Piksel pratinjau per piksel bingkai acuan. */
  unit: number;
  fontFamily: string;
  mediaSize: (mediaId: string) => { width: number; height: number } | null;
  measureText: (text: string, font: string) => number;
}

export function clipBounds(clip: VisualClip, env: BoundsEnv): ClipBounds | null {
  const t = clip.transform;
  const base = { id: clip.id, cx: env.width / 2 + t.x * env.unit, cy: env.height / 2 + t.y * env.unit, rotation: t.rotation };

  if (clip.type === 'text') {
    if (!clip.text.trim()) return null;
    const lines = clip.text.split('\n');
    const font = textFont(clip, env.unit, env.fontFamily);
    const lineWidth = Math.max(...lines.map((l) => env.measureText(l, font)));
    const w = lineWidth * t.scale;
    const h = lines.length * clip.fontSize * env.unit * TEXT_LINE_HEIGHT * t.scale;
    return { ...base, x: -w / 2, y: -h / 2, w, h };
  }

  const size = env.mediaSize(clip.mediaId);
  if (!size || size.width <= 0 || size.height <= 0) return null;
  const full = mediaRect(size.width, size.height, env.width, env.height, t.scale);
  const c = clip.crop;
  return {
    ...base,
    x: full.x + c.left * full.w,
    y: full.y + c.top * full.h,
    w: full.w * (1 - c.left - c.right),
    h: full.h * (1 - c.top - c.bottom),
  };
}

/** True bila titik (px, py) ada di dalam batas, termasuk rotasinya. `pad` memperluas area klik. */
export function hitBounds(b: ClipBounds, px: number, py: number, pad = 0): boolean {
  const rad = (-b.rotation * Math.PI) / 180;
  const dx = px - b.cx;
  const dy = py - b.cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return lx >= b.x - pad && lx <= b.x + b.w + pad && ly >= b.y - pad && ly <= b.y + b.h + pad;
}

/** Klip teratas di titik itu. `bounds` berurutan dari bawah ke atas, seperti urutan gambar. */
export function topmostAt(bounds: readonly ClipBounds[], px: number, py: number, pad = 0): ClipBounds | null {
  for (let i = bounds.length - 1; i >= 0; i--) {
    const b = bounds[i];
    if (b && hitBounds(b, px, py, pad)) return b;
  }
  return null;
}

/** Menempelkan nilai ke 0 (garis tengah bingkai) bila cukup dekat. */
export function snapToCenter(value: number, threshold: number): { value: number; snapped: boolean } {
  return Math.abs(value) <= threshold ? { value: 0, snapped: true } : { value, snapped: false };
}

export const SCALE_MIN = 0.1;
export const SCALE_MAX = 4;

/** Skala baru dari jarak penunjuk ke pusat, relatif terhadap jarak saat mulai menyeret. */
export function scaleFromDistance(startScale: number, startDistance: number, distance: number): number {
  if (startDistance <= 0) return startScale;
  const next = startScale * (distance / startDistance);
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(next * 100) / 100));
}
