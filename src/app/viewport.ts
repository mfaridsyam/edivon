/**
 * Mencegah halaman di-zoom di HP. Viewport meta (maximum-scale=1) dan touch-action menangani
 * kebanyakan browser; Safari iOS mengabaikan user-scalable=no, jadi gestur cubitnya dibatalkan di sini.
 */
export function preventPageZoom(): void {
  const block = (e: Event) => e.preventDefault();
  // Event gesture* hanya ada di Safari.
  document.addEventListener('gesturestart', block, { passive: false });
  document.addEventListener('gesturechange', block, { passive: false });
  // Cubit dua jari di luar timeline (timeline menangani cubitannya sendiri untuk zoom timeline).
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1 && !(e.target instanceof Element && e.target.closest('.tl-body'))) e.preventDefault();
    },
    { passive: false },
  );
}
