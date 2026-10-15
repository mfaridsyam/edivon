import type { DragEvent, HTMLAttributes, PointerEvent } from 'react';
import { addEffectClip, addMediaToTimeline, addTextClip } from '../../state/actions';
import { editor } from '../../state/store';
import { trackAccepts, type Track } from '../../timeline/model';
import { previewPlacement } from '../../timeline/ops';
import { snapDelta, snapTargets, snapThreshold } from '../../timeline/snap';
import { FPS } from '../../timeline/time';
import { currentPayload, endPayloadDrag, payloadClip } from '../dragPayload';
import { useTimelineUi, xToFrame } from './geometry';

/** Klik di area kosong lajur. */
export function onLanePointerDown(e: PointerEvent<HTMLElement>, track: Track, frame: number): void {
  if (e.button !== 0) return;
  const s = editor.get();
  if (s.tool === 'text') {
    // Alat Teks: klik di timeline menambah teks pada waktu itu (di lajur Teks bila lajur ini bukan lajur teks).
    s.setPlayhead(frame);
    addTextClip('title', track.kind === 'text' ? { trackId: track.id, start: frame } : undefined);
    return;
  }
  if (!e.shiftKey && s.selection.length > 0) s.select([]);
}

function dropStart(e: DragEvent<HTMLElement>, track: Track, zoom: number, duration: number): number {
  const s = editor.get();
  const rect = e.currentTarget.getBoundingClientRect();
  let start = Math.max(0, xToFrame(e.clientX - rect.left, zoom));
  const snap = snapDelta([start, start + duration], snapTargets(s.project, new Set(), s.playhead), snapThreshold(zoom, FPS));
  start = Math.max(0, start + snap.delta);
  return previewPlacement(s.project, track.id, start);
}

/** Seret-lepas media, teks, atau efek dari panel kiri ke lajur yang jenisnya cocok. */
export function laneDropHandlers(
  track: Track,
  zoom: number,
): Pick<HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDrop' | 'onDragLeave'> {
  return {
    onDragOver: (e) => {
      const payload = currentPayload();
      const info = payload && payloadClip(payload);
      if (!info || !trackAccepts(track.kind, info.type)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const start = dropStart(e, track, zoom, info.duration);
      const ghost = useTimelineUi.getState().dropGhost;
      if (!ghost || ghost.trackId !== track.id || ghost.start !== start) {
        useTimelineUi.setState({ dropGhost: { trackId: track.id, start, duration: info.duration } });
      }
    },
    onDragLeave: (e) => {
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      if (useTimelineUi.getState().dropGhost?.trackId === track.id) useTimelineUi.setState({ dropGhost: null });
    },
    onDrop: (e) => {
      const payload = currentPayload();
      const info = payload && payloadClip(payload);
      useTimelineUi.setState({ dropGhost: null });
      if (!payload || !info || !trackAccepts(track.kind, info.type)) return;
      e.preventDefault();
      const at = { trackId: track.id, start: dropStart(e, track, zoom, info.duration) };
      endPayloadDrag();
      if (payload.kind === 'media') addMediaToTimeline(payload.id, at);
      else if (payload.kind === 'text') addTextClip(payload.preset, at);
      else addEffectClip(payload.effect, at);
    },
  };
}
