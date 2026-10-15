import type { TextColorId } from '../timeline/model';

/** Membaca nilai token CSS (mis. "--ink") untuk dipakai di kanvas. */
export function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Warna teks di video hanya boleh dari token. */
export const TEXT_COLOR_TOKEN: Record<TextColorId, string> = {
  white: '--surface-raised',
  ink: '--ink',
  accent: '--accent',
  danger: '--danger',
};

export const TEXT_COLOR_LABEL: Record<TextColorId, string> = {
  white: 'Putih',
  ink: 'Gelap',
  accent: 'Aksen',
  danger: 'Merah',
};

/** Peta warna teks yang sudah di-resolve, untuk compositor (juga dikirim ke worker ekspor). */
export function resolveTextColors(): Record<TextColorId, string> {
  return {
    white: readToken(TEXT_COLOR_TOKEN.white),
    ink: readToken(TEXT_COLOR_TOKEN.ink),
    accent: readToken(TEXT_COLOR_TOKEN.accent),
    danger: readToken(TEXT_COLOR_TOKEN.danger),
  };
}
