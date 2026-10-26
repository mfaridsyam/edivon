import { create } from 'zustand';

/** Event `beforeinstallprompt` (Chromium); belum ada di lib DOM TypeScript. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  /** Tawaran pasang dari browser, bila tersedia. */
  prompt: BeforeInstallPromptEvent | null;
  /** Sudah berjalan sebagai aplikasi terpasang. */
  standalone: boolean;
  /** iPhone/iPad di Safari: pemasangan lewat menu Bagikan, tanpa tawaran otomatis. */
  ios: boolean;
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export const useInstall = create<InstallState>()(() => ({
  prompt: null,
  standalone: typeof window !== 'undefined' && isStandalone(),
  ios: typeof window !== 'undefined' && isIos(),
}));

/** Menampilkan dialog pasang dari browser. True bila pengguna menerima. */
export async function promptInstall(): Promise<boolean> {
  const event = useInstall.getState().prompt;
  if (!event) return false;
  useInstall.setState({ prompt: null });
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === 'accepted';
}

/**
 * Mendaftarkan service worker (hanya di build produksi) dan menangkap tawaran pasang.
 * Dipanggil sekali sebelum aplikasi dirender, agar event yang datang lebih awal tidak terlewat.
 */
export function setupInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    useInstall.setState({ prompt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ prompt: null, standalone: true }));
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
    useInstall.setState({ standalone: isStandalone() });
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Tanpa service worker aplikasi tetap jalan; hanya tidak bisa dibuka tanpa internet.
      });
    });
  }
}
