import { create } from 'zustand';
import { COMPACT_QUERY, useMediaQuery } from '../../ui/useMediaQuery';
import { FPS } from '../../timeline/time';

/** Lebar kepala lajur; harus sama dengan --track-head-w di timeline.css. */
export const HEAD_W = 128;
export const HEAD_W_COMPACT = 76;

/** Lebar kepala lajur saat ini (lebih ramping di ponsel). */
export function useHeadWidth(): number {
  return useMediaQuery(COMPACT_QUERY) ? HEAD_W_COMPACT : HEAD_W;
}
export const RULER_H = 28;
export const TRACK_H = 44;
export const ROW_GAP = 2;
/** Lebar zona tepi klip untuk trim dengan alat Pilih. */
export const EDGE_PX = 6;
/** Zona tepi untuk jari, lebih lebar agar trim mudah di layar sentuh. */
export const EDGE_PX_TOUCH = 16;
/** Lama tekan-tahan (ms) sebelum klip bisa diseret dengan jari. */
export const LONG_PRESS_MS = 300;
/** Gerakan jari (px) sebelum tekan-tahan dianggap menggulir. */
export const TOUCH_SLOP = 8;
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
