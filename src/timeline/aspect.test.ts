import { describe, expect, it } from 'vitest';
import { outputSize } from '../export/support';
import { ASPECTS, frameSize, sizeForShortSide } from './model';

describe('rasio bingkai', () => {
  it('menyediakan 16:9, 4:3, 1:1, 4:5, 3:4, dan 9:16', () => {
    expect(ASPECTS).toEqual(['16:9', '4:3', '1:1', '4:5', '3:4', '9:16']);
  });

  it('bingkai acuan bersisi pendek 1080', () => {
    expect(frameSize('16:9')).toEqual({ width: 1920, height: 1080 });
    expect(frameSize('4:3')).toEqual({ width: 1440, height: 1080 });
    expect(frameSize('1:1')).toEqual({ width: 1080, height: 1080 });
    expect(frameSize('4:5')).toEqual({ width: 1080, height: 1350 });
    expect(frameSize('3:4')).toEqual({ width: 1080, height: 1440 });
    expect(frameSize('9:16')).toEqual({ width: 1080, height: 1920 });
  });

  it('ukuran ekspor mengikuti sisi pendek resolusi', () => {
    expect(outputSize('4:3', 720)).toEqual({ width: 960, height: 720 });
    expect(outputSize('3:4', 1080)).toEqual({ width: 1080, height: 1440 });
    expect(outputSize('4:3', 2160)).toEqual({ width: 2880, height: 2160 });
    expect(outputSize('16:9', 720)).toEqual({ width: 1280, height: 720 });
  });

  it('selalu genap agar diterima encoder', () => {
    for (const aspect of ASPECTS) {
      for (const short of [480, 720, 1080, 2160]) {
        const { width, height } = sizeForShortSide(aspect, short);
        expect(width % 2).toBe(0);
        expect(height % 2).toBe(0);
      }
    }
  });
});
