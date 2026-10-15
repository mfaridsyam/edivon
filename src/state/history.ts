/** Riwayat undo/redo berbasis snapshot. Dokumen bersifat imutabel, jadi snapshot berbagi struktur. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Kunci penggabungan langkah terakhir, mis. "clip:abc:scale" untuk slider yang digeser terus. */
  lastKey: string | null;
  lastTime: number;
}

export const HISTORY_LIMIT = 200;
export const COALESCE_MS = 1000;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastTime: 0 };
}

export interface CommitOptions {
  /** Perubahan berurutan dengan kunci sama dalam jendela waktu digabung menjadi satu langkah. */
  coalesce?: string;
  now?: number;
}

export function commit<T>(h: History<T>, next: T, opts: CommitOptions = {}): History<T> {
  if (next === h.present) return h;
  const now = opts.now ?? Date.now();
  const key = opts.coalesce ?? null;
  if (key !== null && key === h.lastKey && now - h.lastTime <= COALESCE_MS && h.past.length > 0) {
    return { ...h, present: next, future: [], lastTime: now };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: key, lastTime: now };
}

/** Mencatat satu langkah dari `base` ke keadaan sekarang (dipakai di akhir gestur seret). */
export function commitFrom<T>(h: History<T>, base: T): History<T> {
  if (base === h.present) return h;
  const past = [...h.past, base];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: h.present, future: [], lastKey: null, lastTime: 0 };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return {
    past: h.past.slice(0, -1),
    present: prev,
    future: [h.present, ...h.future],
    lastKey: null,
    lastTime: 0,
  };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (next === undefined) return h;
  return {
    past: [...h.past, h.present],
    present: next,
    future: h.future.slice(1),
    lastKey: null,
    lastTime: 0,
  };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}
