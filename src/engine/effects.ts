import type { EffectId } from '../timeline/model';
import { EFFECT_LABEL } from '../timeline/model';

export interface EffectDef {
  id: EffectId;
  label: string;
  /** String filter kanvas/CSS. `height` = tinggi bingkai keluaran, untuk efek berbasis piksel. */
  filter: (height: number) => string;
  /**
   * Seberapa kuat hasil filter dicampur di atas gambar asli (0..1), dikalikan opasitas klip.
   * Tint hangat/sejuk memakai campuran sebagian agar warna asli tetap terasa.
   */
  mix: number;
}

export const EFFECTS: readonly EffectDef[] = [
  { id: 'grayscale', label: EFFECT_LABEL.grayscale, filter: () => 'grayscale(1)', mix: 1 },
  { id: 'sepia', label: EFFECT_LABEL.sepia, filter: () => 'sepia(1)', mix: 0.85 },
  { id: 'warm', label: EFFECT_LABEL.warm, filter: () => 'sepia(1) saturate(1.8) hue-rotate(-12deg)', mix: 0.35 },
  { id: 'cool', label: EFFECT_LABEL.cool, filter: () => 'sepia(1) saturate(1.8) hue-rotate(170deg)', mix: 0.35 },
  { id: 'fade', label: EFFECT_LABEL.fade, filter: () => 'contrast(0.8) brightness(1.1) saturate(0.65)', mix: 1 },
  { id: 'blur', label: EFFECT_LABEL.blur, filter: (h) => `blur(${Math.max(1, h / 200).toFixed(2)}px)`, mix: 1 },
];

export function effectDef(id: EffectId): EffectDef | undefined {
  return EFFECTS.find((e) => e.id === id);
}
