import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useUi } from '../app/uiState';
import { downloadBlob, startExport, type ExportJob } from '../export/exporter';
import { CODECS, type ExportFormat, type ExportQuality, type ExportResolution } from '../export/protocol';
import { detectSupport, hasWebCodecs, outputSize, type FormatSupport } from '../export/support';
import { editor, useEditor } from '../state/store';
import { projectDuration } from '../timeline/model';
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
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function formatRemaining(seconds: number): string {
  if (seconds < 5) return 'Hampir selesai.';
  if (seconds < 60) return `Sisa sekitar ${Math.ceil(seconds / 5) * 5} detik.`;
  const m = Math.round(seconds / 60);
  return `Sisa sekitar ${m} menit.`;
}

export function ExportDialog() {
  const open = useUi((s) => s.exportOpen);
  const close = useUi((s) => s.closeExport);
  const projectName = useEditor((s) => s.project.name);
  const aspect = useEditor((s) => s.project.aspect);
  const duration = useEditor((s) => projectDuration(s.project));

  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [support, setSupport] = useState<FormatSupport[]>([]);
  const [name, setName] = useState(projectName);
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [resolution, setResolution] = useState<ExportResolution>(1080);
  const [quality, setQuality] = useState<ExportQuality>('medium');
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
    void detectSupport(aspect).then((result) => {
      if (!alive) return;
      setSupport(result);
      if (result.length === 0) {
        setPhase({ kind: 'unsupported' });
        return;
      }
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
  const size = outputSize(aspect, resolution);

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
      { format, width: size.width, height: size.height, fps: FPS, quality },
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
              <span className="t-timecode export-ext">.{format}</span>
            </div>
          </div>
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
