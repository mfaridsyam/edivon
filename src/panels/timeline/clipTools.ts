import { create } from 'zustand';
import { addTextClip } from '../../state/actions';
import { editor } from '../../state/store';
import { findClip } from '../../timeline/model';

export type PopoverTool = 'speed' | 'volume' | 'effect';

interface ClipPopoverState {
  open: { clipId: string; tool: PopoverTool; anchor: DOMRect; returnFocus: HTMLElement | null } | null;
}

/** Popover kontekstual untuk alat Kecepatan, Volume, dan Efek. */
export const useClipPopover = create<ClipPopoverState>()(() => ({ open: null }));

export function closeClipPopover(): void {
  const open = useClipPopover.getState().open;
  if (!open) return;
  useClipPopover.setState({ open: null });
  if (open.returnFocus?.isConnected) open.returnFocus.focus();
}

/** Aksi alat saat klip diklik atau ditekan Enter (selain Pilih dan Crop). */
export function clipToolAction(clipId: string, el: HTMLElement): void {
  const s = editor.get();
  const tool = s.tool;
  if (tool === 'text') {
    // Alat Teks pada klip: teks baru menutupi rentang klip itu, cocok untuk keterangan.
    const clip = findClip(s.project, clipId);
    if (clip) addTextClip('caption', { start: clip.start, duration: clip.duration });
    return;
  }
  if (tool === 'speed' || tool === 'volume' || tool === 'effect') {
    useClipPopover.setState({
      open: { clipId, tool, anchor: el.getBoundingClientRect(), returnFocus: el },
    });
  }
}
