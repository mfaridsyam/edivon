import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { FIXTURE_DIR } from './fixtures';

const fixture = () => join(FIXTURE_DIR, readdirSync(FIXTURE_DIR).find((f) => f.startsWith('contoh-pantai')) ?? '');

async function addClip(page: Page) {
  await page.goto('/');
  await page.getByLabel('Pilih berkas video, audio, atau gambar').setInputFiles(fixture());
  const card = page.getByRole('option', { name: /contoh-pantai.*durasi/ });
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[aria-roledescription="klip"]')).toHaveCount(1);
}

async function exportWith(page: Page, destination: string, path: string) {
  const dialog = page.getByRole('dialog', { name: 'Ekspor video' });
  await dialog.getByRole('radio', { name: new RegExp(destination) }).click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Ekspor', exact: true }).click();
  await (await download).saveAs(path);
  await expect(page.getByRole('dialog')).toContainText('selesai dibuat');
  await page.getByRole('button', { name: 'Selesai' }).click();
}

/** Membaca metadata MP4 di Node (tanpa mendekode gambar). */
async function probe(path: string) {
  const input = new Input({ source: new BufferSource(readFileSync(path)), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  return {
    width: await video?.getDisplayWidth(),
    height: await video?.getDisplayHeight(),
    video: await video?.getCodec(),
    audio: await audio?.getCodec(),
    duration: await input.computeDuration(),
  };
}

test('Story & Reels tidak wajib 9:16: proyek 16:9 diekspor 1920x1080', async ({ page }, testInfo) => {
  await addClip(page);
  await page.getByRole('button', { name: 'Ekspor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ekspor video' });
  await dialog.getByRole('radio', { name: /Story & Reels Instagram/ }).click();
  await expect(dialog.getByRole('radio', { name: 'Proyek 16:9' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog).toContainText('1920×1080');
  await expect(dialog).toContainText('menerima rasio 16:9');
  const path = testInfo.outputPath('story.mp4');
  await exportWith(page, 'Story & Reels Instagram', path);
  expect(await probe(path)).toMatchObject({ width: 1920, height: 1080, video: 'avc', audio: 'aac' });
});

test('Status WhatsApp penuh layar: rasio proyek diubah ke 9:16 lalu ekspor 720x1280', async ({ page }, testInfo) => {
  await addClip(page);
  await page.getByRole('button', { name: 'Ekspor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ekspor video' });
  await dialog.getByRole('radio', { name: /Status WhatsApp/ }).click();
  await dialog.getByRole('radio', { name: '9:16 penuh layar' }).click();
  await expect(dialog).toContainText('720×1280');
  await dialog.getByRole('button', { name: 'Ubah rasio proyek ke 9:16' }).click();
  await expect(dialog.getByRole('radio', { name: '9:16 penuh layar' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: '9:16', exact: true })).toHaveAttribute('aria-checked', 'true');

  const path = testInfo.outputPath('status-wa.mp4');
  await exportWith(page, 'Status WhatsApp', path);
  const info = await probe(path);
  expect(info).toMatchObject({ width: 720, height: 1280, video: 'avc', audio: 'aac' });
  expect(info.duration).toBeGreaterThan(3.9);
});

test('Feed Instagram 4:5 penuh layar tanpa mengubah rasio: proyek 16:9 utuh di tengah bingkai 1080x1350', async ({ page }, testInfo) => {
  await addClip(page);
  await page.getByRole('button', { name: 'Ekspor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ekspor video' });
  await dialog.getByRole('radio', { name: /Feed Instagram/ }).click();
  await dialog.getByRole('radio', { name: '4:5 penuh layar' }).click();
  const path = testInfo.outputPath('feed-ig.mp4');
  await exportWith(page, 'Feed Instagram', path);
  expect(await probe(path)).toMatchObject({ width: 1080, height: 1350, video: 'avc' });

  // Periksa gambarnya: bagian atas hitam (letterbox), tengah berisi video contoh (teal).
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'cek';
    document.body.appendChild(input);
  });
  await page.setInputFiles('#cek', path);
  const pixels = await page.evaluate(async () => {
    const file = (document.getElementById('cek') as HTMLInputElement).files?.[0];
    if (!file) throw new Error('tidak ada berkas');
    const video = document.createElement('video');
    video.muted = true;
    video.src = URL.createObjectURL(file);
    await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }));
    await new Promise((r) => {
      video.addEventListener('seeked', r, { once: true });
      video.currentTime = 1;
    });
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('kanvas');
    ctx.drawImage(video, 0, 0);
    const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    return { top: at(540, 40), middle: at(200, 600) };
  });
  expect(Math.max(...pixels.top)).toBeLessThan(20);
  // Warna teal contoh (#2f6f73) dengan toleransi kompresi.
  expect(Math.abs((pixels.middle[0] ?? 0) - 47)).toBeLessThan(25);
  expect(Math.abs((pixels.middle[1] ?? 0) - 111)).toBeLessThan(25);
});
