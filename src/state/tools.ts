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
  { id: 'select', label: 'Pilih', key: 'V', hint: 'Pilih dan geser klip' },
  { id: 'split', label: 'Belah', key: 'S', hint: 'Klik klip untuk membelah' },
  { id: 'trim', label: 'Potong', key: 'P', hint: 'Seret untuk memotong tepi klip' },
  { id: 'text', label: 'Teks', key: 'T', hint: 'Klik timeline untuk menambah teks' },
  { id: 'crop', label: 'Crop', key: 'C', hint: 'Crop klip di pratinjau' },
  { id: 'speed', label: 'Kecepatan', key: 'K', hint: 'Klik klip untuk mengatur kecepatan' },
  { id: 'volume', label: 'Volume', key: 'A', hint: 'Klik klip untuk mengatur volume' },
  { id: 'effect', label: 'Efek', key: 'E', hint: 'Klik klip untuk memberi efek' },
];

export const DELETE_TOOL = { label: 'Hapus', key: 'Delete', hint: 'Hapus klip terpilih' } as const;

export function toolByKey(key: string): ToolDef | undefined {
  const k = key.toUpperCase();
  return TOOLS.find((t) => t.key === k);
}
