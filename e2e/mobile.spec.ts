import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { devices, expect, test } from '@playwright/test';
import { FIXTURE_DIR } from './fixtures';

// defaultBrowserType tidak boleh diatur di dalam describe, jadi dibuang dari profil perangkat.
const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];

const fixture = () => join(FIXTURE_DIR, readdirSync(FIXTURE_DIR).find((f) => f.startsWith('contoh-pantai')) ?? '');

test.describe('di ponsel', () => {
  test.use(pixel);

  test('ketuk media menambahkannya ke timeline, lalu panel menutup', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Panel media' }).tap();
    await expect(page.getByText('Pilih video atau gambar dari perangkatmu.')).toBeVisible();
    await page.getByLabel('Pilih berkas video, audio, atau gambar').setInputFiles(fixture());
    const card = page.getByRole('option', { name: /contoh-pantai.*durasi/ });
    await card.tap();
    await expect(page.locator('[aria-roledescription="klip"]')).toHaveCount(1);
    await expect(page.locator('#panel-left')).toBeHidden();
    // Zoom menyesuaikan agar klip pertama terlihat utuh, dan tombol zoom tetap terlihat.
    await expect(page.getByRole('button', { name: 'Perbesar timeline' })).toBeVisible();
    const clip = await page.locator('[aria-roledescription="klip"]').boundingBox();
    expect(clip?.width ?? 0).toBeGreaterThan(150);
    // Tidak ada gulir horizontal halaman.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('rasio 4:3 dan 3:4 tersedia', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: '4:3' }).tap();
    const frame43 = await page.locator('.stage-frame').boundingBox();
    expect((frame43?.width ?? 0) / (frame43?.height ?? 1)).toBeCloseTo(4 / 3, 1);
    await page.getByRole('radio', { name: '3:4' }).tap();
    const frame34 = await page.locator('.stage-frame').boundingBox();
    expect((frame34?.width ?? 0) / (frame34?.height ?? 1)).toBeCloseTo(3 / 4, 1);
  });
});

test('bisa dipasang sebagai web app dan dibuka tanpa internet', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Pemeriksaan kriteria pasang memakai CDP Chromium');
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Diproses di perangkatmu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekspor', exact: true })).toBeVisible();
  await context.setOffline(false);
});
