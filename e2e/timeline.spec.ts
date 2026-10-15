import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { FIXTURE_DIR } from './fixtures';

function fixture(prefix: string): string {
  const name = readdirSync(FIXTURE_DIR).find((f) => f.startsWith(prefix));
  if (!name) throw new Error(`Video contoh ${prefix} belum dibuat`);
  return join(FIXTURE_DIR, name);
}

test('memendekkan klip: tarik ujung dengan alat Pilih, atau Q/E di garis merah', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Pilih berkas video, audio, atau gambar').setInputFiles(fixture('contoh-pantai'));
  const card = page.getByRole('option', { name: /contoh-pantai.*durasi/ });
  await card.focus();
  await page.keyboard.press('Enter');

  // Alat Potong sudah tidak ada; Pilih cukup untuk memendekkan.
  await expect(page.getByRole('button', { name: 'Potong', exact: true })).toHaveCount(0);
  const clip = page.locator('[aria-roledescription="klip"]');
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:00\.00, durasi 4 detik/);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Perbesar timeline' }).click();
  await clip.click();

  // Tarik ujung kanan ke kiri.
  const handle = await clip.locator('.clip-handle-end').boundingBox();
  const box = await clip.boundingBox();
  if (!handle || !box) throw new Error('Klip tidak terlihat');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - box.width / 8, handle.y + handle.height / 2, { steps: 5 });
  await page.mouse.move(handle.x - box.width / 4, handle.y + handle.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:00\.00, durasi [23] detik/);
  await page.keyboard.press('Control+z');
  await expect(clip).toHaveAttribute('aria-label', /durasi 4 detik/);

  // E (Potong kanan): bagian sesudah garis merah (detik 3) dibuang.
  const playhead = page.getByRole('slider', { name: 'Playhead' });
  await playhead.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('e');
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:00\.00, durasi 3 detik/);
  await expect(page.getByRole('status')).toContainText('Bagian sesudah 00:00:03.00 dibuang.');

  // Q (Potong kiri): bagian sebelum detik 1 dibuang; di lajur utama klip tetap mulai di 0
  // dan garis merah ikut ke awal bagian yang tersisa.
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('q');
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:00\.00, durasi 2 detik/);
  await expect(playhead).toHaveAttribute('aria-valuenow', '0');

  // Playhead di luar klip: tidak ada yang berubah.
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('e');
  await expect(page.getByRole('status')).toContainText('Garis merah tidak berada di dalam klip.');
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:00\.00, durasi 2 detik/);

  // Satu Ctrl+Z per potongan.
  await page.keyboard.press('Control+z');
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:00\.00, durasi 3 detik/);
});

test('Video 1 selalu rapat ke kiri: saat ditambah, dibelah, dan dihapus', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Pilih berkas video, audio, atau gambar').setInputFiles([fixture('contoh-pantai'), fixture('contoh-gunung')]);
  const pantai = page.getByRole('option', { name: /contoh-pantai.*durasi/ });
  const gunung = page.getByRole('option', { name: /contoh-gunung.*durasi/ });
  const lane = page.getByRole('group', { name: 'Lajur Video 1' });
  const clips = page.locator('[aria-roledescription="klip"]');

  // Dijatuhkan jauh di kanan, tetap mulai di 0:00; klip kedua menyambung di belakangnya.
  await pantai.dragTo(lane, { targetPosition: { x: 700, y: 20 } });
  await expect(clips).toHaveCount(1);
  await expect(clips.first()).toHaveAttribute('aria-label', /^Video: contoh-pantai.*Mulai 00:00:00\.00, durasi 4 detik/);
  await gunung.dragTo(lane, { targetPosition: { x: 900, y: 20 } });
  await expect(clips.filter({ hasText: 'contoh-gunung' })).toHaveAttribute('aria-label', /Mulai 00:00:04\.00/);

  // W (Belah) di detik 2, lalu hapus potongan kiri pantai.
  const playhead = page.getByRole('slider', { name: 'Playhead' });
  await playhead.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('w');
  await expect(clips).toHaveCount(3);

  const leftPart = page.locator('[aria-roledescription="klip"][aria-label*="contoh-pantai"][aria-label*="Mulai 00:00:00.00"]');
  await leftPart.click();
  await page.keyboard.press('Delete');
  await expect(clips).toHaveCount(2);
  const labels = await clips.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const starts = labels.map((l) => /Mulai ([\d:.]+)/.exec(l)?.[1]).sort();
  expect(starts).toEqual(['00:00:00.00', '00:00:02.00']);
});

test('tombol Potong kiri, Belah, Potong kanan bekerja di garis merah', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Pilih berkas video, audio, atau gambar').setInputFiles(fixture('contoh-pantai'));
  const card = page.getByRole('option', { name: /contoh-pantai.*durasi/ });
  await card.focus();
  await page.keyboard.press('Enter');
  const clips = page.locator('[aria-roledescription="klip"]');
  const playhead = page.getByRole('slider', { name: 'Playhead' });
  const moveTo = async (frames: number) => {
    await playhead.focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < Math.floor(frames / 30); i++) await page.keyboard.press('Shift+ArrowRight');
    for (let i = 0; i < frames % 30; i++) await page.keyboard.press('ArrowRight');
  };

  // Garis merah di ujung klip (detik 4): tidak ada yang bisa dipotong.
  await expect(page.getByRole('button', { name: 'Potong kiri' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Potong kanan' })).toBeDisabled();

  // Belah di detik 1 dan 3: tiga potongan, durasi total tetap 4 detik.
  await moveTo(30);
  await page.getByRole('button', { name: 'Belah' }).click();
  await moveTo(90);
  await page.getByRole('button', { name: 'Belah' }).click();
  await expect(clips).toHaveCount(3);
  await expect(page.getByLabel('Durasi 00:00:04.00')).toBeVisible();

  // Potong kanan di detik 3,5: setengah detik terakhir dibuang.
  await moveTo(105);
  await page.getByRole('button', { name: 'Potong kanan' }).click();
  await expect(page.getByLabel('Durasi 00:00:03.15')).toBeVisible();

  // Potong kiri di detik 0,5: setengah detik pertama dibuang, sisanya merapat ke 0:00.
  await moveTo(15);
  await page.getByRole('button', { name: 'Potong kiri' }).click();
  await expect(page.getByLabel('Durasi 00:00:03.00')).toBeVisible();
  await expect(playhead).toHaveAttribute('aria-valuenow', '0');
  await expect(clips).toHaveCount(3);
});
