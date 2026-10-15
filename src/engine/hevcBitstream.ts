/*
 * Utilitas bitstream HEVC (H.265) tanpa ketergantungan browser, agar bisa dites di Node.
 */

export interface LenientHvcC {
  lengthSize: number;
  arrays: { type: number; nalus: Uint8Array[] }[];
  /** hvcC yang sudah dirapikan: hanya array yang utuh, jumlah array disesuaikan. */
  repaired: Uint8Array;
}

/** Membaca HEVCDecoderConfigurationRecord dengan toleran; berhenti di array pertama yang terpotong. */
export function parseHvcCLenient(bytes: Uint8Array): LenientHvcC | null {
  if (bytes.length < 23 || bytes[0] !== 1) return null;
  const lengthSize = ((bytes[21] ?? 3) & 3) + 1;
  const declared = bytes[22] ?? 0;
  const arrays: LenientHvcC['arrays'] = [];
  let off = 23;
  let end = off;
  for (let i = 0; i < declared; i++) {
    if (off + 3 > bytes.length) break;
    const type = (bytes[off] ?? 0) & 0x3f;
    const count = ((bytes[off + 1] ?? 0) << 8) | (bytes[off + 2] ?? 0);
    let p = off + 3;
    const nalus: Uint8Array[] = [];
    let complete = true;
    for (let j = 0; j < count; j++) {
      if (p + 2 > bytes.length) {
        complete = false;
        break;
      }
      const len = ((bytes[p] ?? 0) << 8) | (bytes[p + 1] ?? 0);
      p += 2;
      if (p + len > bytes.length) {
        complete = false;
        break;
      }
      nalus.push(bytes.subarray(p, p + len));
      p += len;
    }
    if (!complete) break;
    arrays.push({ type, nalus });
    off = p;
    end = p;
  }
  const repaired = bytes.slice(0, end);
  repaired[22] = arrays.length;
  return { lengthSize, arrays, repaired };
}

const START_CODE = new Uint8Array([0, 0, 0, 1]);

function nalType(nal: Uint8Array): number {
  return ((nal[0] ?? 0) >> 1) & 0x3f;
}

/** Memecah paket berformat panjang-NAL; null bila rantai panjangnya tidak cocok dengan ukuran paket. */
function splitLengthPrefixed(data: Uint8Array, lengthSize: number): Uint8Array[] | null {
  const nalus: Uint8Array[] = [];
  let off = 0;
  while (off < data.length) {
    if (off + lengthSize > data.length) return null;
    let len = 0;
    for (let i = 0; i < lengthSize; i++) len = len * 256 + (data[off + i] ?? 0);
    off += lengthSize;
    if (len === 0 || off + len > data.length) return null;
    nalus.push(data.subarray(off, off + len));
    off += len;
  }
  return nalus;
}

/** Mengubah paket MP4 (panjang-NAL) menjadi Annex B. Parameter set disisipkan di frame kunci bila belum ada. */
export function toAnnexB(data: Uint8Array, lengthSize: number, parameterSets: readonly Uint8Array[]): Uint8Array {
  const isAnnexB = data[0] === 0 && data[1] === 0 && (data[2] === 1 || (data[2] === 0 && data[3] === 1));
  let nalus: Uint8Array[] | null = null;
  if (!isAnnexB) {
    for (const size of [lengthSize, 4, 2, 1]) {
      nalus = splitLengthPrefixed(data, size);
      if (nalus) break;
    }
  }
  if (!nalus) return data;
  const hasParams = nalus.some((n) => {
    const t = nalType(n);
    return t === 32 || t === 33 || t === 34;
  });
  const all = hasParams || parameterSets.length === 0 ? nalus : [...parameterSets, ...nalus];
  let size = 0;
  for (const n of all) size += START_CODE.length + n.length;
  const out = new Uint8Array(size);
  let off = 0;
  for (const n of all) {
    out.set(START_CODE, off);
    off += START_CODE.length;
    out.set(n, off);
    off += n.length;
  }
  return out;
}
