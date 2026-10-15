import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/**
 * Membuat dua video contoh di browser (WebCodecs + mediabunny), karena berkas media tidak disimpan di repo.
 * Hasilnya ditulis ke e2e/.fixtures/ (diabaikan git).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
export const FIXTURE_DIR = join(HERE, '.fixtures');

export interface Fixture {
  name: string;
  path: string;
  mimeType: string;
}

interface Spec {
  name: string;
  seconds: number;
  color: string;
  label: string;
  tone: number;
}

const SPECS: Spec[] = [
  { name: 'contoh-pantai', seconds: 4, color: '#2f6f73', label: 'A', tone: 440 },
  { name: 'contoh-gunung', seconds: 3, color: '#c2452d', label: 'B', tone: 660 },
];

export async function generateFixtures(): Promise<Fixture[]> {
  // Bundel IIFE untuk browser (mendefinisikan global Mediabunny).
  const bundle = join(ROOT, 'node_modules/mediabunny/dist/bundles/mediabunny.min.cjs');
  if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // WebCodecs hanya tersedia di secure context; localhost dianggap aman. Halaman dilayani Playwright, tanpa server.
    const url = 'http://localhost/klip-fixtures';
    await page.route(url, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>fixtures</title>' }),
    );
    await page.goto(url);
    await page.addScriptTag({ path: bundle });
    const results = await page.evaluate(async (specs: Spec[]) => {
      // Kode ini berjalan di browser; Mediabunny dimuat sebagai global oleh bundel IIFE.
      const MB = (globalThis as unknown as { Mediabunny: typeof import('mediabunny') }).Mediabunny;
      const useMp4 = (await MB.canEncodeVideo('avc', { width: 640, height: 360 })) && (await MB.canEncodeAudio('aac'));
      const out: { name: string; base64: string; ext: string; mime: string }[] = [];
      for (const spec of specs) {
        const target = new MB.BufferTarget();
        const output = new MB.Output({
          format: useMp4 ? new MB.Mp4OutputFormat({ fastStart: 'in-memory' }) : new MB.WebMOutputFormat(),
          target,
        });
        const canvas = new OffscreenCanvas(640, 360);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d');
        const video = new MB.CanvasSource(canvas, { codec: useMp4 ? 'avc' : 'vp9', quality: new MB.Quality('medium') });
        const audio = new MB.AudioSampleSource({ codec: useMp4 ? 'aac' : 'opus', quality: new MB.Quality('medium') });
        output.addVideoTrack(video, { frameRate: 30 });
        output.addAudioTrack(audio);
        await output.start();
        const fps = 30;
        const frames = spec.seconds * fps;
        for (let i = 0; i < frames; i++) {
          ctx.fillStyle = spec.color;
          ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(40 + (i / frames) * 520, 300, 40, 20);
          ctx.font = '600 120px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(spec.label, 320, 150);
          ctx.font = '500 28px monospace';
          ctx.fillText(String(i).padStart(3, '0'), 320, 240);
          await video.add(i / fps, 1 / fps);
        }
        const rate = 48000;
        const total = spec.seconds * rate;
        const chunk = rate / 10;
        for (let off = 0; off < total; off += chunk) {
          const data = new Float32Array(chunk * 2);
          for (let j = 0; j < chunk; j++) {
            const v = 0.2 * Math.sin((2 * Math.PI * spec.tone * (off + j)) / rate);
            data[j] = v;
            data[chunk + j] = v;
          }
          await audio.add(new MB.AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: rate, timestamp: off / rate }));
        }
        await output.finalize();
        const bytes = new Uint8Array(target.buffer as ArrayBuffer);
        let bin = '';
        for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
        out.push({ name: spec.name, base64: btoa(bin), ext: useMp4 ? 'mp4' : 'webm', mime: useMp4 ? 'video/mp4' : 'video/webm' });
      }
      return out;
    }, SPECS);

    return results.map((r) => {
      const path = join(FIXTURE_DIR, `${r.name}.${r.ext}`);
      writeFileSync(path, Buffer.from(r.base64, 'base64'));
      return { name: `${r.name}.${r.ext}`, path, mimeType: r.mime };
    });
  } finally {
    await browser.close();
  }
}

// Bisa dijalankan langsung: node e2e/fixtures.ts
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateFixtures().then((f) => console.log(f.map((x) => x.path).join('\n')));
}
