import { AudioSampleSink, type AudioSample, type InputAudioTrack } from 'mediabunny';
import type { MediaClip } from '../timeline/model';
import { FPS } from '../timeline/time';
import { AUDIO_CHANNELS, AUDIO_RATE } from './protocol';

interface Chunk {
  start: number;
  rate: number;
  frames: number;
  channels: Float32Array[];
}

function chunkEnd(c: Chunk): number {
  return c.start + c.frames / c.rate;
}

/**
 * Membaca PCM sumber secara berurutan dengan penyangga bergulir, sehingga memori tetap kecil
 * walau klipnya panjang. Data lama dibuang setelah terlewati.
 */
export class ClipAudioReader {
  private readonly iter: AsyncGenerator<AudioSample, void, unknown>;
  private chunks: Chunk[] = [];
  private finished = false;
  private cursor = 0;

  constructor(track: InputAudioTrack, from: number, to: number) {
    this.iter = new AudioSampleSink(track).samples(Math.max(0, from), to);
  }

  /** Memastikan data sumber tersedia sampai detik `t`. */
  async ensure(t: number): Promise<void> {
    while (!this.finished) {
      const last = this.chunks[this.chunks.length - 1];
      if (last && chunkEnd(last) >= t) return;
      const r = await this.iter.next();
      if (r.done) {
        this.finished = true;
        return;
      }
      const sample = r.value;
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < Math.min(sample.numberOfChannels, AUDIO_CHANNELS); ch++) {
        const plane = new Float32Array(sample.numberOfFrames);
        sample.copyTo(plane, { planeIndex: ch, format: 'f32-planar' });
        channels.push(plane);
      }
      this.chunks.push({ start: sample.timestamp, rate: sample.sampleRate, frames: sample.numberOfFrames, channels });
      sample.close();
    }
  }

  /** Membuang data yang berakhir sebelum detik `t`. */
  drop(t: number): void {
    let removed = 0;
    while (this.chunks.length > 1 && chunkEnd(this.chunks[0] as Chunk) < t) {
      this.chunks.shift();
      removed += 1;
    }
    this.cursor = Math.max(0, this.cursor - removed);
  }

  resetCursor(): void {
    this.cursor = 0;
  }

  /** Nilai sampel pada detik `t` (interpolasi linier). Sumber mono dipakai untuk kedua kanal. */
  sampleAt(t: number, channel: number): number {
    const chunks = this.chunks;
    while (this.cursor < chunks.length - 1 && chunkEnd(chunks[this.cursor] as Chunk) <= t) this.cursor += 1;
    const c = chunks[this.cursor];
    if (!c || t < c.start) return 0;
    const data = c.channels[Math.min(channel, c.channels.length - 1)];
    if (!data) return 0;
    const pos = (t - c.start) * c.rate;
    const i = Math.floor(pos);
    if (i >= c.frames) return 0;
    const a = data[i] ?? 0;
    const b = i + 1 < c.frames ? (data[i + 1] ?? a) : a;
    return a + (b - a) * (pos - i);
  }

  close(): void {
    void this.iter.return(undefined).catch(() => {});
    this.chunks = [];
  }
}

export interface AudibleClip {
  clip: MediaClip;
  track: InputAudioTrack;
  gain: number;
  reader: ClipAudioReader | null;
}

/**
 * Mencampur satu blok audio keluaran mulai detik `t0` sepanjang `frames` sampel.
 * Kecepatan diterapkan dengan resampling (pitch ikut berubah, sama seperti pratinjau).
 * Hasil berupa data planar f32: semua sampel kanal kiri, lalu kanan.
 */
export async function mixBlock(clips: AudibleClip[], t0: number, frames: number): Promise<Float32Array> {
  const out = new Float32Array(frames * AUDIO_CHANNELS);
  const t1 = t0 + frames / AUDIO_RATE;
  for (const ac of clips) {
    const { clip } = ac;
    const clipStart = clip.start / FPS;
    const clipEndT = (clip.start + clip.duration) / FPS;
    if (clipEndT <= t0 || clipStart >= t1) {
      if (clipEndT <= t0 && ac.reader) {
        ac.reader.close();
        ac.reader = null;
      }
      continue;
    }
    const s = Math.max(t0, clipStart);
    const e = Math.min(t1, clipEndT);
    const srcFrom = clip.in + (s - clipStart) * clip.speed;
    const srcTo = clip.in + (e - clipStart) * clip.speed;
    if (!ac.reader) ac.reader = new ClipAudioReader(ac.track, srcFrom - 0.05, clip.in + (clipEndT - clipStart) * clip.speed + 0.1);
    const reader = ac.reader;
    await reader.ensure(srcTo + 0.02);
    reader.drop(srcFrom - 0.05);
    reader.resetCursor();
    const n0 = Math.max(0, Math.ceil((s - t0) * AUDIO_RATE));
    const n1 = Math.min(frames, Math.ceil((e - t0) * AUDIO_RATE));
    for (let n = n0; n < n1; n++) {
      const src = clip.in + (t0 + n / AUDIO_RATE - clipStart) * clip.speed;
      out[n] = (out[n] ?? 0) + reader.sampleAt(src, 0) * ac.gain;
      out[frames + n] = (out[frames + n] ?? 0) + reader.sampleAt(src, 1) * ac.gain;
    }
  }
  for (let i = 0; i < out.length; i++) {
    const v = out[i] ?? 0;
    out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  return out;
}
