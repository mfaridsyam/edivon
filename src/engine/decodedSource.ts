import { ALL_FORMATS, BlobSource, CanvasSink, Input, type WrappedCanvas } from 'mediabunny';
import type { FrameSource } from './compositor';
import { prepareVideoTrack } from './hevcDecoder';

/** Lebar maksimum frame terdekode untuk pratinjau; cukup untuk bingkai pratinjau, hemat memori GPU. */
const PREVIEW_WIDTH = 960;
/** Jumlah frame yang didekode di depan saat diputar. */
const AHEAD = 4;

function covers(frame: WrappedCanvas, t: number): boolean {
  return frame.timestamp <= t + 1e-4 && t < frame.timestamp + Math.max(frame.duration, 1e-3) - 1e-4;
}

/**
 * Frame pratinjau yang didekode lewat mediabunny (WebCodecs), tepat per frame seperti hasil ekspor.
 * Dipakai untuk video yang tidak bisa di-seek akurat oleh elemen <video>, misalnya HEVC dari kamera CCTV
 * dengan parameter codec rusak: Chromium meloncat ke frame kunci berikutnya setiap kali seek.
 */
export class DecodedSource {
  private readonly input: Input;
  private sink: CanvasSink | null = null;
  private readonly ready: Promise<void>;
  private current: WrappedCanvas | null = null;
  private want = 0;
  private fetching = false;
  private stream: AsyncGenerator<WrappedCanvas, void, unknown> | null = null;
  private streamStart = 0;
  private queue: WrappedCanvas[] = [];
  private pumping = false;
  private disposed = false;
  private readonly onFrame: () => void;

  constructor(file: File, onFrame: () => void) {
    this.onFrame = onFrame;
    this.input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const track = await this.input.getPrimaryVideoTrack();
    if (!track || !(await prepareVideoTrack(track))) return;
    const width = Math.min(PREVIEW_WIDTH, await track.getDisplayWidth());
    // Kolam kanvas lebih besar dari antrean + frame aktif agar kanvas yang masih dipakai tidak ditimpa.
    this.sink = new CanvasSink(track, { width, poolSize: AHEAD + 4 });
  }

  /**
   * Frame untuk detik sumber `t`. Mengembalikan frame terbaik yang sudah tersedia sekarang
   * dan memicu dekode di latar belakang bila perlu; `onFrame` dipanggil saat frame baru siap.
   */
  frameAt(t: number, playing: boolean): FrameSource | null {
    if (this.disposed) return null;
    this.want = t;
    if (playing) this.advanceStream(t);
    else {
      this.stopStream();
      if (!this.current || !covers(this.current, t)) void this.fetch();
    }
    const c = this.current;
    return c ? { image: c.canvas, width: c.canvas.width, height: c.canvas.height } : null;
  }

  /** Mengambil satu frame (saat dijeda). Permintaan terbaru menang; yang lama dilewati. */
  private async fetch(): Promise<void> {
    if (this.fetching) return;
    this.fetching = true;
    try {
      await this.ready;
      while (!this.disposed && this.sink) {
        const target = this.want;
        const frame = await this.sink.getCanvas(target);
        if (this.disposed) return;
        if (frame) {
          this.current = frame;
          this.onFrame();
        }
        if (this.want === target || (this.current && covers(this.current, this.want))) break;
      }
    } catch {
      // Frame yang gagal didekode dibiarkan; pratinjau memakai frame terakhir.
    } finally {
      this.fetching = false;
    }
  }

  private advanceStream(t: number): void {
    // Mulai ulang stream bila belum ada, bila mundur, atau bila tertinggal jauh (mis. playhead dilompatkan).
    const last = this.queue[this.queue.length - 1] ?? this.current;
    if (!this.stream || t < this.streamStart - 1e-3 || (last && t > last.timestamp + 1.5)) {
      this.startStream(t);
    }
    while (this.queue.length > 0) {
      const next = this.queue[0];
      if (!next || next.timestamp > t + 1e-4) break;
      this.current = next;
      this.queue.shift();
    }
    void this.pump();
  }

  private startStream(t: number): void {
    this.stopStream();
    this.streamStart = t;
    if (!this.sink) {
      void this.ready.then(() => {
        if (!this.disposed && this.sink && !this.stream) this.startStream(this.want);
      });
      return;
    }
    this.stream = this.sink.canvases(t);
  }

  private stopStream(): void {
    if (this.stream) void this.stream.return(undefined).catch(() => {});
    this.stream = null;
    this.queue = [];
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (!this.disposed && this.stream && this.queue.length < AHEAD) {
        const stream = this.stream;
        const r = await stream.next();
        if (stream !== this.stream) break;
        if (r.done) {
          this.stream = null;
          break;
        }
        this.queue.push(r.value);
        this.onFrame();
      }
    } catch {
      this.stream = null;
    } finally {
      this.pumping = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopStream();
    this.current = null;
    this.input.dispose();
  }
}
