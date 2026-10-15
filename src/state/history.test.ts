import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, commit, commitFrom, createHistory, redo, undo, HISTORY_LIMIT } from './history';

describe('undo/redo', () => {
  it('mencatat, mengurungkan, dan mengulangi', () => {
    let h = createHistory('a');
    h = commit(h, 'b');
    h = commit(h, 'c');
    expect(h.present).toBe('c');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe('b');
    expect(canRedo(h)).toBe(true);
  });

  it('perubahan baru menghapus masa depan', () => {
    let h = commit(commit(createHistory('a'), 'b'), 'c');
    h = undo(h);
    h = commit(h, 'd');
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe('b');
  });

  it('mengabaikan commit tanpa perubahan', () => {
    const h = createHistory('a');
    expect(commit(h, 'a')).toBe(h);
  });

  it('menggabungkan perubahan berkunci sama dalam jendela waktu', () => {
    let h = commit(createHistory(0), 1, { coalesce: 'scale', now: 1000 });
    h = commit(h, 2, { coalesce: 'scale', now: 1200 });
    h = commit(h, 3, { coalesce: 'scale', now: 1400 });
    expect(h.present).toBe(3);
    expect(undo(h).present).toBe(0);
  });

  it('tidak menggabungkan setelah jendela waktu lewat atau kunci berbeda', () => {
    let h = commit(createHistory(0), 1, { coalesce: 'scale', now: 1000 });
    h = commit(h, 2, { coalesce: 'scale', now: 5000 });
    h = commit(h, 3, { coalesce: 'opacity', now: 5100 });
    expect(undo(h).present).toBe(2);
    expect(undo(undo(h)).present).toBe(1);
  });

  it('gestur seret dicatat sebagai satu langkah dari keadaan awal', () => {
    let h = createHistory('awal');
    // Selama seret, present diganti langsung tanpa riwayat.
    h = { ...h, present: 'tengah' };
    h = { ...h, present: 'akhir' };
    h = commitFrom(h, 'awal');
    expect(h.present).toBe('akhir');
    expect(undo(h).present).toBe('awal');
  });

  it('membatasi panjang riwayat', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
