import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_DIR } from './fixtures';

function fixtures(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.startsWith('contoh-'))
    .sort((a, b) => (a.includes('pantai') ? -1 : b.includes('pantai') ? 1 : 0))
    .map((f) => join(FIXTURE_DIR, f));
}

/** Label klip di lajur Video 1, diurutkan dari kiri ke kanan. */
async function videoTrackOrder(page: Page): Promise<string[]> {
  const lane = await page.getByRole('group', { name: 'Lajur Video 1' }).boundingBox();
  if (!lane) throw new Error('Lajur Video 1 tidak ditemukan');
  const clips = page.locator('[aria-roledescription="klip"]');
  const items: { x: number; label: string }[] = [];
  for (let i = 0; i < (await clips.count()); i++) {
    const box = await clips.nth(i).boundingBox();
    const label = (await clips.nth(i).getAttribute('aria-label')) ?? '';
    if (box && box.y >= lane.y && box.y < lane.y + lane.height) items.push({ x: box.x, label });
  }
  return items.sort((a, b) => a.x - b.x).map((i) => i.label);
}

test('impor dua berkas, belah, urutkan, lalu ekspor', async ({ page }, testInfo) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith('http://localhost') && !url.startsWith('blob:') && !url.startsWith('data:')) external.push(url);
  });

  await page.goto('/');
  await expect(page.getByText('Diproses di perangkatmu')).toBeVisible();
  await expect(page.getByText('Berkas tidak dikirim ke server.')).toBeVisible();

  // Impor
  await page.getByLabel('Pilih berkas video, audio, atau gambar').setInputFiles(fixtures());
  const pantai = page.getByRole('option', { name: /contoh-pantai.*durasi/ });
  const gunung = page.getByRole('option', { name: /contoh-gunung.*durasi/ });
  await expect(pantai).toBeVisible();
  await expect(gunung).toBeVisible();

  // Tambah ke timeline: Enter menaruh klip di playhead lalu playhead pindah ke akhirnya.
  await pantai.focus();
  await page.keyboard.press('Enter');
  await gunung.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[aria-roledescription="klip"]')).toHaveCount(2);
  expect((await videoTrackOrder(page))[0]).toMatch(/^Video: contoh-pantai/);

  // Perbesar timeline agar klip cukup lebar untuk diklik.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Perbesar timeline' }).click();

  // Belah: garis merah ke tengah klip pertama (detik 2), lalu tombol Belah.
  const playhead = page.getByRole('slider', { name: 'Playhead' });
  await playhead.focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('button', { name: 'Belah' })).toBeDisabled();
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Belah' }).click();
  await expect(page.locator('[aria-roledescription="klip"]')).toHaveCount(3);
  await expect(page.getByRole('status')).toContainText('dibelah');

  // Urutkan: alat Pilih (V), seret klip terakhir ke awal timeline.
  await page.keyboard.press('v');
  const order = await videoTrackOrder(page);
  expect(order[2]).toMatch(/^Video: contoh-gunung/);
  const last = page.locator('[aria-roledescription="klip"]', { hasText: 'contoh-gunung' });
  const lastBox = await last.boundingBox();
  const lane = await page.getByRole('group', { name: 'Lajur Video 1' }).boundingBox();
  if (!lastBox || !lane) throw new Error('Klip atau lajur tidak terlihat');
  await page.mouse.move(lastBox.x + 20, lastBox.y + lastBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(lastBox.x - 40, lastBox.y + lastBox.height / 2, { steps: 5 });
  await page.mouse.move(lane.x + 2, lastBox.y + lastBox.height / 2, { steps: 10 });
  await page.mouse.up();
  const reordered = await videoTrackOrder(page);
  expect(reordered).toHaveLength(3);
  expect(reordered[0]).toMatch(/^Video: contoh-gunung.*Mulai 00:00:00\.00/);
  expect(reordered[1]).toMatch(/^Video: contoh-pantai/);

  // Ekspor
  await page.getByRole('button', { name: 'Ekspor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ekspor video' });
  await expect(dialog.getByRole('radio', { name: '720p', exact: true })).toBeEnabled();
  await dialog.getByRole('radio', { name: '720p', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Ekspor' }).click();
  await expect(page.getByRole('progressbar', { name: 'Progres ekspor' })).toBeVisible();
  await expect(page.getByText('Jangan tutup tab ini sampai selesai.')).toBeVisible();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Proyek tanpa judul\.(mp4|webm)$/);
  const saved = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(saved);
  expect(statSync(saved).size).toBeGreaterThan(20_000);
  await expect(page.getByRole('dialog')).toContainText('selesai dibuat');
  await page.getByRole('button', { name: 'Selesai' }).click();

  // Hasil bisa dibaca lagi dan durasinya 7 detik (4 + 3 detik).
  await page.getByLabel('Pilih berkas video, audio, atau gambar').setInputFiles(saved);
  await expect(page.getByRole('option', { name: /Proyek tanpa judul.*durasi 00:07/ })).toBeVisible();

  expect(external).toEqual([]);
});
