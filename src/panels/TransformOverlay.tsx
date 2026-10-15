import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { layersAt } from '../engine/compositor';
import { clipBounds, scaleFromDistance, snapToCenter, topmostAt, type ClipBounds } from '../engine/clipBounds';
import { PREVIEW_FONT } from '../engine/preview';
import { patchClip } from '../state/actions';
import { editor, useEditor } from '../state/store';
import { frameSize, type Clip, type Transform } from '../timeline/model';
import { updateClip } from '../timeline/ops';

interface TransformOverlayProps {
  width: number;
  height: number;
}

type Corner = 'nw' | 'ne' | 'se' | 'sw';

type Drag =
  | { mode: 'move'; id: string; pointerId: number; x: number; y: number; origin: Transform; started: boolean }
  | { mode: 'scale'; id: string; pointerId: number; cx: number; cy: number; distance: number; origin: Transform };

/** Jarak seret minimum (px) sebelum klik dianggap geseran, agar klik biasa tidak masuk riwayat undo. */
const DRAG_THRESHOLD = 3;
/** Jarak (px pratinjau) untuk menempel ke garis tengah. */
const SNAP_PX = 6;
/** Area klik tambahan di sekitar klip kecil seperti teks. */
const HIT_PAD = 4;

let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, font: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 0;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function clipLabel(clip: Clip): string {
  switch (clip.type) {
    case 'text':
      return `Teks ${clip.text.split('\n')[0] ?? ''}`.trim();
    case 'video':
      return `Video ${clip.name}`;
    case 'image':
      return `Gambar ${clip.name}`;
    default:
      return 'Klip';
  }
}

function setTransform(clip: Clip, patch: Partial<Transform>): Clip {
  return 'transform' in clip ? { ...clip, transform: { ...clip.transform, ...patch } } : clip;
}

/**
 * Memilih, menggeser, dan mengubah skala klip langsung di pratinjau. Klik lapisan untuk memilihnya,
 * seret untuk memindah (menempel ke garis tengah), tarik sudut untuk mengubah skala.
 */
export function TransformOverlay({ width, height }: TransformOverlayProps) {
  const tool = useEditor((s) => s.tool);
  const project = useEditor((s) => s.project);
  const playhead = useEditor((s) => s.playhead);
  const selectedId = useEditor((s) => (s.selection.length === 1 ? s.selection[0] : null));
  const media = useEditor((s) => s.media);
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState({ x: false, y: false });

  if (tool === 'crop' || width === 0 || height === 0) return null;

  const ref = frameSize(project.aspect);
  const unit = height / ref.height;
  const env = {
    width,
    height,
    unit,
    fontFamily: PREVIEW_FONT,
    measureText,
    mediaSize: (id: string) => {
      const m = media.find((item) => item.id === id);
      return m && m.width > 0 ? { width: m.width, height: m.height } : null;
    },
  };
  const bounds: ClipBounds[] = [];
  for (const layer of layersAt(project, playhead)) {
    if (layer.kind !== 'visual') continue;
    const b = clipBounds(layer.clip, env);
    if (b) bounds.push(b);
  }
  const selected = bounds.find((b) => b.id === selectedId) ?? null;
  const selectedClip = selected ? project.clips.find((c) => c.id === selected.id) : undefined;

  const local = (e: PointerEvent<HTMLElement>) => {
    const rect = layerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  /** Klip terpilih didahulukan walau tertutup lapisan lain, supaya bisa terus diseret. */
  const targetAt = (x: number, y: number) =>
    selected && topmostAt([selected], x, y, HIT_PAD) ? selected : topmostAt(bounds, x, y, HIT_PAD);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = local(e);
    const target = targetAt(p.x, p.y);
    const s = editor.get();
    if (!target) {
      if (s.selection.length > 0) s.select([]);
      return;
    }
    const clip = s.project.clips.find((c) => c.id === target.id);
    if (!clip || !('transform' in clip)) return;
    e.preventDefault();
    if (selectedId !== target.id) s.select([target.id]);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode: 'move', id: target.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, origin: clip.transform, started: false };
  };

  const onHandleDown = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0 || !selected || !selectedClip || !('transform' in selectedClip)) return;
    e.preventDefault();
    e.stopPropagation();
    // Tangkapan di lapisan agar gerakan tetap diterima walau penunjuk keluar dari pegangan.
    layerRef.current?.setPointerCapture(e.pointerId);
    const p = local(e);
    drag.current = {
      mode: 'scale',
      id: selected.id,
      pointerId: e.pointerId,
      cx: selected.cx,
      cy: selected.cy,
      distance: Math.hypot(p.x - selected.cx, p.y - selected.cy),
      origin: selectedClip.transform,
    };
    editor.get().beginGesture();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) {
      // Kursor memberi tahu bahwa lapisan di bawah penunjuk bisa diseret.
      const p = local(e);
      e.currentTarget.style.cursor = targetAt(p.x, p.y) ? 'move' : '';
      return;
    }
    if (d.pointerId !== e.pointerId) return;
    const s = editor.get();

    if (d.mode === 'scale') {
      const p = local(e);
      const scale = scaleFromDistance(d.origin.scale, d.distance, Math.hypot(p.x - d.cx, p.y - d.cy));
      s.updateGesture((pr) => updateClip(pr, d.id, (c) => setTransform(c, { scale })));
      return;
    }

    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.started) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.started = true;
      s.beginGesture();
    }
    const threshold = SNAP_PX / unit;
    const sx = snapToCenter(d.origin.x + dx / unit, threshold);
    const sy = snapToCenter(d.origin.y + dy / unit, threshold);
    const x = Math.round(Math.min(ref.width, Math.max(-ref.width, sx.value)));
    const y = Math.round(Math.min(ref.height, Math.max(-ref.height, sy.value)));
    s.updateGesture((pr) => updateClip(pr, d.id, (c) => setTransform(c, { x, y })));
    if (sx.snapped !== guides.x || sy.snapped !== guides.y) setGuides({ x: sx.snapped, y: sy.snapped });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.mode === 'scale' || d.started) editor.get().endGesture();
    setGuides({ x: false, y: false });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!selectedClip || !('transform' in selectedClip)) return;
    const step = e.shiftKey ? 10 : 1;
    const t = selectedClip.transform;
    let patch: Partial<Transform> | null = null;
    if (e.key === 'ArrowLeft') patch = { x: Math.max(-ref.width, t.x - step) };
    else if (e.key === 'ArrowRight') patch = { x: Math.min(ref.width, t.x + step) };
    else if (e.key === 'ArrowUp') patch = { y: Math.max(-ref.height, t.y - step) };
    else if (e.key === 'ArrowDown') patch = { y: Math.min(ref.height, t.y + step) };
    if (!patch) return;
    e.preventDefault();
    e.stopPropagation();
    const next = patch;
    patchClip(selectedClip.id, 'x' in next ? 'x' : 'y', (c) => setTransform(c, next));
  };

  const handle = (corner: Corner, left: number, top: number) => (
    <span
      key={corner}
      className={`tf-handle tf-handle-${corner}`}
      style={{ left, top }}
      aria-hidden="true"
      onPointerDown={onHandleDown}
    />
  );

  return (
    <div
      ref={layerRef}
      className="tf-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        // Klik dua kali pada klip tidak membuka layar penuh.
        const rect = layerRef.current?.getBoundingClientRect();
        if (rect && targetAt(e.clientX - rect.left, e.clientY - rect.top)) e.stopPropagation();
      }}
    >
      {guides.x && <div className="tf-guide tf-guide-v" />}
      {guides.y && <div className="tf-guide tf-guide-h" />}
      {selected && selectedClip && (
        <div
          className="tf-anchor"
          style={{ left: selected.cx, top: selected.cy, transform: `rotate(${selected.rotation}deg)` }}
        >
          <div
            className="tf-box"
            role="group"
            tabIndex={0}
            aria-label={`${clipLabel(selectedClip)} di pratinjau. Seret untuk memindah, tarik sudut untuk mengubah skala, panah untuk menggeser.`}
            style={{ left: selected.x, top: selected.y, width: selected.w, height: selected.h }}
            onKeyDown={onKeyDown}
          />
          {handle('nw', selected.x, selected.y)}
          {handle('ne', selected.x + selected.w, selected.y)}
          {handle('se', selected.x + selected.w, selected.y + selected.h)}
          {handle('sw', selected.x, selected.y + selected.h)}
        </div>
      )}
    </div>
  );
}
