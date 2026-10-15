import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUST, DEFAULT_TRANSFORM, type TextClip } from '../timeline/model';
import { image, video } from '../timeline/test-helpers';
import { clipBounds, hitBounds, scaleFromDistance, snapToCenter, topmostAt, type BoundsEnv } from './clipBounds';

// Pratinjau 16:9 selebar 960px: satu piksel acuan (1920×1080) = 0,5 piksel pratinjau.
const env: BoundsEnv = {
  width: 960,
  height: 540,
  unit: 0.5,
  fontFamily: 'sans-serif',
  mediaSize: (id) => (id === 'm1' ? { width: 1920, height: 1080 } : id === 'img' ? { width: 1000, height: 1000 } : null),
  // Lebar tetap per karakter agar tes tidak bergantung pada font.
  measureText: (text, font) => text.length * Number(/([\d.]+)px/.exec(font)?.[1] ?? 0) * 0.5,
};

function text(extra: Partial<TextClip> = {}): TextClip {
  return {
    id: 't',
    type: 'text',
    trackId: 'track-text',
    start: 0,
    duration: 30,
    text: 'Halo',
    fontSize: 100,
    textColor: 'white',
    transform: DEFAULT_TRANSFORM,
    adjust: DEFAULT_ADJUST,
    ...extra,
  };
}

describe('batas klip di pratinjau', () => {
  it('video 16:9 memenuhi bingkai dan bergeser sesuai posisi', () => {
    expect(clipBounds(video('v', 0, 30), env)).toEqual({ id: 'v', cx: 480, cy: 270, rotation: 0, x: -480, y: -270, w: 960, h: 540 });
    const moved = clipBounds(video('v', 0, 30, { transform: { ...DEFAULT_TRANSFORM, x: 200, y: -100, scale: 0.5 } }), env);
    expect(moved).toMatchObject({ cx: 580, cy: 220, x: -240, y: -135, w: 480, h: 270 });
  });

  it('gambar persegi pas di tinggi bingkai dan mengikuti crop', () => {
    const b = clipBounds(image('i', 0, 30, { crop: { left: 0.5, right: 0, top: 0, bottom: 0.25 } }), env);
    expect(b).toMatchObject({ x: 0, y: -270, w: 270, h: 405 });
  });

  it('teks diukur per baris terpanjang dan ikut skala', () => {
    // fontSize 100 × unit 0,5 = 50px; tiap karakter 25px.
    const b = clipBounds(text({ text: 'Halo\nDunia!', transform: { ...DEFAULT_TRANSFORM, scale: 2 } }), env);
    expect(b).toMatchObject({ w: 6 * 25 * 2, h: 2 * 50 * 1.2 * 2 });
    expect(b?.x).toBe(-(b?.w ?? 0) / 2);
    expect(clipBounds(text({ text: '   ' }), env)).toBeNull();
  });

  it('tidak ada batas bila ukuran media belum diketahui', () => {
    expect(clipBounds(video('v', 0, 30, { mediaId: 'belum' }), env)).toBeNull();
  });
});

describe('klik di pratinjau', () => {
  const b = { id: 'a', cx: 100, cy: 100, rotation: 0, x: -50, y: -10, w: 100, h: 20 };

  it('mengenai persegi biasa dan area tambahan', () => {
    expect(hitBounds(b, 140, 105)).toBe(true);
    expect(hitBounds(b, 100, 125)).toBe(false);
    expect(hitBounds(b, 100, 113, 4)).toBe(true);
  });

  it('memperhitungkan rotasi', () => {
    const rotated = { ...b, rotation: 90 };
    expect(hitBounds(rotated, 100, 140)).toBe(true);
    expect(hitBounds(rotated, 140, 100)).toBe(false);
  });

  it('memilih lapisan paling atas', () => {
    const top = { ...b, id: 'atas' };
    expect(topmostAt([b, top], 100, 100)?.id).toBe('atas');
    expect(topmostAt([b, { ...top, cx: 400 }], 100, 100)?.id).toBe('a');
    expect(topmostAt([b], 400, 400)).toBeNull();
  });
});

describe('snap dan skala', () => {
  it('menempel ke garis tengah dalam ambang', () => {
    expect(snapToCenter(5, 8)).toEqual({ value: 0, snapped: true });
    expect(snapToCenter(-9, 8)).toEqual({ value: -9, snapped: false });
  });

  it('mengubah skala sebanding jarak dan membatasinya', () => {
    expect(scaleFromDistance(1, 100, 150)).toBe(1.5);
    expect(scaleFromDistance(1, 100, 1)).toBe(0.1);
    expect(scaleFromDistance(2, 100, 1000)).toBe(4);
    expect(scaleFromDistance(1, 0, 50)).toBe(1);
  });
});
