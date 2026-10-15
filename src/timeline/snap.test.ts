import { describe, expect, it } from 'vitest';
import { snapDelta, snapTargets, snapThreshold } from './snap';
import { formatShort, formatTimecode, rulerSteps } from './time';
import { projectWith, video } from './test-helpers';

describe('snap', () => {
  it('menempel ke target terdekat dalam ambang', () => {
    expect(snapDelta([100, 130], [95, 200], 8)).toEqual({ delta: -5, target: 95 });
    expect(snapDelta([100, 130], [134], 8)).toEqual({ delta: 4, target: 134 });
  });

  it('tidak menempel bila di luar ambang', () => {
    expect(snapDelta([100], [120], 8)).toEqual({ delta: 0, target: null });
  });

  it('memilih jarak terkecil di antara beberapa kandidat', () => {
    expect(snapDelta([100, 160], [103, 161], 8)).toEqual({ delta: 1, target: 161 });
  });

  it('mengumpulkan tepi klip lain, playhead, dan nol', () => {
    const p = projectWith(video('a', 0, 30), video('b', 60, 30));
    const targets = snapTargets(p, new Set(['b']), 45).sort((x, y) => x - y);
    expect(targets).toEqual([0, 30, 45]);
  });

  it('mengubah ambang piksel menjadi frame sesuai zoom', () => {
    expect(snapThreshold(12, 30)).toBe(20);
    expect(snapThreshold(300, 30)).toBe(1);
  });
});

describe('waktu', () => {
  it('memformat timecode JJ:MM:DD.FF', () => {
    expect(formatTimecode(0)).toBe('00:00:00.00');
    expect(formatTimecode(18 * 30 + 12)).toBe('00:00:18.12');
    expect(formatTimecode(3600 * 30 + 61 * 30 + 29)).toBe('01:01:01.29');
  });

  it('memformat durasi pendek', () => {
    expect(formatShort(10)).toBe('00:10');
    expect(formatShort(125.9)).toBe('02:05');
    expect(formatShort(3725)).toBe('1:02:05');
  });

  it('memakai tick 2 detik dan label 10 detik pada zoom bawaan', () => {
    expect(rulerSteps(12)).toEqual({ minor: 2, major: 10 });
    expect(rulerSteps(100).minor).toBeLessThan(1);
  });
});
