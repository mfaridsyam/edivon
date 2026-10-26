import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { FIXTURE_DIR } from './fixtures';

function fixture(prefix: string): string {
  const name = readdirSync(FIXTURE_DIR).find((f) => f.startsWith(prefix));
  if (!name) throw new Error(`Video contoh ${prefix} belum dibuat`);
  return join(FIXTURE_DIR, name);
}

async function sliderValue(page: Page, name: string): Promise<number> {
  return Number(await page.getByRole('slider', { name }).inputValue());
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Elemen tidak terlihat');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
  await page.mouse.up();
}

test('menggeser dan mengubah skala klip langsung di pratinjau', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Pilih berkas video, audio, atau gambar').setInputFiles(fixture('contoh-pantai'));
  const card = page.getByRole('option', { name: /contoh-pantai.*durasi/ });
  await card.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Lompat ke awal' }).click();

  // Teks baru langsung terpilih dan kotaknya tampil di pratinjau.
  await page.getByRole('tab', { name: 'Teks' }).click();
  await page.getByRole('button', { name: 'Tambah judul' }).click();
  const box = page.locator('.tf-box');
  await expect(box).toBeVisible();
  expect(await sliderValue(page, 'Posisi X')).toBe(0);

  // Seret teks ke kanan bawah.
  const frame = await page.locator('.stage-frame').boundingBox();
  if (!frame) throw new Error('Pratinjau tidak terlihat');
  const unit = (frame.height - 2) / 1080;
  await dragBy(page, await center(box), 120, 60);
  await expect.poll(() => sliderValue(page, 'Posisi X')).toBeGreaterThan(Math.round(100 / unit));
  expect(await sliderValue(page, 'Posisi Y')).toBeGreaterThan(Math.round(40 / unit));

  // Satu Ctrl+Z membatalkan seluruh geseran.
  await page.keyboard.press('Control+z');
  await expect.poll(() => sliderValue(page, 'Posisi X')).toBe(0);
  await page.keyboard.press('Control+Shift+z');
  const movedX = await sliderValue(page, 'Posisi X');
  expect(movedX).toBeGreaterThan(0);

  // Kembali mendekati tengah: menempel tepat di garis tengah horizontal.
  await dragBy(page, await center(box), -(movedX * unit) + 3, 0);
  await expect.poll(() => sliderValue(page, 'Posisi X')).toBe(0);

  // Tarik sudut kanan bawah menjauh dari pusat: skala naik.
  await dragBy(page, await center(page.locator('.tf-handle-se')), 40, 20);
  await expect.poll(() => sliderValue(page, 'Skala')).toBeGreaterThan(100);

  // Panah menggeser klip terpilih (Shift = 10 piksel).
  await box.focus();
  const y = await sliderValue(page, 'Posisi Y');
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => sliderValue(page, 'Posisi Y')).toBe(y - 10);

  // Klik bagian video di luar teks: video yang terpilih, kotaknya memenuhi pratinjau.
  await page.mouse.click(frame.x + 20, frame.y + 20);
  await expect(page.locator('[aria-roledescription="klip"][aria-pressed="true"]')).toHaveAttribute('aria-label', /^Video: contoh-pantai/);
  await expect.poll(async () => (await box.boundingBox())?.width ?? 0).toBeGreaterThan(frame.width - 6);
  expect(await sliderValue(page, 'Skala')).toBe(100);
});

test('dialog ekspor menampilkan perkiraan ukuran', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Pilih berkas video, audio, atau gambar').setInputFiles(fixture('contoh-pantai'));
  const card = page.getByRole('option', { name: /contoh-pantai.*durasi/ });
  await card.focus();
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Ekspor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ekspor video' });
  await dialog.getByRole('radio', { name: '720p', exact: true }).click();
  const estimate = dialog.getByText(/Perkiraan ukuran/);
  await expect(estimate).toContainText(/±\d/);
  const small = await estimate.innerText();
  await dialog.getByRole('radio', { name: '1080p', exact: true }).click();
  await expect(estimate).not.toHaveText(small);
  await dialog.getByRole('radio', { name: 'Tinggi', exact: true }).click();
  await expect(estimate).toContainText(/±[\d,]+ (KB|MB)/);
});
