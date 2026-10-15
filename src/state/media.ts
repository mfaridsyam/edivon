export type MediaKind = 'video' | 'audio' | 'image';

/** Berkas yang diimpor. Hanya ada di memori tab ini; tidak pernah dikirim ke mana pun. */
export interface MediaItem {
  id: string;
  kind: MediaKind;
  name: string;
  file: File;
  /** Object URL (blob:) untuk elemen <video>/<audio>/<img>. */
  url: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
  /** Detik; 0 untuk gambar. */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Object URL thumbnail, atau null bila belum/tidak ada. */
  thumbnail: string | null;
  /** False bila browser bisa memutar tapi pembacaan untuk ekspor tidak didukung. */
  exportable: boolean;
  /**
   * True bila gambar pratinjau harus didekode lewat WebCodecs karena elemen <video> tidak bisa
   * di-seek akurat (mis. HEVC dari kamera CCTV dengan parameter codec rusak).
   */
  decodePreview: boolean;
}
