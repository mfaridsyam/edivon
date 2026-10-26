import { describe, expect, it } from 'vitest';
import { ASPECTS } from '../timeline/model';
import { SOCIAL_PRESETS, letterbox, presetById, presetPlan, projectAspectAllowed, type SocialPreset } from './presets';

const wa = presetById('wa-status') as SocialPreset;
const feed = presetById('ig-feed') as SocialPreset;
const story = presetById('ig-story') as SocialPreset;

describe('preset media sosial', () => {
  it('menyediakan Status WhatsApp, Feed Instagram, serta Story & Reels Instagram', () => {
    expect(SOCIAL_PRESETS.map((p) => p.id)).toEqual(['wa-status', 'ig-feed', 'ig-story']);
    expect(presetById('custom')).toBeUndefined();
  });

  it('rasio penuh layar memberi ukuran dan bitrate yang dianjurkan', () => {
    expect(presetPlan(wa, '9:16', 'project', 720)).toMatchObject({ width: 720, height: 1280, videoBitrate: 3_000_000, inner: null });
    expect(presetPlan(feed, '4:5', 'project', 1080)).toMatchObject({ width: 1080, height: 1350, videoBitrate: 7_900_000 });
    expect(presetPlan(story, '9:16', 'project', 1080)).toMatchObject({ width: 1080, height: 1920, videoBitrate: 10_000_000 });
  });

  it('Story dan Status tidak wajib 9:16: bawaannya mengikuti rasio proyek', () => {
    const p = presetPlan(story, '16:9', 'project', 1080);
    expect(p).toMatchObject({ aspect: '16:9', width: 1920, height: 1080, inner: null, fit: 'project' });
    expect(presetPlan(wa, '4:3', 'project', 720)).toMatchObject({ aspect: '4:3', width: 960, height: 720 });
    expect(presetPlan(story, '1:1', 'project', 720)).toMatchObject({ width: 720, height: 720 });
  });

  it('pilihan penuh layar menaruh proyek utuh di tengah bingkai tegak', () => {
    const p = presetPlan(wa, '16:9', 'fill', 720);
    expect(p).toMatchObject({ aspect: '9:16', width: 720, height: 1280, fit: 'fill' });
    expect(p.inner).toEqual({ x: 0, y: 437, width: 720, height: 406 });
  });

  it('resolusi bisa dipilih; bitrate mengikuti ukuran', () => {
    const p720 = presetPlan(story, '9:16', 'project', 720);
    const p1080 = presetPlan(story, '9:16', 'project', 1080);
    expect([p720.width, p720.height]).toEqual([720, 1280]);
    expect(p1080.videoBitrate).toBeGreaterThan(p720.videoBitrate);
    expect(presetPlan(wa, '9:16', 'project', 1080)).toMatchObject({ width: 1080, height: 1920 });
  });

  it('Feed Instagram memakai 4:5 berlatar hitam untuk proyek yang terlalu tegak', () => {
    expect(projectAspectAllowed(feed, '16:9')).toBe(true);
    expect(projectAspectAllowed(feed, '4:5')).toBe(true);
    expect(projectAspectAllowed(feed, '3:4')).toBe(false);
    expect(projectAspectAllowed(feed, '9:16')).toBe(false);
    expect(presetPlan(feed, '16:9', 'project', 1080)).toMatchObject({ width: 1920, height: 1080, inner: null });
    const tall = presetPlan(feed, '9:16', 'project', 1080);
    expect(tall).toMatchObject({ aspect: '4:5', width: 1080, height: 1350, fit: 'fill' });
    expect(tall.inner).toEqual({ x: 160, y: 0, width: 760, height: 1350 });
  });

  it('semua kombinasi menghasilkan ukuran genap dan area yang muat', () => {
    for (const preset of SOCIAL_PRESETS) {
      for (const aspect of ASPECTS) {
        for (const fit of ['project', 'fill'] as const) {
          for (const short of [720, 1080] as const) {
            const p = presetPlan(preset, aspect, fit, short);
            expect(p.width % 2).toBe(0);
            expect(p.height % 2).toBe(0);
            expect(p.videoBitrate).toBeGreaterThanOrEqual(1_000_000);
            if (p.inner) {
              expect(p.inner.x + p.inner.width).toBeLessThanOrEqual(p.width);
              expect(p.inner.y + p.inner.height).toBeLessThanOrEqual(p.height);
            }
          }
        }
      }
    }
  });
});

describe('letterbox', () => {
  it('tidak perlu bila rasionya sama', () => {
    expect(letterbox('9:16', 720, 1280)).toBeNull();
    expect(letterbox('4:5', 1080, 1350)).toBeNull();
  });
});
