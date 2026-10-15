import { create } from 'zustand';
import { FPS } from '../../timeline/time';

export const HEAD_W = 128;
export const RULER_H = 28;
export const TRACK_H = 44;
export const ROW_GAP = 2;
/** Lebar zona tepi klip untuk trim dengan alat Pilih. */
export const EDGE_PX = 6;
/** Jarak gerak minimum sebelum klik dianggap seret. */
export const DRAG_THRESHOLD = 3;

export function frameToX(frame: number, zoom: number): number {
  return (frame / FPS) * zoom;
}

export function xToFrame(x: number, zoom: number): number {
  return Math.round((x / zoom) * FPS);
}

/** Keadaan sementara UI timeline yang tidak perlu masuk riwayat. */
interface TimelineUi {
  /** Frame garis bantu tempel saat menyeret, atau null. */
  snapFrame: number | null;
  /** Bayangan klip saat media diseret dari panel: lajur, frame awal, durasi. */
  dropGhost: { trackId: string; start: number; duration: number } | null;
}

export const useTimelineUi = create<TimelineUi>()(() => ({
  snapFrame: null,
  dropGhost: null,
}));
