import { create } from 'zustand';
import { editor } from '../../state/store';

export type PopoverTool = 'speed' | 'volume' | 'effect';

interface ClipPopoverState {
  open: { clipId: string; tool: PopoverTool; anchor: DOMRect } | null;
}

/** Popover kontekstual untuk alat Kecepatan, Volume, dan Efek. */
export const useClipPopover = create<ClipPopoverState>()(() => ({ open: null }));

/** Aksi alat saat klip diklik atau ditekan Enter (selain Pilih, Belah, Potong, Crop). */
export function clipToolAction(clipId: string, el: HTMLElement): void {
  const tool = editor.get().tool;
  if (tool === 'speed' || tool === 'volume' || tool === 'effect') {
    useClipPopover.setState({ open: { clipId, tool, anchor: el.getBoundingClientRect() } });
  }
}
