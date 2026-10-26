import { describe, expect, it } from 'vitest';
import { ASPECT_RATIO, ASPECTS } from '../timeline/model';
import { SOCIAL_PRESETS, letterbox, presetById } from './presets';

describe('preset media sosial', () => {
  it('menyediakan Status WhatsApp, Feed Instagram, serta Story & Reels Instagram', () => {
    expect(SOCIAL_PRESETS.map((p) => p.id)).toEqual(['wa-status', 'ig-feed', 'ig-story']);
    expect(presetById('wa-status')).toMatchObject({ width: 720, height: 1280, aspect: '9:16' });
    expect(presetById('ig-feed')).toMatchObject({ width: 1080, height: 1350, aspect: '4:5' });
    expect(presetById('ig-story')).toMatchObject({ width: 1080, height: 1920, aspect: '9:16' });
    expect(presetById('custom')).toBeUndefined();
  });

  it('ukurannya genap dan sesuai rasionya', () => {
    for (const p of SOCIAL_PRESETS) {
      expect(p.width % 2).toBe(0);
      expect(p.height % 2).toBe(0);
      expect(ASPECTS).toContain(p.aspect);
      const [w, h] = ASPECT_RATIO[p.aspect];
      expect(p.width / p.height).toBeCloseTo(w / h, 3);
      expect(p.videoBitrate).toBeGreaterThanOrEqual(3_000_000);
      expect(p.audioBitrate).toBe(128_000);
    }
  });
});

describe('letterbox', () => {
  it('tidak perlu bila rasionya sama', () => {
    expect(letterbox('9:16', 720, 1280)).toBeNull();
    expect(letterbox('4:5', 1080, 1350)).toBeNull();
  });

  it('menaruh proyek lanskap di tengah bingkai tegak', () => {
    const r = letterbox('16:9', 720, 1280);
    expect(r).toEqual({ x: 0, y: 437, width: 720, height: 406 });
  });

  it('menaruh proyek tegak di tengah bingkai 4:5 dengan sisi kiri-kanan hitam', () => {
    const r = letterbox('9:16', 1080, 1350);
    expect(r?.height).toBe(1350);
    expect(r?.width).toBe(760);
    expect(r?.x).toBe(160);
  });

  it('selalu muat dan genap', () => {
    for (const aspect of ASPECTS) {
      for (const p of SOCIAL_PRESETS) {
        const r = letterbox(aspect, p.width, p.height);
        if (!r) continue;
        expect(r.width % 2).toBe(0);
        expect(r.height % 2).toBe(0);
        expect(r.x + r.width).toBeLessThanOrEqual(p.width);
        expect(r.y + r.height).toBeLessThanOrEqual(p.height);
      }
    }
  });
});
