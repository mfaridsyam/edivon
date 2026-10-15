import { describe, expect, it } from 'vitest';
import { clipEnd, createProject, findClip, maxDuration, projectDuration, type VideoClip } from './model';
import {
  addTrack,
  deleteClips,
  ensureTrackFor,
  moveClip,
  nudgeClip,
  packMainTrack,
  placeClip,
  previewPlacement,
  setSpeed,
  splitAt,
  splitClip,
  trimAt,
  trimEnd,
  trimStart,
} from './ops';
import { audio, image, layout, projectWith, video } from './test-helpers';

/** Video 2: lajur video bebas (bukan lajur utama). */
const V2 = 'track-video-2';
const onV2 = { trackId: V2 };

describe('model', () => {
  it('membuat proyek dengan lajur Teks, Video 2, Video 1, Audio 1', () => {
    const p = createProject();
    expect(p.tracks.map((t) => t.name)).toEqual(['Teks', 'Video 2', 'Video 1', 'Audio 1']);
    expect(p.clips).toEqual([]);
  });

  it('menghitung durasi proyek dari akhir klip terjauh', () => {
    const p = projectWith(video('a', 0, 30), audio('b', 10, 100));
    expect(projectDuration(p)).toBe(110);
  });

  it('membatasi durasi maksimum klip video menurut sisa sumber dan kecepatan', () => {
    expect(maxDuration(video('a', 0, 30, { in: 4, sourceDuration: 10 }))).toBe(180);
    expect(maxDuration(video('a', 0, 30, { in: 4, sourceDuration: 10, speed: 2 }))).toBe(90);
    expect(maxDuration(image('i', 0, 30))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('placeClip (lajur bebas)', () => {
  it('menaruh klip di ruang kosong apa adanya', () => {
    const p = placeClip(projectWith(video('a', 0, 30, onV2)), video('b', 0, 20, onV2), V2, 60);
    expect(layout(p, V2)).toEqual([
      ['a', 0, 30],
      ['b', 60, 20],
    ]);
  });

  it('tidak pernah menaruh klip sebelum frame 0', () => {
    const p = placeClip(createProject(), video('a', 0, 30, onV2), V2, -15);
    expect(layout(p, V2)).toEqual([['a', 0, 30]]);
  });

  it('mendorong klip kanan bila tumpang tindih di ujung', () => {
    const p = placeClip(projectWith(video('a', 0, 30, onV2), video('c', 40, 10, onV2)), video('b', 0, 20, onV2), V2, 25);
    // 25 ada di paruh kanan "a" (0..30) sehingga "b" ditaruh di 30, lalu "c" didorong.
    expect(layout(p, V2)).toEqual([
      ['a', 0, 30],
      ['b', 30, 20],
      ['c', 50, 10],
    ]);
  });

  it('menyisipkan sebelum klip bila jatuh di paruh kirinya', () => {
    const p = placeClip(projectWith(video('a', 0, 30, onV2)), video('b', 0, 20, onV2), V2, 10);
    expect(layout(p, V2)).toEqual([
      ['b', 0, 20],
      ['a', 20, 30],
    ]);
  });

  it('menjaga jarak antar klip yang didorong', () => {
    const p = placeClip(projectWith(video('a', 0, 30, onV2), video('c', 60, 30, onV2)), video('b', 0, 40, onV2), V2, 30);
    expect(layout(p, V2)).toEqual([
      ['a', 0, 30],
      ['b', 30, 40],
      ['c', 70, 30],
    ]);
  });

  it('tidak menyentuh lajur lain', () => {
    const p = placeClip(projectWith(video('a', 0, 30, onV2), audio('x', 0, 30)), video('b', 0, 20, onV2), V2, 0);
    expect(layout(p, 'track-audio-1')).toEqual([['x', 0, 30]]);
  });
});

describe('moveClip', () => {
  it('mengurutkan ulang: klip kedua dipindah ke awal', () => {
    const p = moveClip(projectWith(video('a', 0, 30), video('b', 30, 45)), 'b', 'track-video-1', 0);
    expect(layout(p)).toEqual([
      ['b', 0, 45],
      ['a', 45, 30],
    ]);
  });

  it('memindah ke lajur video lain', () => {
    const p = moveClip(projectWith(video('a', 0, 30)), 'a', 'track-video-2', 12);
    expect(layout(p, 'track-video-2')).toEqual([['a', 12, 30]]);
    expect(layout(p)).toEqual([]);
  });

  it('menjaga urutan klip dalam array agar render stabil', () => {
    const p = moveClip(projectWith(video('a', 0, 30), video('b', 30, 45), video('c', 90, 10)), 'a', 'track-video-1', 200);
    expect(p.clips.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('menolak lajur yang jenisnya tidak cocok', () => {
    const before = projectWith(video('a', 0, 30));
    expect(moveClip(before, 'a', 'track-audio-1', 0)).toBe(before);
  });
});

describe('nudgeClip (lajur bebas)', () => {
  it('berhenti di tepi tetangga', () => {
    const p0 = projectWith(video('a', 0, 30, onV2), video('b', 40, 10, onV2));
    expect(layout(nudgeClip(p0, 'b', -20), V2)).toEqual([
      ['a', 0, 30],
      ['b', 30, 10],
    ]);
    expect(layout(nudgeClip(p0, 'a', 25), V2)).toEqual([
      ['a', 10, 30],
      ['b', 40, 10],
    ]);
  });
});

describe('splitClip', () => {
  it('membelah video dan menggeser titik masuk bagian kanan', () => {
    const p0 = projectWith(video('a', 30, 90, { in: 2 }));
    const { project, rightId } = splitClip(p0, 'a', 60, 'a2');
    expect(rightId).toBe('a2');
    expect(layout(project)).toEqual([
      ['a', 30, 30],
      ['a2', 60, 60],
    ]);
    expect((findClip(project, 'a2') as VideoClip).in).toBeCloseTo(3);
    expect((findClip(project, 'a') as VideoClip).in).toBe(2);
  });

  it('memperhitungkan kecepatan saat menghitung titik masuk', () => {
    const p0 = projectWith(video('a', 0, 60, { speed: 2 }));
    const { project } = splitClip(p0, 'a', 15, 'a2');
    expect((findClip(project, 'a2') as VideoClip).in).toBeCloseTo(1);
  });

  it('tidak berubah bila frame di tepi atau di luar klip', () => {
    const p0 = projectWith(video('a', 30, 90));
    expect(splitClip(p0, 'a', 30).rightId).toBeNull();
    expect(splitClip(p0, 'a', 120).rightId).toBeNull();
    expect(splitClip(p0, 'a', 200).project).toBe(p0);
  });

  it('membelah semua klip yang dilewati playhead', () => {
    const p0 = projectWith(video('a', 0, 60), audio('x', 0, 90), video('b', 60, 30));
    const { project, created } = splitAt(p0, 45);
    expect(created).toHaveLength(2);
    expect(project.clips).toHaveLength(5);
    expect(layout(project, 'track-audio-1').map((c) => c[2])).toEqual([45, 45]);
  });

  it('hanya membelah klip terpilih bila diberikan', () => {
    const p0 = projectWith(video('a', 0, 60), audio('x', 0, 90));
    const { project } = splitAt(p0, 45, ['x']);
    expect(layout(project)).toEqual([['a', 0, 60]]);
    expect(layout(project, 'track-audio-1')).toHaveLength(2);
  });
});

describe('trim (lajur bebas)', () => {
  it('trim kiri menggeser titik masuk sumber', () => {
    const p = trimStart(projectWith(video('a', 30, 60, { ...onV2, in: 1 })), 'a', 45);
    const a = findClip(p, 'a') as VideoClip;
    expect([a.start, a.duration]).toEqual([45, 45]);
    expect(a.in).toBeCloseTo(1.5);
  });

  it('trim kiri tidak bisa melewati awal sumber', () => {
    const p = trimStart(projectWith(video('a', 60, 30, { ...onV2, in: 1 })), 'a', 0);
    const a = findClip(p, 'a') as VideoClip;
    expect([a.start, a.duration, a.in]).toEqual([30, 60, 0]);
  });

  it('trim kiri berhenti di klip sebelumnya', () => {
    const p = trimStart(projectWith(video('x', 0, 20, onV2), video('a', 30, 30, { ...onV2, in: 5 })), 'a', 0);
    expect(layout(p, V2)).toEqual([
      ['x', 0, 20],
      ['a', 20, 40],
    ]);
  });

  it('trim kiri menyisakan minimal satu frame', () => {
    const p = trimStart(projectWith(video('a', 0, 30, onV2)), 'a', 100);
    expect(layout(p, V2)).toEqual([['a', 29, 1]]);
  });

  it('trim kanan dibatasi panjang sumber', () => {
    const p = trimEnd(projectWith(video('a', 0, 30, { ...onV2, in: 8, sourceDuration: 10 })), 'a', 500);
    expect(layout(p, V2)).toEqual([['a', 0, 60]]);
  });

  it('trim kanan berhenti di klip berikutnya', () => {
    const p = trimEnd(projectWith(video('a', 0, 30, onV2), video('b', 50, 10, onV2)), 'a', 90);
    expect(layout(p, V2)).toEqual([
      ['a', 0, 50],
      ['b', 50, 10],
    ]);
  });

  it('gambar bisa diperpanjang tanpa batas sumber', () => {
    const p = trimEnd(projectWith(image('i', 0, 150, onV2)), 'i', 900);
    expect(clipEnd(findClip(p, 'i')!)).toBe(900);
  });
  it('memotong awal atau akhir ke playhead (Q/W)', () => {
    const base = projectWith(video('a', 0, 60, { ...onV2, in: 1 }), audio('m', 30, 60));
    const start = trimAt(base, 45, 'start');
    expect(start.trimmed.sort()).toEqual(['a', 'm']);
    expect(layout(start.project, V2)).toEqual([['a', 45, 15]]);
    expect(layout(start.project, 'track-audio-1')).toEqual([['m', 45, 45]]);
    expect((findClip(start.project, 'a') as VideoClip).in).toBeCloseTo(2.5);

    const end = trimAt(base, 45, 'end', ['a']);
    expect(end.trimmed).toEqual(['a']);
    expect(layout(end.project, V2)).toEqual([['a', 0, 45]]);
    expect(layout(end.project, 'track-audio-1')).toEqual([['m', 30, 60]]);
  });

  it('tidak memotong bila playhead di luar klip atau tepat di ujungnya', () => {
    const base = projectWith(video('a', 30, 30, onV2));
    expect(trimAt(base, 10, 'end').trimmed).toEqual([]);
    expect(trimAt(base, 30, 'start').trimmed).toEqual([]);
    expect(trimAt(base, 60, 'end').project).toBe(base);
  });
});

describe('setSpeed', () => {
  it('mempercepat memperpendek durasi', () => {
    const p = setSpeed(projectWith(video('a', 0, 120)), 'a', 2);
    expect(layout(p)).toEqual([['a', 0, 60]]);
  });

  it('memperlambat memperpanjang durasi dan mendorong klip berikutnya', () => {
    const p = setSpeed(projectWith(video('a', 0, 60), video('b', 60, 30)), 'a', 0.5);
    expect(layout(p)).toEqual([
      ['a', 0, 120],
      ['b', 120, 30],
    ]);
  });
});

describe('lajur', () => {
  it('menambah lajur video sebagai lapisan video teratas', () => {
    const { project } = addTrack(createProject(), 'video', 'v3');
    expect(project.tracks.map((t) => t.name)).toEqual(['Teks', 'Video 3', 'Video 2', 'Video 1', 'Audio 1']);
  });

  it('menambah lajur efek di atas video dan audio di bawah', () => {
    let { project } = addTrack(createProject(), 'effect', 'e1');
    ({ project } = addTrack(project, 'audio', 'a2'));
    expect(project.tracks.map((t) => t.name)).toEqual(['Teks', 'Efek 1', 'Video 2', 'Video 1', 'Audio 1', 'Audio 2']);
  });

  it('memakai lajur yang ada atau membuat yang baru', () => {
    const p = createProject();
    expect(ensureTrackFor(p, 'video').trackId).toBe('track-video-1');
    const r = ensureTrackFor(p, 'effect');
    expect(r.project.tracks.some((t) => t.id === r.trackId && t.kind === 'effect')).toBe(true);
  });

  it('menghapus klip di lajur bebas tanpa menggeser yang lain', () => {
    const p = deleteClips(projectWith(video('a', 0, 30, onV2), video('b', 30, 30, onV2)), ['a']);
    expect(layout(p, V2)).toEqual([['b', 30, 30]]);
  });
});

describe('lajur utama magnetis (Video 1)', () => {
  it('klip pertama selalu mulai di 0 walau dijatuhkan jauh di kanan', () => {
    const p = placeClip(createProject(), video('a', 0, 30), 'track-video-1', 540);
    expect(layout(p)).toEqual([['a', 0, 30]]);
  });

  it('menyisipkan di antara klip menurut titik tengahnya, lalu merapatkan', () => {
    const base = projectWith(video('a', 0, 30), video('b', 30, 30));
    expect(layout(placeClip(base, video('c', 0, 20), 'track-video-1', 40))).toEqual([
      ['a', 0, 30],
      ['c', 30, 20],
      ['b', 50, 30],
    ]);
    expect(layout(placeClip(base, video('c', 0, 20), 'track-video-1', 10))).toEqual([
      ['c', 0, 20],
      ['a', 20, 30],
      ['b', 50, 30],
    ]);
    expect(layout(placeClip(base, video('c', 0, 20), 'track-video-1', 900))).toEqual([
      ['a', 0, 30],
      ['b', 30, 30],
      ['c', 60, 20],
    ]);
  });

  it('bayangan seret menunjuk batas klip tempat sisipan', () => {
    const base = projectWith(video('a', 0, 30), video('b', 30, 30));
    expect(previewPlacement(base, 'track-video-1', 40)).toBe(30);
    expect(previewPlacement(base, 'track-video-1', 500)).toBe(60);
    expect(previewPlacement(base, 'track-video-2', 500)).toBe(500);
  });

  it('menyeret klip mengubah urutan tanpa celah', () => {
    const base = projectWith(video('a', 0, 30), video('b', 30, 45), video('c', 75, 10));
    expect(layout(moveClip(base, 'c', 'track-video-1', 0))).toEqual([
      ['c', 0, 10],
      ['a', 10, 30],
      ['b', 40, 45],
    ]);
    expect(layout(moveClip(base, 'a', 'track-video-1', 60))).toEqual([
      ['b', 0, 45],
      ['a', 45, 30],
      ['c', 75, 10],
    ]);
  });

  it('memindah klip ke Video 2 menutup celahnya, dan kembali ke Video 1 disisipkan', () => {
    const base = projectWith(video('a', 0, 30), video('b', 30, 30), video('c', 60, 30));
    const out = moveClip(base, 'b', V2, 100);
    expect(layout(out)).toEqual([
      ['a', 0, 30],
      ['c', 30, 30],
    ]);
    expect(layout(out, V2)).toEqual([['b', 100, 30]]);
    expect(layout(moveClip(out, 'b', 'track-video-1', 0))).toEqual([
      ['b', 0, 30],
      ['a', 30, 30],
      ['c', 60, 30],
    ]);
  });

  it('panah menukar klip dengan tetangganya', () => {
    const base = projectWith(video('a', 0, 30), video('b', 30, 10));
    expect(layout(nudgeClip(base, 'b', -1))).toEqual([
      ['b', 0, 10],
      ['a', 10, 30],
    ]);
    expect(layout(nudgeClip(base, 'a', 30))).toEqual([
      ['b', 0, 10],
      ['a', 10, 30],
    ]);
    expect(nudgeClip(base, 'a', -1)).toBe(base);
    expect(nudgeClip(base, 'b', 1)).toBe(base);
  });

  it('memendekkan ujung kanan menarik klip berikutnya; memanjangkan mendorongnya', () => {
    const base = projectWith(video('a', 0, 60), video('b', 60, 30));
    expect(layout(trimEnd(base, 'a', 40))).toEqual([
      ['a', 0, 40],
      ['b', 40, 30],
    ]);
    // Tidak berhenti di klip berikutnya; dibatasi panjang sumber (10 detik = 300 frame).
    expect(layout(trimEnd(base, 'a', 1000))).toEqual([
      ['a', 0, 300],
      ['b', 300, 30],
    ]);
  });

  it('ujung kiri tetap menempel; isi sumber dan klip berikutnya yang bergeser', () => {
    const base = projectWith(video('x', 0, 30), video('a', 30, 60, { in: 2 }), video('b', 90, 30));
    const shorter = trimStart(base, 'a', 45);
    expect(layout(shorter)).toEqual([
      ['x', 0, 30],
      ['a', 30, 45],
      ['b', 75, 30],
    ]);
    expect((findClip(shorter, 'a') as VideoClip).in).toBeCloseTo(2.5);

    // Ditarik ke kiri: memunculkan isi sebelumnya (sampai awal sumber), urutan tetap.
    const longer = trimStart(base, 'a', -500);
    expect(layout(longer)).toEqual([
      ['x', 0, 30],
      ['a', 30, 120],
      ['b', 150, 30],
    ]);
    expect((findClip(longer, 'a') as VideoClip).in).toBe(0);
  });

  it('Q di lajur utama membuang bagian sebelum playhead tanpa meninggalkan celah', () => {
    const base = projectWith(video('a', 0, 60, { in: 1 }), video('b', 60, 30));
    const { project } = trimAt(base, 45, 'start');
    expect(layout(project)).toEqual([
      ['a', 0, 15],
      ['b', 15, 30],
    ]);
    expect((findClip(project, 'a') as VideoClip).in).toBeCloseTo(2.5);
  });

  it('mengubah kecepatan dan menghapus klip tetap rapat', () => {
    const base = projectWith(video('a', 0, 120), video('b', 120, 30));
    expect(layout(setSpeed(base, 'a', 2))).toEqual([
      ['a', 0, 60],
      ['b', 60, 30],
    ]);
    expect(layout(deleteClips(base, ['a']))).toEqual([['b', 0, 30]]);
  });

  it('merapatkan proyek lama yang masih bercelah, tanpa membuat objek baru bila sudah rapat', () => {
    const gappy = projectWith(video('a', 540, 30), video('b', 900, 30), video('t', 300, 30, onV2));
    const packed = packMainTrack(gappy);
    expect(layout(packed)).toEqual([
      ['a', 0, 30],
      ['b', 30, 30],
    ]);
    expect(layout(packed, V2)).toEqual([['t', 300, 30]]);
    expect(packMainTrack(packed)).toBe(packed);
  });
});
