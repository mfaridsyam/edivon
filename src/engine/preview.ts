import type { MediaItem } from '../state/media';
import { editor, type EditorState } from '../state/store';
import {
  findTrack,
  isSourceTimed,
  projectDuration,
  sourceTimeAt,
  type ImageClip,
  type MediaClip,
  type VideoClip,
} from '../timeline/model';
import { FPS } from '../timeline/time';
import { drawFrame, type Ctx2D, type FrameSource } from './compositor';
import { DecodedSource } from './decodedSource';
import { resolveTextColors } from './tokens';

/** Satu elemen media tersembunyi. Dipakai ulang oleh klip lain dari sumber yang sama bila sedang bebas. */
interface Slot {
  el: HTMLVideoElement | HTMLAudioElement;
  mediaId: string;
  clipId: string | null;
  gain: GainNode | null;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

export const PREVIEW_FONT = '"Figtree", system-ui, sans-serif';
/** Selisih (detik) antara elemen dan jam pratinjau yang masih ditoleransi saat diputar. */
const DRIFT = 0.2;
/** Klip yang akan mulai dalam sekian frame disiapkan lebih dulu agar tidak tersendat. */
const LOOKAHEAD = 20;
/** Batas menunggu elemen mulai berputar (ms) sebelum jam tetap dijalankan. */
const START_TIMEOUT = 500;

/**
 * Mesin pratinjau: elemen <video>/<audio> tersembunyi per sumber, satu kanvas yang
 * menggabungkan lapisan tiap frame, dan audio lewat Web Audio API.
 */
export class PreviewEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private scratch: { canvas: HTMLCanvasElement; ctx: Ctx2D } | null = null;
  private readonly host: HTMLDivElement;
  private slots: Slot[] = [];
  private images = new Map<string, ImageBitmap | 'loading' | 'error'>();
  /** Sumber frame terdekode per media, untuk video yang tidak bisa di-seek akurat oleh <video>. */
  private decoded = new Map<string, DecodedSource>();
  /** Frame (pecahan) yang sedang digambar, untuk menghitung waktu sumber yang tepat. */
  private drawExact = 0;
  private audio: AudioContext | null = null;
  private raf = 0;
  private drawQueued = false;
  private clock: { startFrame: number; startTime: number } | null = null;
  /** Sejak kapan jam ditahan menunggu elemen media benar-benar mulai berputar; null bila tidak menunggu. */
  private waitingSince: number | null = null;
  /** Frame terakhir yang ditulis mesin ke store, untuk membedakan dari lompatan oleh pengguna. */
  private ownFrame = -1;
  private readonly textColors = resolveTextColors();
  private readonly unsubscribe: () => void;
  private destroyed = false;

  constructor() {
    this.host = document.createElement('div');
    this.host.className = 'media-host';
    this.host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.host);
    this.unsubscribe = editor.subscribe((s, prev) => this.onState(s, prev));
    void document.fonts.load(`600 48px ${PREVIEW_FONT}`).then(() => this.requestDraw());
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.syncPaused();
    this.requestDraw();
  }

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.scratch = null;
    this.requestDraw();
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribe();
    cancelAnimationFrame(this.raf);
    for (const slot of this.slots) {
      slot.el.pause();
      slot.el.removeAttribute('src');
      slot.el.load();
    }
    this.slots = [];
    for (const img of this.images.values()) if (typeof img === 'object') img.close();
    this.images.clear();
    for (const d of this.decoded.values()) d.dispose();
    this.decoded.clear();
    this.host.remove();
    void this.audio?.close();
  }

  /* ---------- Reaksi terhadap store ---------- */

  private onState(s: EditorState, prev: EditorState): void {
    if (s.playing !== prev.playing) {
      if (s.playing) this.start();
      else this.stop();
      return;
    }
    if (s.playing) {
      if (s.playhead !== prev.playhead && s.playhead !== this.ownFrame) {
        // Pengguna melompat saat diputar: mulai ulang jam dari posisi baru.
        this.clock = { startFrame: s.playhead, startTime: performance.now() };
        this.waitingSince = performance.now();
      }
      if (s.project !== prev.project) this.applyGains();
      return;
    }
    if (s.playhead !== prev.playhead || s.project !== prev.project || s.media !== prev.media) {
      this.syncPaused();
      this.requestDraw();
    }
  }

  /* ---------- Pemutaran ---------- */

  private start(): void {
    const s = editor.get();
    const end = projectDuration(s.project);
    if (end === 0) {
      s.setPlaying(false);
      return;
    }
    this.ensureAudio();
    let from = s.playhead;
    if (from >= end) {
      from = 0;
      this.ownFrame = 0;
      s.setPlayhead(0);
    }
    this.clock = { startFrame: from, startTime: performance.now() };
    this.waitingSince = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  /** True bila semua elemen untuk klip aktif di frame ini sedang berputar dengan data cukup. */
  private mediaStarted(frame: number): boolean {
    for (const { clip, active } of this.timedClips(frame, 0)) {
      if (!active) continue;
      const slot = this.slots.find((sl) => sl.clipId === clip.id);
      if (!slot) continue;
      if (slot.el.paused || slot.el.seeking || slot.el.readyState < 3) return false;
    }
    return true;
  }

  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.clock = null;
    this.waitingSince = null;
    for (const slot of this.slots) slot.el.pause();
    this.syncPaused();
    this.requestDraw();
  }

  private tick = (): void => {
    if (this.destroyed || !this.clock) return;
    const s = editor.get();
    const end = projectDuration(s.project);
    const now = performance.now();
    if (this.waitingSince !== null) {
      // Tahan jam sampai elemen aktif sudah berputar, agar gambar, suara, dan playhead mulai bersamaan.
      if (this.mediaStarted(this.clock.startFrame) || now - this.waitingSince > START_TIMEOUT) {
        this.waitingSince = null;
        this.clock = { startFrame: this.clock.startFrame, startTime: now };
      } else {
        this.syncPlaying(this.clock.startFrame);
        this.draw(this.clock.startFrame);
        this.raf = requestAnimationFrame(this.tick);
        return;
      }
    }
    const exact = this.clock.startFrame + ((now - this.clock.startTime) / 1000) * FPS;
    if (exact >= end) {
      this.ownFrame = end;
      s.setPlayhead(end);
      s.setPlaying(false);
      return;
    }
    const frame = Math.floor(exact);
    if (frame !== s.playhead) {
      this.ownFrame = frame;
      s.setPlayhead(frame);
    }
    this.syncPlaying(exact);
    this.draw(exact);
    this.raf = requestAnimationFrame(this.tick);
  };

  /* ---------- Elemen media ---------- */

  private mediaFor(id: string): MediaItem | undefined {
    return editor.get().media.find((m) => m.id === id && m.status === 'ready');
  }

  private createSlot(media: MediaItem): Slot {
    const el = document.createElement(media.kind === 'audio' ? 'audio' : 'video');
    el.preload = 'auto';
    el.src = media.url;
    // Kecepatan mengubah pitch, sama seperti hasil ekspor.
    el.preservesPitch = false;
    if (el instanceof HTMLVideoElement) {
      el.playsInline = true;
      el.muted = false;
      const v = el as VideoWithFrameCallback;
      if (typeof v.requestVideoFrameCallback === 'function') {
        const onFrame = () => {
          if (this.destroyed) return;
          this.requestDraw();
          v.requestVideoFrameCallback?.(onFrame);
        };
        v.requestVideoFrameCallback(onFrame);
      } else {
        el.addEventListener('timeupdate', () => this.requestDraw());
      }
      el.addEventListener('seeked', () => this.requestDraw());
      el.addEventListener('loadeddata', () => this.requestDraw());
    }
    this.host.appendChild(el);
    const slot: Slot = { el, mediaId: media.id, clipId: null, gain: null };
    if (this.audio) this.connect(slot);
    this.slots.push(slot);
    return slot;
  }

  private acquire(clip: MediaClip): Slot | null {
    const own = this.slots.find((s) => s.clipId === clip.id);
    if (own) {
      if (own.mediaId === clip.mediaId) return own;
      own.clipId = null;
    }
    const media = this.mediaFor(clip.mediaId);
    if (!media) return null;
    const free = this.slots.find((s) => s.clipId === null && s.mediaId === clip.mediaId) ?? this.createSlot(media);
    free.clipId = clip.id;
    return free;
  }

  /** Klip bersumber waktu yang aktif (atau segera aktif) di sekitar frame. */
  private timedClips(frame: number, lookahead: number): { clip: MediaClip; active: boolean }[] {
    const out: { clip: MediaClip; active: boolean }[] = [];
    for (const clip of editor.get().project.clips) {
      if (!isSourceTimed(clip)) continue;
      const active = frame >= clip.start && frame < clip.start + clip.duration;
      const soon = !active && clip.start > frame && clip.start <= frame + lookahead;
      if (active || soon) out.push({ clip, active });
    }
    return out;
  }

  private release(used: Set<string>): void {
    for (const slot of this.slots) {
      if (slot.clipId !== null && !used.has(slot.clipId)) {
        slot.el.pause();
        slot.clipId = null;
      }
    }
  }

  private gainFor(clip: MediaClip): number {
    const track = findTrack(editor.get().project, clip.trackId);
    if (!track || track.muted) return 0;
    if (clip.type === 'video' && !clip.hasAudio) return 0;
    return clip.volume;
  }

  private applyGains(): void {
    const project = editor.get().project;
    for (const slot of this.slots) {
      if (!slot.clipId || !slot.gain) continue;
      const clip = project.clips.find((c) => c.id === slot.clipId);
      if (clip && isSourceTimed(clip)) slot.gain.gain.value = this.gainFor(clip);
    }
  }

  private syncPlaying(exact: number): void {
    const used = new Set<string>();
    for (const { clip, active } of this.timedClips(exact, LOOKAHEAD)) {
      const slot = this.acquire(clip);
      if (!slot) continue;
      used.add(clip.id);
      const el = slot.el;
      if (!active) {
        // Siapkan di titik masuk supaya klip langsung tampil saat mulai.
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - clip.in) > 0.05) el.currentTime = clip.in;
        continue;
      }
      const desired = sourceTimeAt(clip, exact);
      if (el.playbackRate !== clip.speed) el.playbackRate = clip.speed;
      if (slot.gain) slot.gain.gain.value = this.gainFor(clip);
      if (el.paused) {
        if (Math.abs(el.currentTime - desired) > 0.05) el.currentTime = desired;
        void el.play().catch(() => {});
      } else if (Math.abs(el.currentTime - desired) > DRIFT) {
        el.currentTime = desired;
      }
    }
    this.release(used);
  }

  private syncPaused(): void {
    const frame = editor.get().playhead;
    const used = new Set<string>();
    for (const { clip, active } of this.timedClips(frame, 0)) {
      if (!active || clip.type !== 'video') continue;
      const slot = this.acquire(clip);
      if (!slot) continue;
      used.add(clip.id);
      if (!slot.el.paused) slot.el.pause();
      const desired = sourceTimeAt(clip, frame);
      if (Math.abs(slot.el.currentTime - desired) > 0.5 / FPS) slot.el.currentTime = desired;
    }
    this.release(used);
  }

  /* ---------- Audio ---------- */

  private ensureAudio(): void {
    if (!this.audio) {
      this.audio = new AudioContext({ latencyHint: 'playback' });
      for (const slot of this.slots) this.connect(slot);
    }
    if (this.audio.state === 'suspended') void this.audio.resume();
  }

  private connect(slot: Slot): void {
    if (!this.audio || slot.gain) return;
    const source = this.audio.createMediaElementSource(slot.el);
    const gain = this.audio.createGain();
    source.connect(gain).connect(this.audio.destination);
    slot.gain = gain;
  }

  /* ---------- Menggambar ---------- */

  requestDraw(): void {
    if (this.drawQueued || this.destroyed) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      if (!this.clock) this.draw(editor.get().playhead);
    });
  }

  private getScratch = () => {
    if (!this.canvas) return null;
    if (!this.scratch || this.scratch.canvas.width !== this.canvas.width || this.scratch.canvas.height !== this.canvas.height) {
      const canvas = document.createElement('canvas');
      canvas.width = this.canvas.width;
      canvas.height = this.canvas.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      this.scratch = { canvas, ctx };
    }
    return this.scratch;
  };

  private resolve = (clip: VideoClip | ImageClip): FrameSource | null => {
    if (clip.type === 'image') return this.imageSource(clip.mediaId);
    const media = this.mediaFor(clip.mediaId);
    if (media?.decodePreview) {
      let source = this.decoded.get(media.id);
      if (!source) {
        source = new DecodedSource(media.file, () => this.requestDraw());
        this.decoded.set(media.id, source);
      }
      return source.frameAt(sourceTimeAt(clip, this.drawExact), this.clock !== null);
    }
    const slot = this.slots.find((s) => s.clipId === clip.id);
    const el = slot?.el;
    if (!(el instanceof HTMLVideoElement) || el.readyState < 2 || el.videoWidth === 0) return null;
    return { image: el, width: el.videoWidth, height: el.videoHeight };
  };

  private imageSource(mediaId: string): FrameSource | null {
    const cached = this.images.get(mediaId);
    if (cached && typeof cached === 'object') return { image: cached, width: cached.width, height: cached.height };
    if (cached) return null;
    const media = this.mediaFor(mediaId);
    if (!media) return null;
    this.images.set(mediaId, 'loading');
    createImageBitmap(media.file).then(
      (bitmap) => {
        if (this.destroyed) {
          bitmap.close();
          return;
        }
        this.images.set(mediaId, bitmap);
        this.requestDraw();
      },
      () => this.images.set(mediaId, 'error'),
    );
    return null;
  }

  private draw(exact: number): void {
    const { canvas, ctx } = this;
    if (!canvas || !ctx) return;
    this.drawExact = exact;
    const frame = Math.floor(exact);
    drawFrame(
      {
        ctx,
        width: canvas.width,
        height: canvas.height,
        textColors: this.textColors,
        fontFamily: PREVIEW_FONT,
        scratch: this.getScratch,
        resolve: this.resolve,
      },
      editor.get().project,
      frame,
    );
  }
}
