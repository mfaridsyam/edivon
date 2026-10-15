import { clipEnd, type Project } from './model';

export interface SnapResult {
  /** Geseran (frame) yang perlu ditambahkan agar menempel; 0 bila tidak ada. */
  delta: number;
  /** Frame target yang ditempeli, untuk garis bantu; null bila tidak menempel. */
  target: number | null;
}

/**
 * Mencari geseran terkecil yang membuat salah satu `candidates` tepat di salah satu `targets`,
 * selama jaraknya tidak lebih dari `threshold` frame.
 */
export function snapDelta(candidates: readonly number[], targets: readonly number[], threshold: number): SnapResult {
  let best: SnapResult = { delta: 0, target: null };
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    for (const t of targets) {
      const d = t - c;
      const dist = Math.abs(d);
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        best = { delta: d, target: t };
      }
    }
  }
  return best;
}

/** Titik tempel: awal timeline, playhead, serta tepi semua klip kecuali yang dikecualikan. */
export function snapTargets(project: Project, exclude: ReadonlySet<string>, playhead: number | null): number[] {
  const set = new Set<number>([0]);
  if (playhead !== null) set.add(playhead);
  for (const c of project.clips) {
    if (exclude.has(c.id)) continue;
    set.add(c.start);
    set.add(clipEnd(c));
  }
  return [...set];
}

/** Ambang tempel dalam frame dari ambang piksel dan zoom saat ini. */
export function snapThreshold(pxPerSecond: number, fps: number, px = 8): number {
  return Math.max(1, Math.round((px / pxPerSecond) * fps));
}
