import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  type InputAudioTrack,
  type InputVideoTrack,
  type WrappedCanvas,
} from 'mediabunny';
import { drawFrame, layersAt, type Ctx2D, type FrameSource } from '../engine/compositor';
import { prepareVideoTrack } from '../engine/hevcDecoder';
import { codecLabel } from '../engine/codecs';
import { findTrack, hasAudio, isSourceTimed, projectDuration, sourceTimeAt, type VideoClip } from '../timeline/model';
import { FPS } from '../timeline/time';
import { mixBlock, type AudibleClip } from './audioMix';
import { AUDIO_CHANNELS, AUDIO_RATE, CODECS, type StartMessage, type WorkerMessage } from './protocol';

/** Bagian dari DedicatedWorkerGlobalScope yang dipakai di sini (proyek memakai satu tsconfig dengan lib DOM). */
interface WorkerScope {
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<StartMessage>) => void): void;
  fonts: FontFaceSet;
}

const scope = self as unknown as WorkerScope;

function post(message: WorkerMessage, transfer?: Transferable[]) {
  scope.postMessage(message, transfer);
}

async function loadFonts(msg: StartMessage) {
  await Promise.all(
    msg.fonts.map(async (f) => {
      try {
        const face = new FontFace(f.family, `url(${f.url})`, { weight: f.weight, unicodeRange: f.unicodeRange });
        scope.fonts.add(face);
        await face.load();
      } catch {
        // Font cadangan sistem tetap dipakai bila gagal dimuat.
      }
    }),
  );
}

interface SourceInfo {
  input: Input;
  video: InputVideoTrack | null;
  audio: InputAudioTrack | null;
  firstVideoTs: number;
}

async function run(msg: StartMessage) {
  const { project, settings } = msg;
  const total = projectDuration(project);
  if (total <= 0) throw new Error('Timeline masih kosong.');
  const codecs = CODECS[settings.format];
  const warnings = new Set<string>();

  await loadFonts(msg);

  /* ---------- Sumber ---------- */
  const sources = new Map<string, SourceInfo>();
  const images = new Map<string, ImageBitmap>();

  for (const m of msg.media) {
    if (m.kind === 'image') {
      try {
        images.set(m.id, await createImageBitmap(m.file));
      } catch {
        warnings.add(`Gambar ${m.name} tidak bisa dibaca dan dilewati.`);
      }
      continue;
    }
    const input = new Input({ source: new BlobSource(m.file), formats: ALL_FORMATS });
    try {
      const video = m.kind === 'video' ? await input.getPrimaryVideoTrack() : null;
      const audio = await input.getPrimaryAudioTrack();
      const videoOk = video ? await prepareVideoTrack(video) : false;
      const audioOk = audio ? await audio.canDecode() : false;
      if (video && !videoOk) {
        const codec = codecLabel(await video.getCodec());
        warnings.add(`Video ${m.name} (${codec}) tidak bisa didekode di browser ini dan dilewati. Coba Chrome atau Brave terbaru.`);
      }
      if (audio && !audioOk) warnings.add(`Suara ${m.name} tidak bisa didekode di browser ini dan dilewati.`);
      sources.set(m.id, {
        input,
        video: videoOk ? video : null,
        audio: audioOk ? audio : null,
        firstVideoTs: video && videoOk ? await video.getFirstTimestamp() : 0,
      });
    } catch {
      warnings.add(`${m.name} tidak bisa dibaca dan dilewati.`);
    }
  }

  /* ---------- Klip yang terdengar ---------- */
  const audible: AudibleClip[] = [];
  for (const clip of project.clips) {
    if (!isSourceTimed(clip) || !hasAudio(clip) || clip.volume <= 0) continue;
    if (findTrack(project, clip.trackId)?.muted) continue;
    const track = sources.get(clip.mediaId)?.audio;
    if (track) audible.push({ clip, track, gain: clip.volume, reader: null });
  }

  /* ---------- Keluaran ---------- */
  const target = new BufferTarget();
  const output = new Output({
    format: settings.format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target,
  });
  const canvas = new OffscreenCanvas(settings.width, settings.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Kanvas tidak tersedia di worker.');
  const quality = new Quality(settings.quality);
  const videoSource = new CanvasSource(canvas, { codec: codecs.video, quality, keyFrameInterval: 2 });
  output.addVideoTrack(videoSource, { frameRate: settings.fps });
  const audioSource = audible.length > 0 ? new AudioSampleSource({ codec: codecs.audio, quality }) : null;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();

  let scratch: { canvas: OffscreenCanvas; ctx: Ctx2D } | null = null;
  const getScratch = () => {
    if (!scratch) {
      const c = new OffscreenCanvas(settings.width, settings.height);
      const x = c.getContext('2d');
      if (!x) return null;
      scratch = { canvas: c, ctx: x };
    }
    return scratch;
  };

  /* ---------- Iterator frame per klip video ---------- */
  type FrameIter = AsyncGenerator<WrappedCanvas | null, void, unknown>;
  const iters = new Map<string, FrameIter>();
  const current = new Map<string, FrameSource>();

  const iterFor = (clip: VideoClip): FrameIter | null => {
    const existing = iters.get(clip.id);
    if (existing) return existing;
    const src = sources.get(clip.mediaId);
    if (!src?.video) return null;
    const sink = new CanvasSink(src.video, { poolSize: 2 });
    const first = src.firstVideoTs;
    const startFrame = clip.start;
    const end = clip.start + clip.duration;
    function* timestamps() {
      for (let f = startFrame; f < end; f++) yield Math.max(first, sourceTimeAt(clip, f));
    }
    const it = sink.canvasesAtTimestamps(timestamps());
    iters.set(clip.id, it);
    return it;
  };

  const finishIter = (id: string) => {
    const it = iters.get(id);
    if (it) void it.return(undefined).catch(() => {});
    iters.delete(id);
    current.delete(id);
  };

  /* ---------- Render ---------- */
  const audioBlock = AUDIO_RATE; // satu detik per blok
  const totalAudioFrames = Math.round((total / FPS) * AUDIO_RATE);
  let audioWritten = 0;
  let lastPost = 0;

  for (let f = 0; f < total; f++) {
    // Audio satu detik di depan video agar kedua trek berjalan bersisian.
    if (audioSource) {
      const needed = Math.min(totalAudioFrames, Math.round(((f + FPS) / FPS) * AUDIO_RATE));
      while (audioWritten < needed) {
        const frames = Math.min(audioBlock, totalAudioFrames - audioWritten);
        const data = await mixBlock(audible, audioWritten / AUDIO_RATE, frames);
        const sample = new AudioSample({
          data,
          format: 'f32-planar',
          numberOfChannels: AUDIO_CHANNELS,
          sampleRate: AUDIO_RATE,
          timestamp: audioWritten / AUDIO_RATE,
        });
        await audioSource.add(sample);
        sample.close();
        audioWritten += frames;
      }
    }

    const layers = layersAt(project, f);
    const activeVideo = new Set<string>();
    for (const layer of layers) {
      if (layer.kind !== 'visual' || layer.clip.type !== 'video') continue;
      const clip = layer.clip;
      activeVideo.add(clip.id);
      const it = iterFor(clip);
      if (!it) continue;
      const r = await it.next();
      if (!r.done && r.value) {
        current.set(clip.id, { image: r.value.canvas, width: r.value.canvas.width, height: r.value.canvas.height });
      }
    }
    for (const id of [...iters.keys()]) if (!activeVideo.has(id)) finishIter(id);

    drawFrame(
      {
        ctx,
        width: settings.width,
        height: settings.height,
        textColors: msg.textColors,
        fontFamily: msg.fontFamily,
        scratch: getScratch,
        resolve: (clip) => {
          if (clip.type === 'image') {
            const img = images.get(clip.mediaId);
            return img ? { image: img, width: img.width, height: img.height } : null;
          }
          return current.get(clip.id) ?? null;
        },
      },
      project,
      f,
    );
    await videoSource.add(f / settings.fps, 1 / settings.fps);

    const now = performance.now();
    if (now - lastPost > 100 || f === total - 1) {
      lastPost = now;
      post({ type: 'progress', done: f + 1, total });
    }
  }

  for (const id of [...iters.keys()]) finishIter(id);
  for (const ac of audible) ac.reader?.close();
  videoSource.close();
  audioSource?.close();
  await output.finalize();
  for (const s of sources.values()) s.input.dispose();
  for (const img of images.values()) img.close();

  for (const w of warnings) post({ type: 'warning', message: w });
  const buffer = target.buffer;
  if (!buffer) throw new Error('Berkas hasil kosong.');
  post(
    { type: 'done', buffer, mimeType: settings.format === 'mp4' ? 'video/mp4' : 'video/webm', extension: settings.format },
    [buffer],
  );
}

scope.addEventListener('message', (e) => {
  if (e.data.type !== 'start') return;
  run(e.data).catch((err: unknown) => {
    post({ type: 'error', message: err instanceof Error ? err.message : 'Ekspor gagal.' });
  });
});
