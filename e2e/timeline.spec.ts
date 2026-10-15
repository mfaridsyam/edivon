import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { FIXTURE_DIR } from './fixtures';

function fixture(prefix: string): string {
  const name = readdirSync(FIXTURE_DIR).find((f) => f.startsWith(prefix));
  if (!name) throw new Error(`Video contoh ${prefix} belum dibuat`);
  return join(FIXTURE_DIR, name);
}

test('memendekkan klip: tarik ujung dengan alat Pilih, atau Q/W ke playhead', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Pilih berkas video, audio, atau gambar').setInputFiles(fixture('contoh-pantai'));
  const card = page.getByRole('option', { name: /contoh-pantai.*durasi/ });
  await card.focus();
  await page.keyboard.press('Enter');

  // Alat Potong sudah tidak ada; Pilih cukup untuk memendekkan.
  await expect(page.getByRole('button', { name: 'Potong' })).toHaveCount(0);
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

  // W: akhir klip terpilih dipotong ke playhead (detik 3).
  const playhead = page.getByRole('slider', { name: 'Playhead' });
  await playhead.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('w');
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:00\.00, durasi 3 detik/);
  await expect(page.getByRole('status')).toContainText('Akhir klip dipotong ke 00:00:03.00');

  // Q: bagian sebelum playhead (detik 1) dibuang; di lajur utama klip tetap mulai di 0.
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('q');
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:00\.00, durasi 2 detik/);

  // Playhead di luar klip: tidak ada yang berubah.
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('w');
  await expect(page.getByRole('status')).toContainText('Playhead tidak berada di dalam klip terpilih.');
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

  // Belah pantai di detik 2 (alat Belah, Enter pada klip), lalu hapus potongan kirinya.
  const playhead = page.getByRole('slider', { name: 'Playhead' });
  await playhead.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('s');
  await clips.filter({ hasText: 'contoh-pantai' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(clips).toHaveCount(3);

  await page.keyboard.press('v');
  const leftPart = page.locator('[aria-roledescription="klip"][aria-label*="contoh-pantai"][aria-label*="Mulai 00:00:00.00"]');
  await leftPart.click();
  await page.keyboard.press('Delete');
  await expect(clips).toHaveCount(2);
  const labels = await clips.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const starts = labels.map((l) => /Mulai ([\d:.]+)/.exec(l)?.[1]).sort();
  expect(starts).toEqual(['00:00:00.00', '00:00:02.00']);
});
