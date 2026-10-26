import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useUi } from '../app/uiState';
import { bytesFor, estimateBytes, projectHasAudio } from '../export/estimate';
import { SOCIAL_PRESETS, letterbox, presetById, type DestinationId } from '../export/presets';
import { downloadBlob, startExport, type ExportJob } from '../export/exporter';
import { CODECS, type ExportFormat, type ExportQuality, type ExportResolution } from '../export/protocol';
import { detectPresetSupport, detectSupport, hasWebCodecs, outputSize, type FormatSupport } from '../export/support';
import { editor, useEditor } from '../state/store';
import { projectDuration, type Aspect } from '../timeline/model';
import { FPS, formatTimecode } from '../timeline/time';
import { Button } from '../ui/Button';
import { Field, Input, Progress, Segmented } from '../ui/Controls';
import { Dialog } from '../ui/Dialog';
import './export.css';

type Phase =
  | { kind: 'checking' }
  | { kind: 'unsupported' }
  | { kind: 'settings' }
  | { kind: 'running'; done: number; total: number; startedAt: number }
  | { kind: 'done'; url: string; filename: string; size: number }
  | { kind: 'error'; message: string };

const RES_LABEL: Record<ExportResolution, string> = { 720: '720p', 1080: '1080p', 2160: '4K' };
const QUALITY_OPTIONS = [
  { value: 'low', label: 'Rendah' },
  { value: 'medium', label: 'Sedang' },
  { value: 'high', label: 'Tinggi' },
] as const satisfies readonly { value: ExportQuality; label: string }[];

function safeName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'klip';
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
  if (mb >= 100) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

function formatRemaining(seconds: number): string {
  if (seconds < 5) return 'Hampir selesai.';
  if (seconds < 60) return `Sisa sekitar ${Math.ceil(seconds / 5) * 5} detik.`;
  const m = Math.round(seconds / 60);
  return `Sisa sekitar ${m} menit.`;
}

function formatMbps(bps: number): string {
  return `${(bps / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} Mbps`;
}

const DESTINATIONS: readonly { id: DestinationId; label: string; detail: string }[] = [
  { id: 'custom', label: 'Umum', detail: 'Atur format, resolusi, kualitas' },
  ...SOCIAL_PRESETS.map((p) => ({ id: p.id, label: p.label, detail: `${p.width}×${p.height} · ${p.aspect}` })),
];

/** Kartu pilihan tujuan ekspor (role="radiogroup"), panah untuk berpindah. */
function DestinationPicker({
  value,
  onChange,
  available,
}: {
  value: DestinationId;
  onChange: (id: DestinationId) => void;
  available: ReadonlySet<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = DESTINATIONS.filter((d) => d.id === 'custom' || available.has(d.id));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = enabled.findIndex((d) => d.id === value);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % enabled.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + enabled.length) % enabled.length;
    if (next === null) return;
    e.preventDefault();
    const d = enabled[next];
    if (!d) return;
    onChange(d.id);
    ref.current?.querySelector<HTMLElement>(`[data-dest="${d.id}"]`)?.focus();
  };
  return (
    <div ref={ref} className="export-dest" role="radiogroup" aria-label="Tujuan" onKeyDown={onKeyDown}>
      {DESTINATIONS.map((d) => {
        const ok = d.id === 'custom' || available.has(d.id);
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            data-dest={d.id}
            aria-checked={d.id === value}
            disabled={!ok}
            tabIndex={d.id === value ? 0 : -1}
            className="export-dest-item"
            onClick={() => onChange(d.id)}
          >
            <span className="t-label">{d.label}</span>
            <span className="t-caption">{ok ? d.detail : 'Butuh MP4, belum didukung browser ini'}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ExportDialog() {
  const open = useUi((s) => s.exportOpen);
  const close = useUi((s) => s.closeExport);
  const projectName = useEditor((s) => s.project.name);
  const aspect = useEditor((s) => s.project.aspect);
  const duration = useEditor((s) => projectDuration(s.project));
  const withAudio = useEditor((s) => projectHasAudio(s.project));

  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [support, setSupport] = useState<FormatSupport[]>([]);
  const [name, setName] = useState(projectName);
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [resolution, setResolution] = useState<ExportResolution>(1080);
  const [quality, setQuality] = useState<ExportQuality>('medium');
  const [destination, setDestination] = useState<DestinationId>('custom');
  const [presetOk, setPresetOk] = useState<ReadonlySet<string>>(new Set());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [now, setNow] = useState(() => performance.now());
  const job = useRef<ExportJob | null>(null);
  const nameId = useId();

  // Saat dialog dibuka: periksa dukungan encoder untuk rasio proyek saat ini.
  useEffect(() => {
    if (!open) return;
    setName(safeName(editor.get().project.name));
    setWarnings([]);
    if (!hasWebCodecs()) {
      setPhase({ kind: 'unsupported' });
      return;
    }
    setPhase({ kind: 'checking' });
    let alive = true;
    void Promise.all([detectSupport(aspect), detectPresetSupport(SOCIAL_PRESETS)]).then(([result, presets]) => {
      if (!alive) return;
      setSupport(result);
      setPresetOk(presets);
      if (result.length === 0) {
        setPhase({ kind: 'unsupported' });
        return;
      }
      setDestination((d) => (d === 'custom' || presets.has(d) ? d : 'custom'));
      const fmt = result.find((r) => r.format === format) ?? result[0];
      if (fmt) {
        setFormat(fmt.format);
        if (!fmt.resolutions.includes(resolution)) setResolution(fmt.resolutions.includes(1080) ? 1080 : (fmt.resolutions[0] ?? 720));
      }
      setPhase({ kind: 'settings' });
    });
    return () => {
      alive = false;
    };
    // Hanya saat dibuka atau rasio berubah; pilihan pengguna dipertahankan antar pembukaan.
  }, [open, aspect]);

  // Peringatan sebelum menutup tab selama ekspor berjalan.
  const running = phase.kind === 'running';
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const timer = window.setInterval(() => setNow(performance.now()), 500);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.clearInterval(timer);
    };
  }, [running]);

  // Bersihkan object URL hasil saat dialog ditutup.
  useEffect(() => {
    if (open || phase.kind !== 'done') return;
    URL.revokeObjectURL(phase.url);
    setPhase({ kind: 'settings' });
  }, [open, phase]);

  const current = support.find((s) => s.format === format);
  const preset = presetById(destination);
  const size = preset ? { width: preset.width, height: preset.height } : outputSize(aspect, resolution);
  const outFormat: ExportFormat = preset ? 'mp4' : format;
  const seconds = duration / FPS;
  const estimate = preset
    ? bytesFor(preset.videoBitrate + (withAudio ? preset.audioBitrate : 0), seconds)
    : estimateBytes({ format, ...size, quality, seconds, withAudio });

  const changeAspect = (next: Aspect) => {
    const s = editor.get();
    s.apply((p) => ({ ...p, aspect: next }));
    s.announce(`Rasio proyek diubah ke ${next}. Periksa pratinjau sebelum mengekspor.`);
  };

  const begin = () => {
    const s = editor.get();
    if (s.playing) s.setPlaying(false);
    setWarnings([]);
    const startedAt = performance.now();
    setNow(startedAt);
    setPhase({ kind: 'running', done: 0, total: projectDuration(s.project), startedAt });
    s.announce('Ekspor dimulai.');
    job.current = startExport(
      s.project,
      s.media,
      preset
        ? {
            format: 'mp4',
            width: preset.width,
            height: preset.height,
            fps: FPS,
            quality: 'high',
            videoBitrate: preset.videoBitrate,
            audioBitrate: preset.audioBitrate,
            inner: letterbox(s.project.aspect, preset.width, preset.height) ?? undefined,
          }
        : { format, width: size.width, height: size.height, fps: FPS, quality },
      {
        onProgress: (done, total) => setPhase((p) => (p.kind === 'running' ? { ...p, done, total } : p)),
        onWarning: (message) => setWarnings((w) => [...w, message]),
        onDone: (blob, extension) => {
          job.current = null;
          const file = `${safeName(name)}.${extension}`;
          const url = URL.createObjectURL(blob);
          setPhase({ kind: 'done', url, filename: file, size: blob.size });
          downloadBlob(url, file);
          editor.get().announce(`Ekspor selesai. ${file} diunduh.`);
        },
        onError: (message) => {
          job.current = null;
          setPhase({ kind: 'error', message });
          editor.get().announce(`Ekspor gagal: ${message}`);
        },
      },
    );
  };

  const cancel = () => {
    job.current?.cancel();
    job.current = null;
    setPhase({ kind: 'settings' });
    editor.get().announce('Ekspor dibatalkan.');
  };

  const onClose = () => {
    if (phase.kind === 'running') return;
    close();
  };

  let body: ReactNode = null;
  let footer: ReactNode = null;
  let description: ReactNode = undefined;

  switch (phase.kind) {
    case 'checking':
      body = <p className="t-caption">Memeriksa kemampuan browser…</p>;
      footer = <Button onClick={onClose}>Batal</Button>;
      break;
    case 'unsupported':
      body = <p className="t-body">Browser ini belum mendukung ekspor. Pakai Chrome atau Edge terbaru.</p>;
      footer = (
        <Button variant="primary" onClick={onClose}>
          Tutup
        </Button>
      );
      break;
    case 'settings':
      if (duration === 0) {
        body = <p className="t-body">Timeline masih kosong. Tambahkan klip dulu.</p>;
        footer = (
          <Button variant="primary" onClick={onClose}>
            Tutup
          </Button>
        );
        break;
      }
      description = 'Video dibuat di perangkatmu. Berkas tidak dikirim ke server.';
      body = (
        <div className="export-fields">
          <div className="export-name">
            <label className="field-label" htmlFor={nameId}>
              Nama berkas
            </label>
            <div className="export-name-row">
              <Input id={nameId} value={name} maxLength={80} onChange={(e) => setName(e.currentTarget.value)} />
              <span className="t-timecode export-ext">.{outFormat}</span>
            </div>
          </div>
          <div className="export-name">
            <span className="field-label">Tujuan</span>
            <DestinationPicker value={destination} onChange={setDestination} available={presetOk} />
          </div>
          {preset ? (
            <div className="export-preset">
              <p className="t-tick">
                MP4 (H.264 + AAC) · {preset.width}×{preset.height} · {FPS} fps · {formatMbps(preset.videoBitrate)} ·{' '}
                {formatTimecode(duration)}
              </p>
              <p className="t-caption">{preset.note}</p>
              {aspect !== preset.aspect && (
                <div className="export-notice" role="note">
                  <p className="t-body">
                    Proyekmu berasio {aspect}, sedangkan {preset.label} memakai {preset.aspect}. Tanpa diubah, videomu
                    ditaruh utuh di tengah dengan latar hitam.
                  </p>
                  <Button onClick={() => changeAspect(preset.aspect)}>Ubah rasio proyek ke {preset.aspect}</Button>
                </div>
              )}
              {preset.maxSeconds !== undefined && seconds > preset.maxSeconds && (
                <p className="t-caption">
                  Durasi {formatTimecode(duration)} lebih dari {preset.maxSeconds} detik. {preset.label} biasanya
                  dibatasi {preset.maxSeconds} detik per bagian; potong jadi beberapa klip bila perlu.
                </p>
              )}
            </div>
          ) : (
          <>
          <Field label="Format">
            {() => (
              <Segmented
                label="Format"
                options={(['mp4', 'webm'] as const).map((f) => ({
                  value: f,
                  label: CODECS[f].label,
                  disabled: !support.some((s) => s.format === f),
                }))}
                value={format}
                onChange={(f) => {
                  setFormat(f);
                  const res = support.find((s) => s.format === f)?.resolutions ?? [];
                  if (!res.includes(resolution) && res[0]) setResolution(res.includes(1080) ? 1080 : res[0]);
                }}
              />
            )}
          </Field>
          <Field label="Resolusi">
            {() => (
              <Segmented
                label="Resolusi"
                mono
                options={([720, 1080, 2160] as const).map((r) => ({
                  value: r,
                  label: RES_LABEL[r],
                  disabled: !current?.resolutions.includes(r),
                }))}
                value={resolution}
                onChange={setResolution}
              />
            )}
          </Field>
          <Field label="Kualitas">
            {() => <Segmented label="Kualitas" options={QUALITY_OPTIONS} value={quality} onChange={setQuality} />}
          </Field>
          <p className="t-caption export-summary">
            <span className="t-tick">
              {size.width}×{size.height} · {FPS} fps · {formatTimecode(duration)}
            </span>
            {!current?.resolutions.includes(2160) && <> · 4K tidak didukung browser ini.</>}
            {!support.some((s) => s.format === 'mp4') && <> · MP4 tidak didukung, pakai WebM.</>}
          </p>
          </>
          )}
          <div className="export-estimate">
            <p className="t-body">
              Perkiraan ukuran <span className="t-timecode">±{formatSize(estimate)}</span>
            </p>
            <p className="t-caption">Rekaman layar dan video yang banyak diam biasanya jauh lebih kecil.</p>
          </div>
        </div>
      );
      footer = (
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={begin}>
            Ekspor
          </Button>
        </>
      );
      break;
    case 'running': {
      const fraction = phase.total > 0 ? phase.done / phase.total : 0;
      const elapsed = (now - phase.startedAt) / 1000;
      const rate = elapsed > 0 ? phase.done / elapsed : 0;
      const remaining = rate > 0 && phase.done > FPS && elapsed > 1.5 ? (phase.total - phase.done) / rate : null;
      const pct = Math.round(fraction * 100);
      body = (
        <div className="export-progress">
          <Progress label="Progres ekspor" value={fraction} valueText={`${pct}%`} />
          <div className="export-progress-row">
            <span className="t-timecode">{pct}%</span>
            <span className="t-caption">{remaining === null ? 'Menghitung sisa waktu…' : formatRemaining(remaining)}</span>
          </div>
          <p className="t-body">Jangan tutup tab ini sampai selesai.</p>
        </div>
      );
      footer = (
        <Button variant="danger" onClick={cancel}>
          Batalkan
        </Button>
      );
      break;
    }
    case 'done':
      body = (
        <div className="export-progress">
          <Progress label="Progres ekspor" value={1} valueText="Selesai" />
          <p className="t-body">
            {phase.filename} selesai dibuat ({formatSize(phase.size)}) dan sudah diunduh.
          </p>
          {warnings.map((w) => (
            <p key={w} className="t-caption">
              {w}
            </p>
          ))}
        </div>
      );
      footer = (
        <>
          <a className="btn" href={phase.url} download={phase.filename}>
            Unduh lagi
          </a>
          <Button variant="primary" onClick={onClose}>
            Selesai
          </Button>
        </>
      );
      break;
    case 'error':
      body = (
        <p className="t-body export-error" role="alert">
          Ekspor gagal. {phase.message}
        </p>
      );
      footer = (
        <>
          <Button onClick={onClose}>Tutup</Button>
          <Button variant="primary" onClick={() => setPhase({ kind: 'settings' })}>
            Coba lagi
          </Button>
        </>
      );
      break;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={phase.kind === 'running' ? 'Mengekspor video' : 'Ekspor video'}
      description={description}
      footer={footer}
      dismissible={phase.kind !== 'running'}
    >
      {body}
    </Dialog>
  );
}
