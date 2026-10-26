import { ASPECT_RATIO, frameSize, sizeForShortSide, type Aspect } from '../timeline/model';

/*
 * Preset ekspor untuk media sosial. Semuanya MP4 H.264 + AAC 48 kHz, 30 fps, dengan metadata di awal
 * berkas (fast start) agar diterima dan diputar langsung oleh WhatsApp dan Instagram.
 *
 * Kedua aplikasi selalu mengompres ulang video yang diunggah. Hasil "pecah" biasanya datang dari
 * kompresi ganda dan ukuran yang tidak cocok, jadi bitrate-nya dibuat cukup tinggi agar kompresi ulang
 * mulai dari gambar yang bersih. Rasio tidak dipaksakan: Story dan Status menerima rasio apa pun
 * (ditampilkan dengan tepi kosong), hanya Feed Instagram yang memotong video yang terlalu tegak.
 */

export type DestinationId = 'custom' | 'wa-status' | 'ig-feed' | 'ig-story';
/** Sisi pendek bingkai keluaran untuk preset media sosial. */
export type PresetResolution = 720 | 1080;
/** 'project' = mengikuti rasio proyek; 'fill' = rasio yang memenuhi layar aplikasi. */
export type PresetFit = 'project' | 'fill';

export interface SocialPreset {
  id: Exclude<DestinationId, 'custom'>;
  label: string;
  /** Ringkasan singkat untuk kartu pilihan. */
  summary: string;
  /** Rasio yang memenuhi layar di aplikasi tujuan. */
  aspect: Aspect;
  /** Resolusi bawaan (sisi pendek). */
  short: PresetResolution;
  /** Bit per piksel per frame; bitrate mengikuti ukuran yang dipilih. */
  bpp: number;
  audioBitrate: number;
  /** Rentang rasio (lebar/tinggi) yang ditampilkan utuh; di luar itu aplikasi memotong video. */
  ratioRange?: readonly [min: number, max: number];
  /** Batas durasi yang umum dipakai aplikasi tujuan per bagian, dalam detik. */
  maxSeconds?: number;
  note: string;
}

export const SOCIAL_PRESETS: readonly SocialPreset[] = [
  {
    id: 'wa-status',
    label: 'Status WhatsApp',
    summary: 'MP4 · 720p · penuh layar 9:16',
    aspect: '9:16',
    short: 720,
    // 720x1280 @ 30 fps ≈ 3 Mbps
    bpp: 0.11,
    audioBitrate: 128_000,
    maxSeconds: 60,
    note: 'WhatsApp selalu mengompres ulang video status. Bila WhatsApp menawarkan pilihan HD saat mengirim, pilih HD.',
  },
  {
    id: 'ig-feed',
    label: 'Feed Instagram',
    summary: 'MP4 · 1080p · paling pas 4:5',
    aspect: '4:5',
    short: 1080,
    // 1080x1350 @ 30 fps ≈ 8 Mbps
    bpp: 0.18,
    audioBitrate: 128_000,
    ratioRange: [0.8, 1.91],
    note: 'Feed menampilkan rasio 1,91:1 sampai 4:5. Rasio 4:5 memenuhi layar feed di HP.',
  },
  {
    id: 'ig-story',
    label: 'Story & Reels Instagram',
    summary: 'MP4 · 1080p · penuh layar 9:16',
    aspect: '9:16',
    short: 1080,
    // 1080x1920 @ 30 fps ≈ 10 Mbps
    bpp: 0.16,
    audioBitrate: 128_000,
    maxSeconds: 60,
    note: 'Story yang lebih dari 60 detik dibagi Instagram menjadi beberapa bagian.',
  },
];

export function presetById(id: DestinationId): SocialPreset | undefined {
  return SOCIAL_PRESETS.find((p) => p.id === id);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bila rasio proyek berbeda dari rasio keluaran, komposisi proyek ditaruh utuh di tengah bingkai
 * keluaran dengan latar hitam (letterbox/pillarbox), bukan diregangkan atau dipotong.
 * Mengembalikan null bila rasionya sama.
 */
export function letterbox(project: Aspect, outW: number, outH: number): Rect | null {
  const ref = frameSize(project);
  const scale = Math.min(outW / ref.width, outH / ref.height);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const width = Math.min(outW, even(ref.width * scale));
  const height = Math.min(outH, even(ref.height * scale));
  if (width === outW && height === outH) return null;
  return { x: Math.round((outW - width) / 2), y: Math.round((outH - height) / 2), width, height };
}

function ratioOf(aspect: Aspect): number {
  const [w, h] = ASPECT_RATIO[aspect];
  return w / h;
}

/** True bila aplikasi tujuan menampilkan rasio proyek ini utuh. */
export function projectAspectAllowed(preset: SocialPreset, project: Aspect): boolean {
  if (!preset.ratioRange) return true;
  const r = ratioOf(project);
  return r >= preset.ratioRange[0] - 1e-6 && r <= preset.ratioRange[1] + 1e-6;
}

export interface PresetPlan {
  /** Rasio bingkai keluaran. */
  aspect: Aspect;
  width: number;
  height: number;
  /** Area komposisi proyek di dalam bingkai keluaran bila rasionya berbeda. */
  inner: Rect | null;
  videoBitrate: number;
  /** Mode yang benar-benar dipakai (rasio di luar rentang aplikasi selalu 'fill'). */
  fit: PresetFit;
}

const MIN_SOCIAL_BITRATE = 1_000_000;

/** Ukuran, area komposisi, dan bitrate untuk preset, rasio proyek, mode rasio, dan resolusi tertentu. */
export function presetPlan(preset: SocialPreset, project: Aspect, fit: PresetFit, short: PresetResolution, fps = 30): PresetPlan {
  const useFill = fit === 'fill' || !projectAspectAllowed(preset, project);
  const aspect = useFill ? preset.aspect : project;
  const { width, height } = sizeForShortSide(aspect, short);
  const bitrate = Math.max(MIN_SOCIAL_BITRATE, Math.round((width * height * fps * preset.bpp) / 100_000) * 100_000);
  return {
    aspect,
    width,
    height,
    inner: useFill ? letterbox(project, width, height) : null,
    videoBitrate: bitrate,
    fit: useFill && project !== preset.aspect ? 'fill' : 'project',
  };
}
