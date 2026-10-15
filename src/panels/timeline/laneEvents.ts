import type { DragEvent, HTMLAttributes, PointerEvent } from 'react';
import { editor } from '../../state/store';
import type { Track } from '../../timeline/model';

/** Klik di area kosong lajur. */
export function onLanePointerDown(e: PointerEvent<HTMLElement>, _track: Track, _frame: number): void {
  if (e.button !== 0) return;
  const s = editor.get();
  if (s.tool === 'select' || s.tool === 'trim' || s.tool === 'crop') {
    if (!e.shiftKey && s.selection.length > 0) s.select([]);
  }
}

/** Penanganan seret-lepas media dari panel ke lajur (diisi di fase impor). */
export function laneDropHandlers(_track: Track, _zoom: number): Pick<HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDrop' | 'onDragLeave'> {
  return {
    onDragOver: (_e: DragEvent<HTMLElement>) => {},
  };
}
