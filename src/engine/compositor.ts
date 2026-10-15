import {
  frameSize,
  type ColorAdjust,
  type EffectClip,
  type ImageClip,
  type Project,
  type TextClip,
  type TextColorId,
  type VideoClip,
  type VisualClip,
} from '../timeline/model';
import { effectDef } from './effects';

/*
 * Compositor dipakai bersama oleh pratinjau (main thread) dan ekspor (worker),
 * sehingga hasil ekspor sama dengan yang terlihat di pratinjau. Modul ini tidak menyentuh DOM.
 */

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FrameSource {
  image: CanvasImageSource;
  /** Dimensi tampilan sumber (setelah rotasi metadata). */
  width: number;
  height: number;
}

export type Layer = { kind: 'visual'; clip: VisualClip } | { kind: 'effect'; clip: EffectClip };

export interface DrawOptions {
  ctx: Ctx2D;
  width: number;
  height: number;
  textColors: Record<TextColorId, string>;
  fontFamily: string;
  /** Kanvas bantu seukuran keluaran untuk efek penyesuaian. */
  scratch: () => { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D } | null;
  /** Mengembalikan frame sumber untuk klip video/gambar, atau null bila belum siap. */
  resolve: (clip: VideoClip | ImageClip) => FrameSource | null;
}

/** Latar video keluaran. Ini isi video (seperti letterbox), bukan warna antarmuka. */
export const VIDEO_BACKGROUND = '#000000';

/** Lapisan aktif di frame tertentu, dari bawah ke atas. */
export function layersAt(project: Project, frame: number): Layer[] {
  const layers: Layer[] = [];
  for (let i = project.tracks.length - 1; i >= 0; i--) {
    const track = project.tracks[i];
    if (!track || track.hidden || track.kind === 'audio') continue;
    for (const clip of project.clips) {
      if (clip.trackId !== track.id || frame < clip.start || frame >= clip.start + clip.duration) continue;
      if (clip.type === 'effect') layers.push({ kind: 'effect', clip });
      else if (clip.type !== 'audio') layers.push({ kind: 'visual', clip });
    }
  }
  return layers;
}

export function adjustFilter(a: ColorAdjust): string {
  if (a.brightness === 0 && a.contrast === 0 && a.saturation === 0) return 'none';
  const parts: string[] = [];
  if (a.brightness !== 0) parts.push(`brightness(${(1 + a.brightness / 100).toFixed(3)})`);
  if (a.contrast !== 0) parts.push(`contrast(${(1 + a.contrast / 100).toFixed(3)})`);
  if (a.saturation !== 0) parts.push(`saturate(${(1 + a.saturation / 100).toFixed(3)})`);
  return parts.join(' ');
}

/**
 * Persegi gambar utuh (sebelum crop) dalam koordinat lokal berpusat di titik tengah klip,
 * dalam piksel keluaran. Skala 1 = pas di dalam bingkai (contain).
 */
export function mediaRect(srcW: number, srcH: number, outW: number, outH: number, scale: number) {
  const fit = Math.min(outW / srcW, outH / srcH) * scale;
  const w = srcW * fit;
  const h = srcH * fit;
  return { x: -w / 2, y: -h / 2, w, h };
}

function drawMedia(o: DrawOptions, clip: VideoClip | ImageClip, unit: number) {
  const src = o.resolve(clip);
  if (!src || src.width <= 0 || src.height <= 0) return;
  const { ctx } = o;
  const t = clip.transform;
  const c = clip.crop;
  const full = mediaRect(src.width, src.height, o.width, o.height, t.scale);
  const sx = c.left * src.width;
  const sy = c.top * src.height;
  const sw = Math.max(1, src.width * (1 - c.left - c.right));
  const sh = Math.max(1, src.height * (1 - c.top - c.bottom));
  ctx.save();
  ctx.translate(o.width / 2 + t.x * unit, o.height / 2 + t.y * unit);
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.globalAlpha = t.opacity;
  ctx.filter = adjustFilter(clip.adjust);
  ctx.drawImage(
    src.image,
    sx,
    sy,
    sw,
    sh,
    full.x + c.left * full.w,
    full.y + c.top * full.h,
    (sw / src.width) * full.w,
    (sh / src.height) * full.h,
  );
  ctx.restore();
}

export function textFont(clip: TextClip, unit: number, family: string): string {
  return `600 ${Math.max(1, clip.fontSize * unit).toFixed(2)}px ${family}`;
}

export const TEXT_LINE_HEIGHT = 1.2;

function drawText(o: DrawOptions, clip: TextClip, unit: number) {
  const text = clip.text;
  if (!text.trim()) return;
  const { ctx } = o;
  const t = clip.transform;
  const lines = text.split('\n');
  const size = clip.fontSize * unit;
  ctx.save();
  ctx.translate(o.width / 2 + t.x * unit, o.height / 2 + t.y * unit);
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
  if (t.scale !== 1) ctx.scale(t.scale, t.scale);
  ctx.globalAlpha = t.opacity;
  ctx.filter = adjustFilter(clip.adjust);
  ctx.font = textFont(clip, unit, o.fontFamily);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.textColors[clip.textColor];
  const lh = size * TEXT_LINE_HEIGHT;
  const top = -((lines.length - 1) * lh) / 2;
  lines.forEach((line, i) => ctx.fillText(line, 0, top + i * lh));
  ctx.restore();
}

function applyEffect(o: DrawOptions, clip: EffectClip) {
  const def = effectDef(clip.effect);
  const scratch = o.scratch();
  if (!def || !scratch) return;
  const alpha = Math.min(1, Math.max(0, clip.opacity * def.mix));
  if (alpha <= 0) return;
  scratch.ctx.globalCompositeOperation = 'copy';
  scratch.ctx.drawImage(o.ctx.canvas, 0, 0);
  scratch.ctx.globalCompositeOperation = 'source-over';
  const { ctx } = o;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = def.filter(o.height);
  ctx.drawImage(scratch.canvas, 0, 0);
  ctx.restore();
}

/** Menggambar satu frame proyek ke kanvas keluaran. */
export function drawFrame(o: DrawOptions, project: Project, frame: number): void {
  const { ctx, width, height } = o;
  const ref = frameSize(project.aspect);
  // Satuan: piksel keluaran per piksel bingkai acuan.
  const unit = height / ref.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = VIDEO_BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  for (const layer of layersAt(project, frame)) {
    if (layer.kind === 'effect') {
      applyEffect(o, layer.clip);
      continue;
    }
    const clip = layer.clip;
    if (clip.type === 'text') drawText(o, clip, unit);
    else drawMedia(o, clip, unit);
  }
}
