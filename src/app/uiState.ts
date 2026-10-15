import { create } from 'zustand';

/** Keadaan tata letak dan dialog yang bukan bagian dari proyek. */
interface UiState {
  exportOpen: boolean;
  /** Lebar layar di bawah 960px: panel kanan jadi laci, panel kiri bisa diciutkan. */
  narrow: boolean;
  leftOpen: boolean;
  drawerOpen: boolean;
  openExport: () => void;
  closeExport: () => void;
  setNarrow: (narrow: boolean) => void;
  toggleLeft: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const NARROW_QUERY = '(max-width: 959.98px)';

export const useUi = create<UiState>()((set) => ({
  exportOpen: false,
  narrow: typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches,
  leftOpen: typeof window === 'undefined' || window.innerWidth >= 720,
  drawerOpen: false,
  openExport: () => set({ exportOpen: true }),
  closeExport: () => set({ exportOpen: false }),
  setNarrow: (narrow) => set((s) => ({ narrow, drawerOpen: narrow ? s.drawerOpen : false })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));
