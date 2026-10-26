/*
 * Layar penuh lintas browser. Safari (iPad, macOS lama) memakai awalan webkit; iPhone tidak mendukung
 * layar penuh untuk elemen selain <video>, sehingga pemanggil perlu cadangan (lihat Stage).
 */

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'portrait') => Promise<void>;
};

export function fullscreenElement(): Element | null {
  const doc = document as FsDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** Meminta layar penuh asli. True bila elemen benar-benar menjadi layar penuh. */
export async function requestFullscreen(el: HTMLElement): Promise<boolean> {
  const target = el as FsElement;
  try {
    if (typeof target.requestFullscreen === 'function') await target.requestFullscreen({ navigationUI: 'hide' });
    else if (typeof target.webkitRequestFullscreen === 'function') await target.webkitRequestFullscreen();
    else return false;
  } catch {
    return false;
  }
  return fullscreenElement() === el;
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as FsDocument;
  try {
    if (typeof doc.exitFullscreen === 'function' && doc.fullscreenElement) await doc.exitFullscreen();
    else if (typeof doc.webkitExitFullscreen === 'function') await doc.webkitExitFullscreen();
  } catch {
    // Sudah keluar dari layar penuh.
  }
}

export function onFullscreenChange(cb: () => void): () => void {
  document.addEventListener('fullscreenchange', cb);
  document.addEventListener('webkitfullscreenchange', cb);
  return () => {
    document.removeEventListener('fullscreenchange', cb);
    document.removeEventListener('webkitfullscreenchange', cb);
  };
}

/** Di ponsel, video lanskap enak ditonton mendatar. Diabaikan bila browser tidak mengizinkan. */
export function lockLandscape(): void {
  const orientation = screen.orientation as LockableOrientation | undefined;
  orientation?.lock?.('landscape').catch(() => {});
}

export function unlockOrientation(): void {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Tidak dikunci.
  }
}
