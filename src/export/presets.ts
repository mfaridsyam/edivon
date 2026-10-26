import { frameSize, type Aspect } from '../timeline/model';

/*
 * Preset ekspor untuk media sosial. Semuanya MP4 H.264 + AAC 48 kHz, 30 fps, dengan metadata di awal
 * berkas (fast start) agar diterima dan diputar langsung oleh WhatsApp dan Instagram.
 *
 * Kedua aplikasi selalu mengompres ulang video yang diunggah. Hasil "pecah" biasanya datang dari
 * kompresi ganda dan ukuran yang tidak cocok (mis. video lanskap dikecilkan untuk status tegak).
 * Karena itu ukurannya disamakan dengan tampilan di aplikasi, dan bitrate-nya cukup tinggi agar
 * kompresi ulang mulai dari gambar yang bersih.
 */

export type DestinationId = 'custom' | 'wa-status' | 'ig-feed' | 'ig-story';

export interface SocialPreset {
  id: Exclude<DestinationId, 'custom'>;
  label: string;
  aspect: Aspect;
  width: number;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  /** Batas durasi yang umum dipakai aplikasi tujuan per bagian, dalam detik. */
  maxSeconds?: number;
  note: string;
}

export const SOCIAL_PRESETS: readonly SocialPreset[] = [
  {
    id: 'wa-status',
    label: 'Status WhatsApp',
    aspect: '9:16',
    width: 720,
    height: 1280,
    videoBitrate: 3_000_000,
    audioBitrate: 128_000,
    maxSeconds: 60,
    note: 'WhatsApp selalu mengompres ulang video status. Ukuran 720×1280 membuat hasilnya tetap bersih. Bila WhatsApp menawarkan pilihan HD saat mengirim, pilih HD.',
  },
  {
    id: 'ig-feed',
    label: 'Feed Instagram',
    aspect: '4:5',
    width: 1080,
    height: 1350,
    videoBitrate: 8_000_000,
    audioBitrate: 128_000,
    note: 'Rasio 4:5 memenuhi layar feed di HP.',
  },
  {
    id: 'ig-story',
    label: 'Story & Reels Instagram',
    aspect: '9:16',
    width: 1080,
    height: 1920,
    videoBitrate: 10_000_000,
    audioBitrate: 128_000,
    maxSeconds: 60,
    note: 'Tegak memenuhi layar. Story yang lebih dari 60 detik dibagi Instagram menjadi beberapa bagian.',
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
 * Bila rasio proyek berbeda dari rasio tujuan, komposisi proyek ditaruh utuh di tengah bingkai
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
