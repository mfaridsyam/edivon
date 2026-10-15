import {
  clipEnd,
  clipsOnTrack,
  findClip,
  findTrack,
  isSourceTimed,
  maxDuration,
  newId,
  nextTrackName,
  trackAccepts,
  type Clip,
  type Project,
  type Speed,
  type Track,
  type TrackKind,
} from './model';
import { FPS } from './time';

/* Semua operasi di sini murni: menerima proyek, mengembalikan proyek baru tanpa mengubah masukan. */

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Membulatkan detik sumber ke mikrodetik agar galat pecahan tidak menumpuk. */
function roundSeconds(s: number): number {
  return Math.round(s * 1e6) / 1e6;
}

export function replaceClip(project: Project, clip: Clip): Project {
  return { ...project, clips: project.clips.map((c) => (c.id === clip.id ? clip : c)) };
}

export function updateClip(project: Project, id: string, fn: (clip: Clip) => Clip): Project {
  const clip = findClip(project, id);
  if (!clip) return project;
  return replaceClip(project, fn(clip));
}

export function deleteClips(project: Project, ids: readonly string[]): Project {
  if (ids.length === 0) return project;
  const set = new Set(ids);
  return { ...project, clips: project.clips.filter((c) => !set.has(c.id)) };
}

/** Akhir klip terdekat di sebelah kiri `clip` pada lajur yang sama (atau 0). */
function previousEnd(project: Project, clip: Clip): number {
  let end = 0;
  for (const c of project.clips) {
    if (c.id === clip.id || c.trackId !== clip.trackId) continue;
    if (c.start < clip.start) end = Math.max(end, clipEnd(c));
  }
  return end;
}

/** Awal klip terdekat di sebelah kanan `clip` pada lajur yang sama (atau tak hingga). */
function nextStart(project: Project, clip: Clip): number {
  let start = Number.POSITIVE_INFINITY;
  for (const c of project.clips) {
    if (c.id === clip.id || c.trackId !== clip.trackId) continue;
    if (c.start >= clip.start) start = Math.min(start, c.start);
  }
  return start;
}

/** Frame awal sebenarnya bila sebuah klip ditaruh di `start` pada lajur berisi `onTrack` (terurut). */
function resolveStart(onTrack: readonly Clip[], start: number): number {
  let s = Math.max(0, Math.round(start));
  const containing = onTrack.find((c) => c.start < s && s < clipEnd(c));
  if (containing) {
    s = s - containing.start < containing.duration / 2 ? containing.start : clipEnd(containing);
  }
  return s;
}

/** Posisi yang akan dipakai `placeClip`, untuk bayangan saat media diseret ke timeline. */
export function previewPlacement(project: Project, trackId: string, start: number, excludeId?: string): number {
  return resolveStart(
    project.clips.filter((c) => c.trackId === trackId && c.id !== excludeId).sort((a, b) => a.start - b.start),
    start,
  );
}

/**
 * Menaruh klip di lajur pada frame `start` tanpa tumpang tindih.
 * - Bila `start` jatuh di dalam klip lain, klip ditaruh sebelum klip itu (paruh kiri) atau sesudahnya (paruh kanan).
 * - Klip yang tertimpa di sebelah kanan didorong ke kanan sejauh yang dibutuhkan, beserta klip setelahnya.
 * Klip yang sudah ada di proyek (dengan id sama) dipindahkan.
 */
export function placeClip(project: Project, clip: Clip, trackId: string, start: number): Project {
  const others = project.clips.filter((c) => c.id !== clip.id);
  const onTrack = others.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);

  const s = resolveStart(onTrack, start);
  const end = s + clip.duration;
  const next = onTrack.find((c) => c.start >= s);
  const shift = next ? Math.max(0, end - next.start) : 0;

  const placed = { ...clip, trackId, start: s };
  const pushed = (c: Clip) =>
    shift > 0 && c.trackId === trackId && c.start >= s ? { ...c, start: c.start + shift } : c;
  // Klip yang sudah ada tetap di posisinya dalam array, agar urutan render (dan node DOM) stabil.
  const existing = project.clips.some((c) => c.id === clip.id);
  const clips = existing
    ? project.clips.map((c) => (c.id === clip.id ? placed : pushed(c)))
    : [...others.map(pushed), placed];
  return { ...project, clips };
}

/** Memindahkan klip ke lajur lain (harus jenis yang cocok) dan/atau waktu lain. */
export function moveClip(project: Project, id: string, trackId: string, start: number): Project {
  const clip = findClip(project, id);
  const track = findTrack(project, trackId);
  if (!clip || !track || !trackAccepts(track.kind, clip.type)) return project;
  return placeClip(project, clip, trackId, start);
}

/** Menggeser klip sejauh `delta` frame, berhenti di tepi tetangganya (dipakai untuk tombol panah). */
export function nudgeClip(project: Project, id: string, delta: number): Project {
  const clip = findClip(project, id);
  if (!clip) return project;
  const lo = previousEnd(project, clip);
  const hi = nextStart(project, clip) - clip.duration;
  const start = clamp(clip.start + Math.round(delta), lo, Math.max(lo, hi));
  if (start === clip.start) return project;
  return replaceClip(project, { ...clip, start });
}

/** Trim tepi kiri: memindahkan awal klip ke `newStart`, isi sumber ikut bergeser. */
export function trimStart(project: Project, id: string, newStart: number): Project {
  const clip = findClip(project, id);
  if (!clip) return project;
  let lo = previousEnd(project, clip);
  if (isSourceTimed(clip)) {
    lo = Math.max(lo, clip.start - Math.floor((clip.in / clip.speed) * FPS + 1e-6));
  }
  const hi = clipEnd(clip) - 1;
  const s = clamp(Math.round(newStart), lo, hi);
  const delta = s - clip.start;
  if (delta === 0) return project;
  const base = { ...clip, start: s, duration: clip.duration - delta };
  if (isSourceTimed(clip)) {
    const inPoint = Math.max(0, roundSeconds(clip.in + (delta / FPS) * clip.speed));
    return replaceClip(project, { ...base, in: inPoint } as Clip);
  }
  return replaceClip(project, base);
}

/** Trim tepi kanan: mengubah akhir klip menjadi `newEnd`. */
export function trimEnd(project: Project, id: string, newEnd: number): Project {
  const clip = findClip(project, id);
  if (!clip) return project;
  const lo = clip.start + 1;
  const hi = Math.min(nextStart(project, clip), clip.start + maxDuration(clip));
  const end = clamp(Math.round(newEnd), lo, Math.max(lo, hi));
  const duration = end - clip.start;
  if (duration === clip.duration) return project;
  return replaceClip(project, { ...clip, duration });
}

/**
 * Membelah klip di frame `frame`. Bagian kanan mendapat id baru.
 * Tidak berubah bila frame tidak berada di dalam klip.
 */
export function splitClip(
  project: Project,
  id: string,
  frame: number,
  rightId: string = newId('clip'),
): { project: Project; rightId: string | null } {
  const clip = findClip(project, id);
  const f = Math.round(frame);
  if (!clip || f <= clip.start || f >= clipEnd(clip)) return { project, rightId: null };
  const leftDuration = f - clip.start;
  const left: Clip = { ...clip, duration: leftDuration };
  let right: Clip = { ...clip, id: rightId, start: f, duration: clip.duration - leftDuration };
  if (isSourceTimed(clip) && isSourceTimed(right)) {
    right = { ...right, in: roundSeconds(clip.in + (leftDuration / FPS) * clip.speed) };
  }
  const clips = project.clips.flatMap((c) => (c.id === id ? [left, right] : [c]));
  return { project: { ...project, clips }, rightId };
}

/** Membelah semua klip (atau hanya `ids`) yang memuat frame tertentu. */
export function splitAt(
  project: Project,
  frame: number,
  ids?: readonly string[],
): { project: Project; created: string[] } {
  const targets = project.clips.filter(
    (c) => (!ids || ids.includes(c.id)) && c.start < frame && frame < clipEnd(c),
  );
  let p = project;
  const created: string[] = [];
  for (const c of targets) {
    const r = splitClip(p, c.id, frame);
    p = r.project;
    if (r.rightId) created.push(r.rightId);
  }
  return { project: p, created };
}

/**
 * Memotong awal (`start`) atau akhir (`end`) klip ke frame tertentu, untuk klip yang dilalui frame itu
 * (hanya `ids` bila diberikan). Bagian yang terpotong tetap bisa dikembalikan dengan menarik ujung klip.
 */
export function trimAt(
  project: Project,
  frame: number,
  edge: 'start' | 'end',
  ids?: readonly string[],
): { project: Project; trimmed: string[] } {
  const targets = project.clips.filter(
    (c) => (!ids || ids.includes(c.id)) && c.start < frame && frame < clipEnd(c),
  );
  let p = project;
  const trimmed: string[] = [];
  for (const c of targets) {
    const next = edge === 'start' ? trimStart(p, c.id, frame) : trimEnd(p, c.id, frame);
    if (next !== p) trimmed.push(c.id);
    p = next;
  }
  return { project: p, trimmed };
}

/**
 * Mengubah kecepatan klip video/audio. Isi sumber yang dipakai tetap sama,
 * sehingga durasi di timeline berubah. Klip di kanannya didorong bila perlu.
 */
export function setSpeed(project: Project, id: string, speed: Speed): Project {
  const clip = findClip(project, id);
  if (!clip || !isSourceTimed(clip) || clip.speed === speed) return project;
  const span = (clip.duration / FPS) * clip.speed;
  const updated = { ...clip, speed };
  const duration = clamp(Math.round((span / speed) * FPS), 1, maxDuration(updated));
  const next = nextStart(project, clip);
  const end = clip.start + duration;
  const shift = Number.isFinite(next) ? Math.max(0, end - next) : 0;
  const clips = project.clips.map((c) => {
    if (c.id === id) return { ...updated, duration };
    if (shift > 0 && c.trackId === clip.trackId && c.start >= next) return { ...c, start: c.start + shift };
    return c;
  });
  return { ...project, clips };
}

/** Indeks sisip lajur baru agar urutan lapisan masuk akal. */
function insertIndex(tracks: readonly Track[], kind: TrackKind): number {
  const firstOf = (k: TrackKind) => tracks.findIndex((t) => t.kind === k);
  switch (kind) {
    case 'text':
      return 0;
    case 'effect': {
      // Di atas semua video agar efek berlaku untuk lapisan di bawahnya.
      const v = firstOf('video');
      return v === -1 ? tracks.filter((t) => t.kind === 'text').length : v;
    }
    case 'video': {
      // Lajur video baru menjadi lapisan video teratas.
      const v = firstOf('video');
      if (v !== -1) return v;
      const a = firstOf('audio');
      return a === -1 ? tracks.length : a;
    }
    case 'audio':
      return tracks.length;
  }
}

export function addTrack(
  project: Project,
  kind: TrackKind,
  id: string = newId('track'),
): { project: Project; trackId: string } {
  const track: Track = { id, kind, name: nextTrackName(project, kind), hidden: false, muted: false };
  const tracks = [...project.tracks];
  tracks.splice(insertIndex(tracks, kind), 0, track);
  return { project: { ...project, tracks }, trackId: id };
}

export function updateTrack(project: Project, id: string, patch: Partial<Pick<Track, 'hidden' | 'muted' | 'name'>>): Project {
  return { ...project, tracks: project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

/** Lajur pertama yang menerima jenis klip, atau lajur baru bila belum ada. */
export function ensureTrackFor(project: Project, kind: TrackKind): { project: Project; trackId: string } {
  const existing =
    kind === 'video'
      ? // Klip video baru masuk ke lajur video paling bawah (Video 1) sebagai lajur utama.
        [...project.tracks].reverse().find((t) => t.kind === 'video')
      : project.tracks.find((t) => t.kind === kind);
  if (existing) return { project, trackId: existing.id };
  return addTrack(project, kind);
}

export function clipsAt(project: Project, frame: number): Clip[] {
  return project.clips.filter((c) => c.start <= frame && frame < clipEnd(c));
}

export { clipsOnTrack };
