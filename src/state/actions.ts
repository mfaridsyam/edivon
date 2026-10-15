import {
  DEFAULT_ADJUST,
  DEFAULT_CROP,
  DEFAULT_TRANSFORM,
  EFFECT_LABEL,
  clipEnd,
  clipLabel,
  findClip,
  findTrack,
  projectDuration,
  trackKindFor,
  isSourceTimed,
  mainTrackId,
  type Clip,
  type Project,
  type EffectId,
  type Speed,
  type TrackKind,
} from '../timeline/model';
import {
  addTrack as addTrackOp,
  deleteClips,
  ensureTrackFor,
  placeClip,
  splitAt,
  setSpeed,
  trimAt,
  updateClip,
  updateTrack,
} from '../timeline/ops';
import { TEXT_PRESETS, clipFromMedia, effectClip, textClipFromPreset, type TextPresetId } from './clipFactory';
import { formatTimecode } from '../timeline/time';
import { editor, type ToolId } from './store';
import type { CutId } from './tools';

/* Aksi tingkat tinggi yang dipakai bersama oleh tombol, pintasan, dan panel. */

export function deleteSelection(): void {
  const s = editor.get();
  const ids = s.selection;
  if (ids.length === 0) {
    s.announce('Tidak ada klip terpilih.');
    return;
  }
  s.apply((p) => deleteClips(p, ids));
  s.select([]);
  s.announce(ids.length === 1 ? 'Klip dihapus.' : `${ids.length} klip dihapus.`);
}

/**
 * Klip yang dikenai aksi di garis merah (playhead): klip terpilih yang dilalui garis itu.
 * Tanpa pilihan, Belah mengenai semua klip di bawah garis, sedangkan Potong kiri/kanan hanya klip
 * di lajur utama (bila ada), supaya musik dan teks tidak bergeser dari videonya.
 */
function playheadTargets(kind: 'split' | 'trim'): string[] {
  const s = editor.get();
  const p = s.project;
  const under = p.clips.filter((c) => c.start < s.playhead && s.playhead < clipEnd(c));
  const selected = under.filter((c) => s.selection.includes(c.id));
  if (selected.length > 0) return selected.map((c) => c.id);
  if (kind === 'trim') {
    const main = mainTrackId(p);
    const onMain = under.filter((c) => c.trackId === main);
    if (onMain.length > 0) return onMain.map((c) => c.id);
  }
  return under.map((c) => c.id);
}

/** True bila garis merah berada di dalam setidaknya satu klip. */
export function canCutAtPlayhead(project: Project, playhead: number): boolean {
  return project.clips.some((c) => c.start < playhead && playhead < clipEnd(c));
}

/** Belah (W): membelah klip di garis merah. */
export function splitAtPlayhead(): void {
  const s = editor.get();
  const ids = playheadTargets('split');
  if (ids.length === 0) {
    s.announce('Garis merah tidak berada di dalam klip.');
    return;
  }
  s.apply((p) => splitAt(p, s.playhead, ids).project);
  s.announce(`Klip dibelah di ${formatTimecode(s.playhead)}.`);
}

/** Potong kiri (Q) membuang bagian sebelum garis merah; potong kanan (E) membuang bagian sesudahnya. */
export function trimToPlayhead(edge: 'start' | 'end'): void {
  const s = editor.get();
  const ids = playheadTargets('trim');
  if (ids.length === 0) {
    s.announce('Garis merah tidak berada di dalam klip.');
    return;
  }
  const at = s.playhead;
  let trimmed: string[] = [];
  s.apply((p) => {
    const r = trimAt(p, at, edge, ids);
    trimmed = r.trimmed;
    return r.project;
  });
  if (edge === 'start') {
    // Di lajur utama klip merapat ke kiri; garis merah ikut ke awal bagian yang tersisa.
    const starts = trimmed.map((id) => findClip(editor.get().project, id)?.start ?? at);
    s.setPlayhead(Math.min(at, ...starts));
    s.announce(`Bagian sebelum ${formatTimecode(at)} dibuang.`);
  } else {
    s.announce(`Bagian sesudah ${formatTimecode(at)} dibuang.`);
  }
}

export function cutAtPlayhead(id: CutId): void {
  if (id === 'split') splitAtPlayhead();
  else trimToPlayhead(id === 'cut-left' ? 'start' : 'end');
}

export function addTrack(kind: TrackKind): void {
  const s = editor.get();
  let name = '';
  s.apply((p) => {
    const r = addTrackOp(p, kind);
    name = findTrack(r.project, r.trackId)?.name ?? '';
    return r.project;
  });
  s.announce(`Lajur ${name} ditambahkan.`);
}

export function toggleTrackHidden(trackId: string): void {
  const s = editor.get();
  const track = findTrack(s.project, trackId);
  if (!track) return;
  s.apply((p) => updateTrack(p, trackId, { hidden: !track.hidden }));
  s.announce(track.hidden ? `Lajur ${track.name} ditampilkan.` : `Lajur ${track.name} disembunyikan.`);
}

export function toggleTrackMuted(trackId: string): void {
  const s = editor.get();
  const track = findTrack(s.project, trackId);
  if (!track) return;
  s.apply((p) => updateTrack(p, trackId, { muted: !track.muted }));
  s.announce(track.muted ? `Suara lajur ${track.name} dinyalakan.` : `Lajur ${track.name} dibisukan.`);
}

export function selectClip(id: string, additive = false): void {
  const s = editor.get();
  if (additive) {
    const has = s.selection.includes(id);
    s.select(has ? s.selection.filter((x) => x !== id) : [...s.selection, id]);
    return;
  }
  if (s.selection.length !== 1 || s.selection[0] !== id) s.select([id]);
  const clip = findClip(s.project, id);
  if (clip) {
    // Panel properti mengikuti jenis klip agar langsung relevan.
    if (clip.type === 'audio' && s.rightTab === 'video') s.setRightTab('audio');
    if (clip.type !== 'audio' && s.rightTab === 'audio' && clip.type !== 'video') s.setRightTab('video');
  }
}

export function jumpToStart(): void {
  editor.get().setPlayhead(0);
}

export function jumpToEnd(): void {
  const s = editor.get();
  s.setPlayhead(projectDuration(s.project));
}

export function describeClip(id: string): string {
  const clip = findClip(editor.get().project, id);
  return clip ? clipLabel(clip) : '';
}

/* ---------- Menambah klip ---------- */

export interface Placement {
  trackId: string;
  start: number;
}

/** Menambah media ke timeline. Tanpa `at`: di playhead pada lajur yang cocok, lalu playhead pindah ke akhir klip. */
export function addMediaToTimeline(mediaId: string, at?: Placement): void {
  const s = editor.get();
  const media = s.media.find((m) => m.id === mediaId);
  if (!media || media.status !== 'ready') {
    s.announce(media?.status === 'error' ? `${media.name} tidak bisa dipakai.` : 'Media masih dibaca.');
    return;
  }
  let clipId = '';
  let start = 0;
  let end = 0;
  s.apply((p) => {
    let project = p;
    let trackId = at?.trackId;
    if (!trackId) {
      const r = ensureTrackFor(p, trackKindFor(media.kind));
      project = r.project;
      trackId = r.trackId;
    }
    const clip = clipFromMedia(media, trackId, at?.start ?? s.playhead);
    clipId = clip.id;
    const next = placeClip(project, clip, trackId, clip.start);
    const placed = findClip(next, clip.id);
    start = placed?.start ?? 0;
    end = placed ? clipEnd(placed) : 0;
    return next;
  });
  s.select([clipId]);
  if (!at) s.setPlayhead(end);
  s.announce(`${media.name} ditambahkan di ${formatTimecode(start)}.`);
}

export interface LoosePlacement {
  /** Bila tidak diisi, dipakai lajur pertama yang cocok (dibuat bila belum ada). */
  trackId?: string;
  start: number;
  duration?: number;
}

export function addTextClip(presetId: TextPresetId, at?: LoosePlacement): void {
  const s = editor.get();
  const preset = TEXT_PRESETS.find((t) => t.id === presetId) ?? TEXT_PRESETS[0];
  if (!preset) return;
  let clipId = '';
  s.apply((p) => {
    let project = p;
    let trackId = at?.trackId;
    if (!trackId) {
      const r = ensureTrackFor(p, 'text');
      project = r.project;
      trackId = r.trackId;
    }
    const clip = textClipFromPreset(preset, p.aspect, trackId, at?.start ?? s.playhead, at?.duration);
    clipId = clip.id;
    return placeClip(project, clip, trackId, clip.start);
  });
  s.select([clipId]);
  s.setRightTab('video');
  s.announce(`Teks ${preset.label.toLowerCase()} ditambahkan.`);
}

/**
 * Menambah klip efek. Tanpa `at`: menutupi klip visual terpilih bila ada, selain itu 3 detik di playhead.
 */
export function addEffectClip(effect: EffectId, at?: LoosePlacement): void {
  const s = editor.get();
  let start = at?.start ?? s.playhead;
  let duration = at?.duration;
  if (!at) {
    const target = s.selection.map((id) => findClip(s.project, id)).find((c) => c && c.type !== 'audio' && c.type !== 'effect');
    if (target) {
      start = target.start;
      duration = target.duration;
    }
  }
  let clipId = '';
  s.apply((p) => {
    let project = p;
    let trackId = at?.trackId;
    if (!trackId) {
      const r = ensureTrackFor(p, 'effect');
      project = r.project;
      trackId = r.trackId;
    }
    const clip = effectClip(effect, trackId, start, duration);
    clipId = clip.id;
    return placeClip(project, clip, trackId, clip.start);
  });
  s.select([clipId]);
  s.announce(`Efek ${EFFECT_LABEL[effect].toLowerCase()} ditambahkan.`);
}

/* ---------- Mengubah properti klip ---------- */

/** Mengubah klip dengan riwayat yang digabung per kunci, agar slider yang digeser menjadi satu langkah undo. */
export function patchClip(id: string, key: string, fn: (clip: Clip) => Clip): void {
  editor.get().apply((p) => updateClip(p, id, fn), { coalesce: `${id}:${key}` });
}

export function changeSpeed(id: string, speed: Speed): void {
  const s = editor.get();
  const clip = findClip(s.project, id);
  if (!clip || !isSourceTimed(clip)) return;
  s.apply((p) => setSpeed(p, id, speed));
  s.announce(`Kecepatan ${String(speed).replace('.', ',')} kali.`);
}

/** Klip efek di atas klip visual: menutupi rentang klip itu. Klip efek: mengganti jenis efeknya. */
export function applyEffectToClip(id: string, effect: EffectId): void {
  const s = editor.get();
  const clip = findClip(s.project, id);
  if (!clip) return;
  if (clip.type === 'effect') {
    s.apply((p) => updateClip(p, id, (c) => (c.type === 'effect' ? { ...c, effect } : c)));
    s.announce(`Efek diganti menjadi ${EFFECT_LABEL[effect].toLowerCase()}.`);
    return;
  }
  if (clip.type === 'audio') {
    s.announce('Efek hanya untuk klip video, gambar, dan teks.');
    return;
  }
  addEffectClip(effect, { start: clip.start, duration: clip.duration });
}

export function setTool(tool: ToolId): void {
  const s = editor.get();
  s.setTool(tool);
  if (tool === 'text') s.setLeftTab('text');
  if (tool === 'effect') s.setLeftTab('effect');
}

/** "Setel ulang" satu tab Inspector, dicatat sebagai satu langkah undo. */
export function resetClip(id: string, scope: 'video' | 'audio' | 'color'): void {
  const s = editor.get();
  s.apply((p) => {
    const clip = findClip(p, id);
    if (!clip) return p;
    let next = p;
    if ((scope === 'video' && clip.type === 'video') || (scope === 'audio' && clip.type === 'audio')) {
      next = setSpeed(next, id, 1);
    }
    return updateClip(next, id, (c) => {
      if (scope === 'color') return 'adjust' in c ? { ...c, adjust: DEFAULT_ADJUST } : c;
      if (scope === 'audio') return c.type === 'video' || c.type === 'audio' ? { ...c, volume: 1 } : c;
      switch (c.type) {
        case 'video':
        case 'image':
          return { ...c, transform: DEFAULT_TRANSFORM, crop: DEFAULT_CROP };
        case 'text':
          return { ...c, transform: DEFAULT_TRANSFORM };
        case 'effect':
          return { ...c, opacity: 1 };
        default:
          return c;
      }
    });
  });
  s.announce('Properti disetel ulang.');
}
