import { useSyncExternalStore } from 'react';

/** Layar ponsel: kepala lajur lebih ramping, zoom hanya tombol. */
export const COMPACT_QUERY = '(max-width: 639.98px)';
/** Perangkat yang terutama dipakai dengan jari. */
export const COARSE_QUERY = '(pointer: coarse)';

export function matches(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches;
}

/** Nilai media query yang ikut berubah saat ukuran layar atau jenis pointer berubah. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => matches(query),
    () => false,
  );
}
