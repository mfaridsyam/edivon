import {
  EFFECT_LABEL,
  clipEnd,
  clipLabel,
  findClip,
  findTrack,
  projectDuration,
  trackKindFor,
  type EffectId,
  type TrackKind,
} from '../timeline/model';
import {
  addTrack as addTrackOp,
  deleteClips,
  ensureTrackFor,
  placeClip,
  splitAt,
  splitClip,
  updateTrack,
} from '../timeline/ops';
import { TEXT_PRESETS, clipFromMedia, effectClip, textClipFromPreset, type TextPresetId } from './clipFactory';
import { formatTimecode } from '../timeline/time';
import { editor } from './store';

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

/** Membelah klip terpilih di playhead; bila tidak ada yang terpilih, semua klip di bawah playhead. */
export function splitAtPlayhead(): void {
  const s = editor.get();
  const ids = s.selection.length > 0 ? s.selection : undefined;
  let created: string[] = [];
  s.apply((p) => {
    const r = splitAt(p, s.playhead, ids);
    created = r.created;
    return r.project;
  });
  if (created.length === 0) {
    s.announce('Playhead tidak berada di dalam klip.');
    return;
  }
  s.announce(`Klip dibelah di ${formatTimecode(s.playhead)}.`);
}

export function splitClipAt(id: string, frame: number): void {
  const s = editor.get();
  let rightId: string | null = null;
  s.apply((p) => {
    const r = splitClip(p, id, frame);
    rightId = r.rightId;
    return r.project;
  });
  if (rightId) {
    s.select([rightId]);
    s.announce(`Klip dibelah di ${formatTimecode(frame)}.`);
  }
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

export function addTextClip(presetId: TextPresetId, at?: Placement & { duration?: number }): void {
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
export function addEffectClip(effect: EffectId, at?: Placement & { duration?: number }): void {
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
