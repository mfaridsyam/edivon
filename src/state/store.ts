import { create } from 'zustand';
import { createProject, findClip, type Project } from '../timeline/model';
import { packMainTrack } from '../timeline/ops';
import {
  canRedo,
  canUndo,
  commit,
  commitFrom,
  createHistory,
  redo as historyRedo,
  undo as historyUndo,
  type History,
} from './history';
import type { MediaItem } from './media';

export type ToolId = 'select' | 'split' | 'text' | 'crop' | 'speed' | 'volume' | 'effect';
export type LeftTab = 'media' | 'audio' | 'text' | 'effect';
export type RightTab = 'video' | 'audio' | 'color';

export const ZOOM_MIN = 2;
export const ZOOM_MAX = 300;
export const ZOOM_DEFAULT = 12;

export interface EditorState {
  /** Dokumen proyek saat ini (sama dengan history.present, kecuali selama gestur seret). */
  project: Project;
  history: History<Project>;
  /** Proyek sebelum gestur seret dimulai; null bila tidak sedang menyeret. */
  gestureBase: Project | null;

  media: MediaItem[];
  selection: string[];
  tool: ToolId;
  /** Posisi playhead dalam frame. */
  playhead: number;
  playing: boolean;
  /** Piksel per detik di timeline. */
  zoom: number;
  leftTab: LeftTab;
  rightTab: RightTab;
  /** Pesan untuk wilayah aria-live. */
  announcement: { text: string; id: number };

  apply: (fn: (p: Project) => Project, opts?: { coalesce?: string }) => void;
  beginGesture: () => void;
  updateGesture: (fn: (base: Project) => Project) => void;
  endGesture: () => void;
  cancelGesture: () => void;
  undo: () => void;
  redo: () => void;

  select: (ids: string[]) => void;
  setTool: (tool: ToolId) => void;
  setPlayhead: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  setLeftTab: (tab: LeftTab) => void;
  setRightTab: (tab: RightTab) => void;
  announce: (text: string) => void;

  addMedia: (item: MediaItem) => void;
  updateMedia: (id: string, patch: Partial<MediaItem>) => void;
}

function pruneSelection(selection: string[], project: Project): string[] {
  const next = selection.filter((id) => findClip(project, id));
  return next.length === selection.length ? selection : next;
}

export const useEditor = create<EditorState>()((set, get) => {
  const initial = createProject();
  return {
    project: initial,
    history: createHistory(initial),
    gestureBase: null,

    media: [],
    selection: [],
    tool: 'select',
    playhead: 0,
    playing: false,
    zoom: ZOOM_DEFAULT,
    leftTab: 'media',
    rightTab: 'video',
    announcement: { text: '', id: 0 },

    apply: (fn, opts) => {
      const s = get();
      if (s.gestureBase) return;
      // Lajur utama selalu rapat ke kiri, apa pun operasinya.
      const next = packMainTrack(fn(s.project));
      if (next === s.project) return;
      const history = commit(s.history, next, { coalesce: opts?.coalesce });
      set({ project: next, history, selection: pruneSelection(s.selection, next) });
    },

    beginGesture: () => {
      const s = get();
      if (s.gestureBase) return;
      set({ gestureBase: s.project });
    },

    updateGesture: (fn) => {
      const base = get().gestureBase;
      if (!base) return;
      set({ project: packMainTrack(fn(base)) });
    },

    endGesture: () => {
      const s = get();
      if (!s.gestureBase) return;
      const history = commitFrom({ ...s.history, present: s.project }, s.gestureBase);
      set({ gestureBase: null, history, selection: pruneSelection(s.selection, s.project) });
    },

    cancelGesture: () => {
      const s = get();
      if (!s.gestureBase) return;
      set({ project: s.gestureBase, gestureBase: null });
    },

    undo: () => {
      const s = get();
      if (s.gestureBase || !canUndo(s.history)) return;
      const history = historyUndo(s.history);
      set({ history, project: history.present, selection: pruneSelection(s.selection, history.present) });
      get().announce('Langkah terakhir diurungkan.');
    },

    redo: () => {
      const s = get();
      if (s.gestureBase || !canRedo(s.history)) return;
      const history = historyRedo(s.history);
      set({ history, project: history.present, selection: pruneSelection(s.selection, history.present) });
      get().announce('Langkah diulangi.');
    },

    select: (ids) => set({ selection: ids }),
    setTool: (tool) => set({ tool }),
    setPlayhead: (frame) => set({ playhead: Math.max(0, Math.round(frame)) }),
    setPlaying: (playing) => set({ playing }),
    setZoom: (zoom) => set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) }),
    setLeftTab: (leftTab) => set({ leftTab }),
    setRightTab: (rightTab) => set({ rightTab }),
    announce: (text) => set((s) => ({ announcement: { text, id: s.announcement.id + 1 } })),

    addMedia: (item) => set((s) => ({ media: [...s.media, item] })),
    updateMedia: (id, patch) =>
      set((s) => ({ media: s.media.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  };
});

/** Akses store di luar React (engine, pintasan keyboard). */
export const editor = {
  get: () => useEditor.getState(),
  subscribe: useEditor.subscribe,
};

if (import.meta.env.DEV) {
  // Memudahkan pemeriksaan manual dari konsol selama pengembangan.
  (window as unknown as { __klip?: typeof useEditor }).__klip = useEditor;
}
