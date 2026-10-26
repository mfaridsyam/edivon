import { memo, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { deleteSelection, selectClip } from '../../state/actions';
import { editor } from '../../state/store';
import {
  CLIP_TYPE_LABEL,
  clipEnd,
  clipLabel,
  findTrack,
  trackAccepts,
  type Clip,
} from '../../timeline/model';
import { moveClip, nudgeClip, trimEnd, trimStart } from '../../timeline/ops';
import { snapDelta, snapTargets, snapThreshold } from '../../timeline/snap';
import { FPS, formatTimecode, spokenDuration } from '../../timeline/time';
import { IconEffect, IconFilm, IconImage, IconMusic, IconText } from '../../ui/icons';
import {
  DRAG_THRESHOLD,
  EDGE_PX,
  EDGE_PX_TOUCH,
  LONG_PRESS_MS,
  ROW_GAP,
  TOUCH_SLOP,
  TRACK_H,
  frameToX,
  useTimelineUi,
  xToFrame,
} from './geometry';
import { clipToolAction } from './clipTools';

type DragMode = 'move' | 'trim-start' | 'trim-end';

interface DragState {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  origStart: number;
  origEnd: number;
  origTrackId: string;
}

interface ClipViewProps {
  clip: Clip;
  trackIndex: number;
  selected: boolean;
  zoom: number;
  /** Id lajur per indeks baris, untuk menentukan lajur tujuan saat diseret. */
  trackIds: readonly string[];
}

export function ClipIcon({ type, size = 14 }: { type: Clip['type']; size?: number }) {
  switch (type) {
    case 'video':
      return <IconFilm size={size} />;
    case 'image':
      return <IconImage size={size} />;
    case 'audio':
      return <IconMusic size={size} />;
    case 'text':
      return <IconText size={size} />;
    case 'effect':
      return <IconEffect size={size} />;
  }
}

function clipClass(type: Clip['type']): string {
  return type === 'image' ? 'clip-video' : `clip-${type}`;
}

function rowAtY(el: HTMLElement, clientY: number): number {
  const rows = el.closest('.tl-rows');
  if (!rows) return -1;
  const top = rows.getBoundingClientRect().top + ROW_GAP;
  return Math.floor((clientY - top) / (TRACK_H + ROW_GAP));
}

/** Tekan-tahan di layar sentuh: geser cepat menggulir timeline, tahan dulu untuk memindahkan klip. */
interface PendingTouch {
  pointerId: number;
  x: number;
  y: number;
  ox: number;
  width: number;
  timer: number;
}

export const ClipView = memo(function ClipView({ clip, trackIndex, selected, zoom, trackIds }: ClipViewProps) {
  const drag = useRef<DragState | null>(null);
  const pending = useRef<PendingTouch | null>(null);
  const elRef = useRef<HTMLDivElement>(null);

  const left = frameToX(clip.start, zoom);
  const width = Math.max(2, frameToX(clip.duration, zoom));
  const top = trackIndex * (TRACK_H + ROW_GAP) + ROW_GAP + 4;
  const label = clipLabel(clip);
  const showSpeed = (clip.type === 'video' || clip.type === 'audio') && clip.speed !== 1;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || !drag.current) return;
      const d = drag.current;
      drag.current = null;
      if (d.moved) editor.get().cancelGesture();
      useTimelineUi.setState({ snapFrame: null });
      elRef.current?.releasePointerCapture(d.pointerId);
    };
    window.addEventListener('keydown', onKey);
    // Saat klip sedang diseret dengan jari, cegah browser menggulir halaman/timeline.
    const el = elRef.current;
    const onTouchMove = (e: TouchEvent) => {
      if (drag.current) e.preventDefault();
    };
    el?.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      el?.removeEventListener('touchmove', onTouchMove);
      if (pending.current) window.clearTimeout(pending.current.timer);
    };
  }, []);

  /** Mulai menyeret: menentukan mode dari posisi pointer di dalam klip. */
  const beginDrag = (el: HTMLElement, pointerId: number, x: number, y: number, ox: number, width: number, edge: number) => {
    let mode: DragMode = 'move';
    if (ox <= edge && width > edge * 3) mode = 'trim-start';
    else if (width - ox <= edge && width > edge * 3) mode = 'trim-end';
    try {
      el.setPointerCapture(pointerId);
    } catch {
      return;
    }
    drag.current = {
      mode,
      pointerId,
      startX: x,
      startY: y,
      moved: false,
      origStart: clip.start,
      origEnd: clipEnd(clip),
      origTrackId: clip.trackId,
    };
  };

  const clearPending = () => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const s = editor.get();
    if (s.gestureBase) return;
    e.stopPropagation();
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const ox = e.clientX - rect.left;

    if (s.tool === 'text' || s.tool === 'speed' || s.tool === 'volume' || s.tool === 'effect') {
      selectClip(clip.id);
      clipToolAction(clip.id, el);
      return;
    }

    if (e.shiftKey) selectClip(clip.id, true);
    else if (!selected) selectClip(clip.id);
    if (s.tool === 'crop') return;

    if (e.pointerType === 'touch') {
      // Jari: tunggu tekan-tahan sebelum menyeret, agar usapan tetap menggulir timeline.
      clearPending();
      const { pointerId, clientX, clientY } = e;
      const width = rect.width;
      pending.current = {
        pointerId,
        x: clientX,
        y: clientY,
        ox,
        width,
        timer: window.setTimeout(() => {
          const p = pending.current;
          pending.current = null;
          if (!p || !elRef.current) return;
          beginDrag(elRef.current, p.pointerId, p.x, p.y, p.ox, p.width, EDGE_PX_TOUCH);
          if (drag.current) navigator.vibrate?.(12);
        }, LONG_PRESS_MS),
      };
      return;
    }
    beginDrag(el, e.pointerId, e.clientX, e.clientY, ox, rect.width, EDGE_PX);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pending.current;
    if (p && p.pointerId === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TOUCH_SLOP) clearPending();
    const d = drag.current;
    if (d && e.pointerId === d.pointerId) {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.moved = true;
        editor.get().beginGesture();
      }
      const s = editor.get();
      const base = s.gestureBase;
      if (!base) return;
      const dx = xToFrame(e.clientX - d.startX, s.zoom);
      const threshold = snapThreshold(s.zoom, FPS);
      const targets = snapTargets(base, new Set([clip.id]), s.playhead);

      if (d.mode === 'move') {
        let start = Math.max(0, d.origStart + dx);
        const snap = snapDelta([start, start + (d.origEnd - d.origStart)], targets, threshold);
        start = Math.max(0, start + snap.delta);
        let trackId = d.origTrackId;
        const row = rowAtY(e.currentTarget, e.clientY);
        const candidate = trackIds[row];
        const track = candidate ? findTrack(base, candidate) : undefined;
        if (track && trackAccepts(track.kind, clip.type)) trackId = track.id;
        s.updateGesture((b) => moveClip(b, clip.id, trackId, start));
        useTimelineUi.setState({ snapFrame: snap.target });
      } else if (d.mode === 'trim-start') {
        let start = d.origStart + dx;
        const snap = snapDelta([start], targets, threshold);
        start += snap.delta;
        s.updateGesture((b) => trimStart(b, clip.id, start));
        useTimelineUi.setState({ snapFrame: snap.target });
      } else {
        let end = d.origEnd + dx;
        const snap = snapDelta([end], targets, threshold);
        end += snap.delta;
        s.updateGesture((b) => trimEnd(b, clip.id, end));
        useTimelineUi.setState({ snapFrame: snap.target });
      }
    }
  };

  const finish = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (pending.current?.pointerId === e.pointerId) clearPending();
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    useTimelineUi.setState({ snapFrame: null });
    if (!d.moved) return;
    const s = editor.get();
    if (!commit) {
      s.cancelGesture();
      return;
    }
    s.endGesture();
    const now = s.project.clips.find((c) => c.id === clip.id);
    if (!now) return;
    if (d.mode === 'move') s.announce(`Klip dipindah ke ${formatTimecode(now.start)}.`);
    else s.announce(`Durasi klip ${spokenDuration(now.duration)}.`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = editor.get();
    if (e.key === 'Enter') {
      e.preventDefault();
      selectClip(clip.id, e.shiftKey);
      if (s.tool === 'text' || s.tool === 'speed' || s.tool === 'volume' || s.tool === 'effect') {
        clipToolAction(clip.id, e.currentTarget);
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      if (!selected) selectClip(clip.id);
      deleteSelection();
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = (e.shiftKey ? FPS : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
    if (!selected) selectClip(clip.id);
    s.apply((p) => nudgeClip(p, clip.id, step), { coalesce: `nudge:${clip.id}` });
  };

  const tc = formatTimecode(clip.start);
  const ariaLabel = `${CLIP_TYPE_LABEL[clip.type]}: ${label}. Mulai ${tc}, durasi ${spokenDuration(clip.duration)}${
    showSpeed ? `, kecepatan ${String(clip.speed).replace('.', ',')} kali` : ''
  }.`;

  return (
    <div
      ref={elRef}
      role="button"
      tabIndex={0}
      aria-roledescription="klip"
      aria-label={ariaLabel}
      aria-pressed={selected}
      data-clip-id={clip.id}
      className={`clip ${clipClass(clip.type)}${width < 28 ? ' clip-narrow' : ''}`}
      style={{ left, width, top }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      onLostPointerCapture={(e) => finish(e, true)}
      onContextMenu={(e) => {
        // Tekan-tahan di HP membuka menu konteks; di sini tekan-tahan dipakai untuk menyeret.
        if (pending.current || drag.current) e.preventDefault();
      }}
      onKeyDown={onKeyDown}
    >
      <span className="clip-handle clip-handle-start" aria-hidden="true" />
      <ClipIcon type={clip.type} />
      <span className="clip-name">{label}</span>
      {showSpeed && <span className="clip-speed t-tick">{String(clip.speed).replace('.', ',')}×</span>}
      <span className="clip-handle clip-handle-end" aria-hidden="true" />
    </div>
  );
});
