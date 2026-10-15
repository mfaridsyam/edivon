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

  // Q: awal klip dipotong ke playhead (detik 1); bagian sumbernya ikut bergeser.
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('q');
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:01\.00, durasi 2 detik/);

  // Playhead di luar klip: tidak ada yang berubah.
  await page.keyboard.press('Home');
  await page.keyboard.press('w');
  await expect(page.getByRole('status')).toContainText('Playhead tidak berada di dalam klip terpilih.');
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:01\.00, durasi 2 detik/);

  // Satu Ctrl+Z per potongan.
  await page.keyboard.press('Control+z');
  await expect(clip).toHaveAttribute('aria-label', /Mulai 00:00:00\.00, durasi 3 detik/);
});
