import { deleteSelection, jumpToEnd, jumpToStart, setTool } from '../state/actions';
import { editor } from '../state/store';
import { toolByKey } from '../state/tools';
import { closeClipPopover, useClipPopover } from '../panels/timeline/clipTools';
import { FPS } from '../timeline/time';
import { useUi } from './uiState';

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'number', 'url', 'tel', 'password']);

/** True bila fokus ada di kolom isian, sehingga huruf dan spasi harus diteruskan ke sana. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  return false;
}

function inOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('dialog, [role="dialog"], [role="menu"]') !== null;
}

/**
 * Pintasan global: alat (V S P T C K A E), Delete/Backspace, Spasi, undo/redo,
 * Home/End, dan panah untuk playhead saat tidak ada kontrol yang menangani panah.
 */
export function installShortcuts(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    const s = editor.get();
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;

    if (useUi.getState().exportOpen || document.querySelector('dialog[open]')) return;

    // Undo/redo bekerja di mana pun kecuali di kolom isian (yang punya undo sendiri).
    if (mod && !e.altKey && (key === 'z' || key === 'Z')) {
      if (isTyping(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) s.redo();
      else s.undo();
      return;
    }
    if (mod && !e.altKey && (key === 'y' || key === 'Y')) {
      if (isTyping(e.target)) return;
      e.preventDefault();
      s.redo();
      return;
    }

    if (isTyping(e.target) || inOverlay(e.target)) return;

    if (key === 'Escape') {
      if (useClipPopover.getState().open) closeClipPopover();
      else if (s.tool !== 'select') setTool('select');
      else if (s.selection.length > 0) s.select([]);
      return;
    }

    if (key === ' ' || key === 'Spacebar') {
      if (mod || e.altKey) return;
      e.preventDefault();
      s.setPlaying(!s.playing);
      return;
    }

    if (key === 'Delete' || key === 'Backspace') {
      if (s.selection.length === 0) return;
      e.preventDefault();
      deleteSelection();
      return;
    }

    if (key === 'Home' || key === 'End') {
      e.preventDefault();
      if (key === 'Home') jumpToStart();
      else jumpToEnd();
      return;
    }

    // Panah menggeser playhead bila fokus tidak berada di kontrol yang memakai panah.
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && !mod && !e.altKey) {
      const t = e.target;
      if (t instanceof HTMLElement && t.closest('[role="slider"], [role="tablist"], [role="radiogroup"], [role="listbox"], input, .clip')) {
        return;
      }
      e.preventDefault();
      const step = (e.shiftKey ? FPS : 1) * (key === 'ArrowLeft' ? -1 : 1);
      s.setPlayhead(Math.max(0, s.playhead + step));
      return;
    }

    if (!mod && !e.altKey && key.length === 1) {
      const tool = toolByKey(key);
      if (tool) {
        e.preventDefault();
        setTool(tool.id);
        s.announce(`Alat ${tool.label.toLowerCase()} aktif.`);
      }
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
