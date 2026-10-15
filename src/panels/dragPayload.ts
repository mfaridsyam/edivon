import type { DragEvent } from 'react';
import { mediaClipFrames, type TextPresetId } from '../state/clipFactory';
import { editor } from '../state/store';
import { EFFECT_DEFAULT_FRAMES, TEXT_DEFAULT_FRAMES, type ClipType, type EffectId } from '../timeline/model';

/** Isi seret dari panel kiri ke timeline. Disimpan di modul karena dataTransfer tidak bisa dibaca saat dragover. */
export type DragPayload =
  | { kind: 'media'; id: string }
  | { kind: 'text'; preset: TextPresetId }
  | { kind: 'effect'; effect: EffectId };

const MIME = 'application/x-klip';
let current: DragPayload | null = null;

export function startPayloadDrag(e: DragEvent<HTMLElement>, payload: DragPayload, label: string): void {
  current = payload;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(MIME, JSON.stringify(payload));
  e.dataTransfer.setData('text/plain', label);
  document.documentElement.classList.add('klip-dragging');
}

export function endPayloadDrag(): void {
  current = null;
  document.documentElement.classList.remove('klip-dragging');
}

export function currentPayload(): DragPayload | null {
  return current;
}

/** Jenis klip dan durasi yang akan dibuat dari isi seret. */
export function payloadClip(p: DragPayload): { type: ClipType; duration: number } | null {
  switch (p.kind) {
    case 'media': {
      const media = editor.get().media.find((m) => m.id === p.id);
      if (!media || media.status !== 'ready') return null;
      return { type: media.kind, duration: mediaClipFrames(media) };
    }
    case 'text':
      return { type: 'text', duration: TEXT_DEFAULT_FRAMES };
    case 'effect':
      return { type: 'effect', duration: EFFECT_DEFAULT_FRAMES };
  }
}
