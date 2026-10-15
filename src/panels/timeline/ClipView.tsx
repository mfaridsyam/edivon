import { memo, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { selectClip, splitClipAt } from '../../state/actions';
import { editor } from '../../state/store';
import {
  CLIP_TYPE_LABEL,
  clipEnd,
  clipLabel,
  findTrack,
  trackAccepts,
  type Clip,
  type Project,
} from '../../timeline/model';
import { moveClip, nudgeClip, trimEnd, trimStart } from '../../timeline/ops';
import { snapDelta, snapTargets, snapThreshold } from '../../timeline/snap';
import { FPS, formatTimecode, spokenDuration } from '../../timeline/time';
import { IconEffect, IconFilm, IconImage, IconMusic, IconText } from '../../ui/icons';
import { DRAG_THRESHOLD, EDGE_PX, ROW_GAP, TRACK_H, frameToX, useTimelineUi, xToFrame } from './geometry';
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

/** Frame di bawah pointer, ditempelkan ke playhead dan tepi klip lain bila dekat. */
export function frameAtPointer(project: Project, clip: Clip, clientX: number, rect: DOMRect): number {
  const s = editor.get();
  const raw = clip.start + xToFrame(clientX - rect.left, s.zoom);
  const snap = snapDelta([raw], snapTargets(project, new Set([clip.id]), s.playhead), snapThreshold(s.zoom, FPS));
  return raw + snap.delta;
}

function rowAtY(el: HTMLElement, clientY: number): number {
  const rows = el.closest('.tl-rows');
  if (!rows) return -1;
  const top = rows.getBoundingClientRect().top + ROW_GAP;
  return Math.floor((clientY - top) / (TRACK_H + ROW_GAP));
}

export const ClipView = memo(function ClipView({ clip, trackIndex, selected, zoom, trackIds }: ClipViewProps) {
  const drag = useRef<DragState | null>(null);
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
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const s = editor.get();
    if (s.gestureBase) return;
    e.stopPropagation();
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const ox = e.clientX - rect.left;

    if (s.tool === 'split') {
      splitClipAt(clip.id, frameAtPointer(s.project, clip, e.clientX, rect));
      return;
    }
    if (s.tool === 'text' || s.tool === 'speed' || s.tool === 'volume' || s.tool === 'effect') {
      selectClip(clip.id);
      clipToolAction(clip.id, el);
      return;
    }

    if (e.shiftKey) selectClip(clip.id, true);
    else if (!selected) selectClip(clip.id);
    if (s.tool === 'crop') return;

    let mode: DragMode = 'move';
    if (s.tool === 'trim') mode = ox < rect.width / 2 ? 'trim-start' : 'trim-end';
    else if (ox <= EDGE_PX && rect.width > EDGE_PX * 3) mode = 'trim-start';
    else if (rect.width - ox <= EDGE_PX && rect.width > EDGE_PX * 3) mode = 'trim-end';

    el.setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      origStart: clip.start,
      origEnd: clipEnd(clip),
      origTrackId: clip.trackId,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
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
      return;
    }

    // Pratinjau garis belah saat alat Belah aktif.
    const s = editor.get();
    if (s.tool === 'split' && !s.gestureBase) {
      const frame = frameAtPointer(s.project, clip, e.clientX, e.currentTarget.getBoundingClientRect());
      useTimelineUi.setState({ splitHover: { clipId: clip.id, frame } });
    }
  };

  const finish = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
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
      if (s.tool === 'split') {
        if (s.playhead > clip.start && s.playhead < clipEnd(clip)) splitClipAt(clip.id, s.playhead);
        else s.announce('Pindahkan playhead ke dalam klip untuk membelah.');
        return;
      }
      selectClip(clip.id, e.shiftKey);
      if (s.tool === 'text' || s.tool === 'speed' || s.tool === 'volume' || s.tool === 'effect') {
        clipToolAction(clip.id, e.currentTarget);
      }
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = (e.shiftKey ? FPS : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
    if (!selected) selectClip(clip.id);
    if (s.tool === 'trim') {
      if (e.altKey) s.apply((p) => trimStart(p, clip.id, clip.start + step), { coalesce: `trim-start:${clip.id}` });
      else s.apply((p) => trimEnd(p, clip.id, clipEnd(clip) + step), { coalesce: `trim-end:${clip.id}` });
    } else {
      s.apply((p) => nudgeClip(p, clip.id, step), { coalesce: `nudge:${clip.id}` });
    }
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
      onPointerLeave={() => useTimelineUi.setState({ splitHover: null })}
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
