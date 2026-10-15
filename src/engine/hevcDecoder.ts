import { CustomVideoDecoder, VideoSample, registerDecoder, type EncodedPacket, type InputVideoTrack } from 'mediabunny';
import { parseHvcCLenient, toAnnexB } from './hevcBitstream';

/*
 * Banyak kamera CCTV/DVR menulis MP4 HEVC (H.265) dengan kotak `hvcC` yang rusak, misalnya
 * jumlah array parameter yang tercatat lebih banyak dari isinya. Browser lalu menolak konfigurasi
 * WebCodecs walau dekoder HEVC (hardware) tersedia dan elemen <video> bisa memutarnya.
 *
 * Modul ini mendaftarkan dekoder kustom ke mediabunny yang hanya dipakai bila konfigurasi asli
 * ditolak, dengan dua strategi:
 * 1. `repaired`: kotak hvcC diperbaiki (array yang terpotong dibuang, jumlahnya disesuaikan).
 * 2. `annexb`: tanpa hvcC; tiap paket diubah dari format panjang-NAL (MP4) ke Annex B (start code),
 *    dan parameter set (VPS/SPS/PPS) disisipkan di frame kunci bila belum ada di dalam stream.
 */

type Mode =
  | { kind: 'repaired'; description: Uint8Array }
  | { kind: 'annexb'; lengthSize: number; parameterSets: Uint8Array[] };

const modes = new Map<string, Mode>();

function toBytes(src: AllowSharedBufferSource | undefined): Uint8Array | null {
  if (!src) return null;
  if (src instanceof Uint8Array) return src;
  if (ArrayBuffer.isView(src)) return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  return new Uint8Array(src);
}

/** Kunci konfigurasi: codec, ukuran, dan sidik jari isi description. */
function configKey(config: VideoDecoderConfig): string {
  const desc = toBytes(config.description);
  let hash = 2166136261;
  if (desc) {
    for (let i = 0; i < desc.length; i++) hash = Math.imul(hash ^ (desc[i] ?? 0), 16777619) >>> 0;
  }
  return `${config.codec}|${config.codedWidth ?? 0}x${config.codedHeight ?? 0}|${desc?.length ?? 0}|${hash}`;
}

function completeColorSpace(cs: VideoColorSpaceInit | undefined): VideoColorSpaceInit {
  return {
    primaries: cs?.primaries ?? 'bt709',
    matrix: cs?.matrix ?? 'bt709',
    transfer: cs?.transfer ?? 'bt709',
    fullRange: cs?.fullRange ?? false,
  };
}

async function supported(config: VideoDecoderConfig): Promise<boolean> {
  try {
    return (await VideoDecoder.isConfigSupported(config)).supported === true;
  } catch {
    return false;
  }
}

class LenientHevcDecoder extends CustomVideoDecoder {
  private decoder: VideoDecoder | null = null;
  private mode: Mode | null = null;
  /** Timestamp masukan (mikrodetik) terurut, dipasangkan ke frame keluaran sesuai urutan tampil. */
  private timestamps: number[] = [];

  static override supports(codec: string, config: VideoDecoderConfig): boolean {
    return codec === 'hevc' && modes.has(configKey(config));
  }

  init(): void {
    const mode = modes.get(configKey(this.config));
    if (!mode) throw new Error('Konfigurasi HEVC belum disiapkan.');
    this.mode = mode;
    this.decoder = new VideoDecoder({
      output: (frame) => {
        const sample = new VideoSample(frame);
        const ts = this.timestamps.shift();
        if (ts !== undefined) sample.setTimestamp(ts / 1e6);
        this.onSample(sample);
      },
      error: (e) => this.onError(e),
    });
    const base: VideoDecoderConfig = {
      codec: this.config.codec,
      codedWidth: this.config.codedWidth,
      codedHeight: this.config.codedHeight,
      colorSpace: completeColorSpace(this.config.colorSpace),
    };
    this.decoder.configure(mode.kind === 'repaired' ? { ...base, description: mode.description } : base);
  }

  async decode(packet: EncodedPacket): Promise<void> {
    const decoder = this.decoder;
    const mode = this.mode;
    if (!decoder || !mode || decoder.state !== 'configured') return;
    const data =
      mode.kind === 'annexb'
        ? toAnnexB(packet.data, mode.lengthSize, packet.type === 'key' ? mode.parameterSets : [])
        : packet.data;
    const ts = packet.microsecondTimestamp;
    let i = this.timestamps.length;
    while (i > 0 && (this.timestamps[i - 1] ?? 0) > ts) i--;
    this.timestamps.splice(i, 0, ts);
    decoder.decode(
      new EncodedVideoChunk({ type: packet.type, timestamp: ts, duration: packet.microsecondDuration, data }),
    );
    // Tahan pemanggil bila antrean dekoder penuh, agar frame tidak menumpuk di memori GPU.
    while (decoder.decodeQueueSize > 6 && decoder.state === 'configured') {
      await new Promise<void>((resolve) => decoder.addEventListener('dequeue', () => resolve(), { once: true }));
    }
  }

  async flush(): Promise<void> {
    if (this.decoder?.state === 'configured') await this.decoder.flush();
  }

  close(): void {
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.decoder = null;
    this.timestamps = [];
  }
}

registerDecoder(LenientHevcDecoder);

/**
 * Memastikan trek video bisa didekode, menyiapkan jalur HEVC toleran bila perlu.
 * Harus dipanggil sebelum `canDecode()` atau membuat sink untuk trek ini.
 */
export async function prepareVideoTrack(track: InputVideoTrack): Promise<boolean> {
  if (typeof VideoDecoder === 'undefined') return false;
  const codec = await track.getCodec();
  const config = await track.getDecoderConfig();
  if (codec !== 'hevc' || !config) return track.canDecode();

  const key = configKey(config);
  if (modes.has(key)) return true;
  if (await supported(config)) return true;

  const base: VideoDecoderConfig = {
    codec: config.codec,
    codedWidth: config.codedWidth,
    codedHeight: config.codedHeight,
    colorSpace: completeColorSpace(config.colorSpace),
  };
  const desc = toBytes(config.description);
  const parsed = desc ? parseHvcCLenient(desc) : null;

  if (parsed && parsed.arrays.length > 0 && (await supported({ ...base, description: parsed.repaired }))) {
    modes.set(key, { kind: 'repaired', description: parsed.repaired });
    return true;
  }
  if (await supported(base)) {
    modes.set(key, {
      kind: 'annexb',
      lengthSize: parsed?.lengthSize ?? 4,
      parameterSets: parsed ? parsed.arrays.flatMap((a) => a.nalus) : [],
    });
    return true;
  }
  return false;
}


/** True bila trek ini didekode lewat jalur HEVC toleran (bukan konfigurasi aslinya). */
export async function usesLenientDecoder(track: InputVideoTrack): Promise<boolean> {
  const config = await track.getDecoderConfig();
  return config !== null && modes.has(configKey(config));
}
