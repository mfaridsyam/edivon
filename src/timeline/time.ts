/** Laju frame proyek. Semua posisi di timeline disimpan sebagai frame integer. */
export const FPS = 30;

export function framesToSeconds(frames: number): number {
  return frames / FPS;
}

export function secondsToFrames(seconds: number): number {
  return Math.round(seconds * FPS);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** Format `JJ:MM:DD.FF` (jam, menit, detik, frame), mis. `00:00:18.12`. */
export function formatTimecode(frames: number): string {
  const f = Math.max(0, Math.round(frames));
  const totalSeconds = Math.floor(f / FPS);
  const ff = f % FPS;
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}.${pad(ff)}`;
}

/** Format pendek untuk penggaris dan durasi thumbnail, mis. `00:10` atau `1:02:05`. */
export function formatShort(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds + 1e-6));
  const ss = s % 60;
  const mm = Math.floor(s / 60) % 60;
  const hh = Math.floor(s / 3600);
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

/** Durasi singkat dalam kata-kata untuk pembaca layar, mis. "1 menit 5 detik". */
export function spokenDuration(frames: number): string {
  const totalSeconds = Math.round(frames / FPS);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s} detik`;
  return s === 0 ? `${m} menit` : `${m} menit ${s} detik`;
}

/**
 * Jarak tick penggaris yang menyesuaikan zoom. Pada zoom bawaan: tick tiap 2 detik,
 * tick mayor + label tiap 10 detik.
 */
const TICK_STEPS: readonly [minor: number, major: number][] = [
  [1 / FPS, 5 / FPS],
  [5 / FPS, 1],
  [0.5, 2],
  [1, 5],
  [2, 10],
  [5, 30],
  [10, 60],
  [30, 150],
  [60, 300],
  [300, 1800],
];

export function rulerSteps(pxPerSecond: number, minMinorPx = 14): { minor: number; major: number } {
  for (const [minor, major] of TICK_STEPS) {
    if (minor * pxPerSecond >= minMinorPx) return { minor, major };
  }
  const last = TICK_STEPS[TICK_STEPS.length - 1] ?? [300, 1800];
  return { minor: last[0], major: last[1] };
}
