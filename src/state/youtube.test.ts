import { describe, expect, it } from 'vitest';
import { friendlyError, parseLine, versionAtLeast } from '../../tools/yt-helper.mjs';
import { fileNameFromTitle, parseYouTubeId } from './youtubeLink';

describe('link YouTube', () => {
  it('membaca ID dari bentuk link yang umum', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=oXEyW4rA4Z8')).toBe('oXEyW4rA4Z8');
    expect(parseYouTubeId('https://youtu.be/oXEyW4rA4Z8?si=abc123')).toBe('oXEyW4rA4Z8');
    expect(parseYouTubeId('https://m.youtube.com/watch?feature=share&v=oXEyW4rA4Z8')).toBe('oXEyW4rA4Z8');
    expect(parseYouTubeId('https://music.youtube.com/watch?v=oXEyW4rA4Z8')).toBe('oXEyW4rA4Z8');
    expect(parseYouTubeId('https://www.youtube.com/shorts/oXEyW4rA4Z8')).toBe('oXEyW4rA4Z8');
    expect(parseYouTubeId('https://www.youtube.com/live/oXEyW4rA4Z8?t=10')).toBe('oXEyW4rA4Z8');
    expect(parseYouTubeId('https://www.youtube-nocookie.com/embed/oXEyW4rA4Z8')).toBe('oXEyW4rA4Z8');
  });

  it('menerima link tanpa https:// dan spasi di tepi', () => {
    expect(parseYouTubeId('  youtube.com/watch?v=oXEyW4rA4Z8 ')).toBe('oXEyW4rA4Z8');
    expect(parseYouTubeId('youtu.be/oXEyW4rA4Z8')).toBe('oXEyW4rA4Z8');
  });

  it('hanya mengambil video dari link yang ada di dalam playlist', () => {
    expect(parseYouTubeId('youtube.com/watch?v=oXEyW4rA4Z8&list=RDUJR_jLWE5a0&index=2')).toBe('oXEyW4rA4Z8');
  });

  it('menolak link yang bukan satu video YouTube', () => {
    expect(parseYouTubeId('')).toBeNull();
    expect(parseYouTubeId('halo dunia')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/@Cassiopeia')).toBeNull();
    expect(parseYouTubeId('https://evil.example/watch?v=oXEyW4rA4Z8')).toBeNull();
    expect(parseYouTubeId('https://youtube.com.evil.example/watch?v=oXEyW4rA4Z8')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/watch?v=--exec=calc')).toBeNull();
    expect(parseYouTubeId('javascript://youtube.com/watch?v=oXEyW4rA4Z8')).toBeNull();
  });

  it('membuat nama berkas yang aman dari judul', () => {
    expect(fileNameFromTitle('Katy Perry - In another life: "The One" (Lyrics)', 'mp4')).toBe(
      'Katy Perry - In another life The One (Lyrics).mp4',
    );
    expect(fileNameFromTitle('a/b\\c|d?', 'mp3')).toBe('a b c d.mp3');
    expect(fileNameFromTitle('...', 'mp3')).toBe('video-youtube.mp3');
    expect(fileNameFromTitle('x'.repeat(200), 'mp4')).toHaveLength(104);
  });
});

describe('helper YouTube', () => {
  it('membaca jumlah stream, progres, dan tahap proses dari keluaran yt-dlp', () => {
    expect(parseLine('[info] jNQXAC9IVRw: Downloading 1 format(s): 133+140')).toEqual({ type: 'streams', count: 2 });
    expect(parseLine('[info] jNQXAC9IVRw: Downloading 1 format(s): 140')).toEqual({ type: 'streams', count: 1 });
    expect(parseLine('[download] Destination: C:\\tmp\\media.f133.mp4')).toEqual({ type: 'stream' });
    expect(parseLine('KLIP-PROGRESS 261120 433081 NA')).toEqual({ type: 'progress', fraction: 261120 / 433081 });
    expect(parseLine('KLIP-PROGRESS 500 NA 1000')).toEqual({ type: 'progress', fraction: 0.5 });
    expect(parseLine('KLIP-PROGRESS 500 NA NA')).toBeNull();
    expect(parseLine('[Merger] Merging formats into "media.mp4"')).toEqual({ type: 'processing' });
    expect(parseLine('[ExtractAudio] Destination: media.mp3')).toEqual({ type: 'processing' });
    expect(parseLine('[youtube] jNQXAC9IVRw: Downloading webpage')).toBeNull();
  });

  it('menerjemahkan error yt-dlp yang umum', () => {
    expect(parseLine('ERROR: [youtube] aaaaaaaaaaa: This video is unavailable')).toEqual({
      type: 'error',
      message: 'Video tidak tersedia.',
    });
    expect(friendlyError('ERROR: [youtube] aaaaaaaaaaa: Private video. Sign in if you have access')).toBe('Video ini privat.');
    expect(friendlyError("ERROR: [youtube] aaaaaaaaaaa: Sign in to confirm you're not a bot")).toMatch(/bukan bot/);
    expect(friendlyError('ERROR: Something new')).toBe('Something new');
  });

  it('membandingkan versi yt-dlp', () => {
    expect(versionAtLeast('2026.08.19', '2025.11.12')).toBe(true);
    expect(versionAtLeast('2025.11.12', '2025.11.12')).toBe(true);
    expect(versionAtLeast('2025.11.12.1', '2025.11.12')).toBe(true);
    expect(versionAtLeast('2025.10.22', '2025.11.12')).toBe(false);
  });
});
