// Membuat ikon PNG untuk web app (manifest dan iOS) dari ikon film yang sama dengan favicon.
// Pemakaian: node scripts/generate-icons.mjs  → menulis ke public/icons/
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const ACCENT = '#2f6f73'; // --accent
const ON_ACCENT = '#ffffff'; // --on-accent

/**
 * kind 'any': kotak membulat dengan sudut transparan.
 * kind 'full': penuh sampai tepi (maskable dan apple-touch-icon); ikon di zona aman tengah.
 */
const ICONS = [
  { file: 'icon-192.png', size: 192, kind: 'any', scale: 0.6 },
  { file: 'icon-512.png', size: 512, kind: 'any', scale: 0.6 },
  { file: 'maskable-512.png', size: 512, kind: 'full', scale: 0.5 },
  { file: 'apple-touch-icon.png', size: 180, kind: 'full', scale: 0.58 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  const b64 = await page.evaluate(
    async ({ size, kind, scale, accent, onAccent }) => {
      const c = new OffscreenCanvas(size, size);
      const ctx = c.getContext('2d');
      ctx.fillStyle = accent;
      if (kind === 'any') {
        const r = size * 0.22;
        ctx.beginPath();
        ctx.roundRect(0, 0, size, size, r);
        ctx.fill();
      } else {
        ctx.fillRect(0, 0, size, size);
      }
      const s = (size * scale) / 24;
      ctx.translate((size - 24 * s) / 2, (size - 24 * s) / 2);
      ctx.scale(s, s);
      ctx.strokeStyle = onAccent;
      ctx.lineWidth = 1.75;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(new Path2D('M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'));
      ctx.stroke(new Path2D('M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4'));
      const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let str = '';
      for (let i = 0; i < buf.length; i += 0x8000) str += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(str);
    },
    { ...icon, accent: ACCENT, onAccent: ON_ACCENT },
  );
  writeFileSync(join(OUT, icon.file), Buffer.from(b64, 'base64'));
  console.log('ditulis', icon.file);
}
await browser.close();
