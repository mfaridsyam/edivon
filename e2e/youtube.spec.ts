import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { FIXTURE_DIR } from './fixtures';

// Helper YouTube (tools/yt-helper.mjs) ditiru lewat page.route, jadi tes tidak butuh yt-dlp atau internet.
const HELPER = 'http://127.0.0.1:7878';
const VIDEO_ID = 'oXEyW4rA4Z8';
const CORS = { 'Access-Control-Allow-Origin': '*' };

function fixture(): { body: Buffer; ext: string } {
  const name = readdirSync(FIXTURE_DIR).find((f) => f.startsWith('contoh-pantai'));
  if (!name) throw new Error('Video contoh belum dibuat');
  return { body: readFileSync(join(FIXTURE_DIR, name)), ext: name.split('.').pop() ?? 'mp4' };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
}

async function fakeHelper(page: Page, jobsRequested: unknown[]) {
  const video = fixture();
  let polls = 0;
  // Thumbnail YouTube tidak diambil dari internet selama tes.
  await page.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
  await page.route(`${HELPER}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Content-Type' },
      });
    }
    if (path === '/status') return json(route, { app: 'klip-yt', protocol: 1, ytdlp: '2026.08.19', outdated: false, ffmpeg: true });
    if (path === `/videos/${VIDEO_ID}`) {
      return json(route, { id: VIDEO_ID, title: 'Contoh dari YouTube', channel: 'Kanal Contoh', duration: 4, isLive: false });
    }
    if (path === '/jobs' && req.method() === 'POST') {
      jobsRequested.push(req.postDataJSON());
      return json(route, { id: 'job-1', videoId: VIDEO_ID, format: 'mp4', status: 'queued', progress: 0, title: '' }, 201);
    }
    if (path === '/jobs/job-1') {
      polls += 1;
      const status = polls < 2 ? 'downloading' : 'done';
      return json(route, { id: 'job-1', status, progress: polls < 2 ? 0.5 : 1, title: 'Contoh dari YouTube', size: video.body.length });
    }
    if (path === '/jobs/job-1/file') {
      return route.fulfill({ status: 200, headers: CORS, contentType: `video/${video.ext}`, body: video.body });
    }
    return json(route, { error: 'Tidak ditemukan.' }, 404);
  });
}

test('tempel link YouTube, unduh, lalu seret ke timeline', async ({ page }) => {
  const jobs: unknown[] = [];
  await fakeHelper(page, jobs);
  await page.goto('/');

  const link = page.getByRole('textbox', { name: 'Link YouTube' });
  await link.fill(`https://www.youtube.com/watch?v=${VIDEO_ID}&list=RDUJR_jLWE5a0&index=2`);
  await expect(page.getByText('Contoh dari YouTube')).toBeVisible();
  await expect(page.getByText('Kanal Contoh · 00:04')).toBeVisible();

  await expect(page.getByRole('radio', { name: 'MP4' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Unduh' }).click();
  await expect(link).toHaveValue('');
  expect(jobs).toEqual([{ videoId: VIDEO_ID, format: 'mp4' }]);

  // Setelah selesai, hasilnya menjadi kartu media biasa.
  const card = page.getByRole('option', { name: /Contoh dari YouTube\.mp4, Video, durasi 00:04/ });
  await expect(card).toBeVisible();
  await expect(page.getByRole('list', { name: 'Unduhan YouTube' })).toHaveCount(0);

  await card.dragTo(page.getByRole('group', { name: 'Lajur Video 1' }));
  await expect(page.locator('[aria-roledescription="klip"]')).toHaveCount(1);
  await expect(page.locator('[aria-roledescription="klip"]').first()).toHaveAttribute('aria-label', /^Video: Contoh dari YouTube/);
});

test('memilih MP3 dan menolak link yang bukan video YouTube', async ({ page }) => {
  const jobs: unknown[] = [];
  await fakeHelper(page, jobs);
  await page.goto('/');

  const link = page.getByRole('textbox', { name: 'Link YouTube' });
  await link.fill('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
  await link.blur();
  await expect(page.getByText(/Tempel link satu video YouTube/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unduh' })).toBeDisabled();

  await link.fill(`youtu.be/${VIDEO_ID}`);
  await page.getByRole('radio', { name: 'MP3' }).click();
  await page.getByRole('button', { name: 'Unduh' }).click();
  await expect.poll(() => jobs).toEqual([{ videoId: VIDEO_ID, format: 'mp3' }]);
});

test('menjelaskan cara menjalankan helper bila belum berjalan', async ({ page }) => {
  await page.route(`${HELPER}/**`, (route) => route.abort('connectionrefused'));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Link YouTube' }).fill(`https://youtu.be/${VIDEO_ID}`);
  await expect(page.getByText('Helper YouTube belum berjalan.', { exact: false })).toBeVisible();
  await expect(page.getByText('npm run yt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Periksa lagi' })).toBeVisible();
});
