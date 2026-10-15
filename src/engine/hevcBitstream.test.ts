import { describe, expect, it } from 'vitest';
import { parseHvcCLenient, toAnnexB } from './hevcBitstream';

function hex(s: string): Uint8Array {
  const clean = s.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// HEVCDecoderConfigurationRecord dari kamera CCTV: menyatakan 4 array (byte ke-22 = 0x04)
// padahal hanya ada 3 (VPS, SPS, PPS), sehingga parser yang ketat membaca melewati ujung data.
const CCTV_HVCC = hex(`
  0101 6000 0000 9000 0000 0000 78f0 00fc fdf8 f800 000f 04
  20 0001 0017 4001 0c01 ffff 0160 0000 0300 b000 0003 0000 0300 7bac 09
  21 0001 0023 4201 0101 6000 0003 00b0 0000 0300 0003 007b a003 c080 10e5 8dae 4914 bf37 0101 0100 80
  22 0001 0009 4401 c0f2 c68d 03b3 40
`);

describe('parseHvcCLenient', () => {
  it('membaca array yang utuh dan mengabaikan jumlah array yang salah', () => {
    const parsed = parseHvcCLenient(CCTV_HVCC);
    expect(parsed).not.toBeNull();
    expect(parsed?.lengthSize).toBe(4);
    expect(parsed?.arrays.map((a) => a.type)).toEqual([32, 33, 34]);
    expect(parsed?.arrays.map((a) => a.nalus[0]?.length)).toEqual([23, 35, 9]);
  });

  it('menghasilkan hvcC yang dirapikan dengan jumlah array yang benar', () => {
    const parsed = parseHvcCLenient(CCTV_HVCC);
    expect(parsed?.repaired[22]).toBe(3);
    expect(parsed?.repaired.length).toBe(CCTV_HVCC.length);
    // Masukan tidak diubah.
    expect(CCTV_HVCC[22]).toBe(4);
  });

  it('membuang array yang terpotong di tengah', () => {
    const truncated = CCTV_HVCC.slice(0, CCTV_HVCC.length - 4);
    const parsed = parseHvcCLenient(truncated);
    expect(parsed?.arrays.map((a) => a.type)).toEqual([32, 33]);
    expect(parsed?.repaired[22]).toBe(2);
  });

  it('menolak data yang bukan hvcC', () => {
    expect(parseHvcCLenient(new Uint8Array([0, 1, 2]))).toBeNull();
  });
});

describe('toAnnexB', () => {
  const vps = hex('4001 0c01');
  const slice = hex('2601 af57 40');
  const lengthPrefixed = hex(`0000 0004 ${'4001 0c01'} 0000 0005 ${'2601 af57 40'}`);

  it('mengganti panjang NAL 4 byte dengan start code', () => {
    const out = toAnnexB(lengthPrefixed, 4, []);
    expect(Array.from(out)).toEqual([0, 0, 0, 1, ...vps, 0, 0, 0, 1, ...slice]);
  });

  it('menyisipkan parameter set bila frame kunci tidak membawanya', () => {
    const onlySlice = hex(`0000 0005 ${'2601 af57 40'}`);
    const sps = hex('4201 01');
    const out = toAnnexB(onlySlice, 4, [sps]);
    expect(Array.from(out)).toEqual([0, 0, 0, 1, ...sps, 0, 0, 0, 1, ...slice]);
  });

  it('tidak menyisipkan parameter set bila sudah ada di stream (hev1)', () => {
    const out = toAnnexB(lengthPrefixed, 4, [hex('4201 01')]);
    expect(out.length).toBe(4 + vps.length + 4 + slice.length);
  });

  it('membiarkan data yang sudah Annex B', () => {
    const annexB = hex(`0000 0001 ${'2601 af57 40'}`);
    expect(toAnnexB(annexB, 4, [])).toBe(annexB);
  });

  it('mencoba ukuran panjang lain bila hvcC salah menyebutnya', () => {
    const twoByte = hex(`0005 ${'2601 af57 40'}`);
    expect(Array.from(toAnnexB(twoByte, 4, []))).toEqual([0, 0, 0, 1, ...slice]);
  });
});
