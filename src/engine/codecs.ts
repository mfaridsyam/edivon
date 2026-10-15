/** Nama codec yang mudah dibaca untuk pesan ke pengguna. */
export function codecLabel(codec: string | null): string {
  switch (codec) {
    case 'hevc':
      return 'H.265 (HEVC)';
    case 'avc':
      return 'H.264';
    case 'vp9':
      return 'VP9';
    case 'vp8':
      return 'VP8';
    case 'av1':
      return 'AV1';
    default:
      return codec ?? 'tidak dikenal';
  }
}
