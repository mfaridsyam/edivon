import type { ToolId } from './store';

export interface ToolDef {
  id: ToolId;
  label: string;
  /** Tombol pintasan yang ditampilkan dan dipakai (huruf kecil dicocokkan tanpa memedulikan kapital). */
  key: string;
  hint: string;
}

/** Alat bermode: hanya satu yang aktif. Hapus adalah aksi dan didefinisikan terpisah. */
export const TOOLS: readonly ToolDef[] = [
  { id: 'select', label: 'Pilih', key: 'V', hint: 'Pilih dan geser klip, tarik ujungnya untuk memendekkan' },
  { id: 'text', label: 'Teks', key: 'T', hint: 'Klik timeline untuk menambah teks' },
  { id: 'crop', label: 'Crop', key: 'C', hint: 'Crop klip di pratinjau' },
  { id: 'speed', label: 'Kecepatan', key: 'K', hint: 'Klik klip untuk mengatur kecepatan' },
  { id: 'volume', label: 'Volume', key: 'A', hint: 'Klik klip untuk mengatur volume' },
  { id: 'effect', label: 'Efek', key: 'F', hint: 'Klik klip untuk memberi efek' },
];

export const DELETE_TOOL = { label: 'Hapus', key: 'Delete', hint: 'Hapus klip terpilih' } as const;

export type CutId = 'cut-left' | 'split' | 'cut-right';

/** Aksi di garis merah (playhead): bukan alat bermode, langsung dijalankan. */
export const CUT_ACTIONS: readonly { id: CutId; label: string; key: string; hint: string }[] = [
  { id: 'cut-left', label: 'Potong kiri', key: 'Q', hint: 'Buang bagian klip di kiri garis merah' },
  { id: 'split', label: 'Belah', key: 'W', hint: 'Belah klip di garis merah' },
  { id: 'cut-right', label: 'Potong kanan', key: 'E', hint: 'Buang bagian klip di kanan garis merah' },
];

export function cutByKey(key: string): (typeof CUT_ACTIONS)[number] | undefined {
  const k = key.toUpperCase();
  return CUT_ACTIONS.find((a) => a.key === k);
}

export function toolByKey(key: string): ToolDef | undefined {
  const k = key.toUpperCase();
  return TOOLS.find((t) => t.key === k);
}
