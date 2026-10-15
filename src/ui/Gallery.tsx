import { useState, type ReactNode } from 'react';
import { Button, IconButton, ToolButton } from './Button';
import { Field, Input, Progress, Segmented, Slider, Swatches, type SwatchOption } from './Controls';
import { Dialog } from './Dialog';
import { MenuButton } from './Menu';
import { TabPanel, Tabs } from './Tabs';
import * as I from './icons';
import '../panels/timeline/timeline.css';
import './gallery.css';

const TOKENS = [
  'canvas', 'surface', 'surface-raised', 'surface-sunken', 'stage', 'border', 'border-strong',
  'ink', 'ink-muted', 'accent', 'accent-hover', 'accent-soft', 'on-accent', 'playhead', 'danger',
  'clip-video', 'clip-audio', 'clip-text', 'clip-effect',
] as const;

const ICONS: [string, (p: I.IconProps) => ReactNode][] = [
  ['kursor', I.IconCursor], ['belah', I.IconSplit], ['potong kiri', I.IconCutLeft], ['potong kanan', I.IconCutRight], ['teks', I.IconText],
  ['crop', I.IconCrop], ['kecepatan', I.IconSpeed], ['volume', I.IconVolume], ['bisu', I.IconVolumeOff],
  ['efek', I.IconEffect], ['hapus', I.IconTrash], ['undo', I.IconUndo], ['redo', I.IconRedo],
  ['unduh', I.IconDownload], ['plus', I.IconPlus], ['minus', I.IconMinus], ['film', I.IconFilm],
  ['musik', I.IconMusic], ['gambar', I.IconImage], ['perisai', I.IconShield], ['mata', I.IconEye],
  ['mata tertutup', I.IconEyeOff], ['lompat awal', I.IconSkipStart], ['lompat akhir', I.IconSkipEnd],
  ['layar penuh', I.IconFullscreen], ['putar', I.IconPlay], ['jeda', I.IconPause], ['tutup', I.IconClose],
  ['panah bawah', I.IconChevronDown], ['panel', I.IconPanel], ['properti', I.IconSliders],
];

const TEXT_STYLES = [
  ['title', 't-title', 'Ekspor video'],
  ['body', 't-body', 'Berkas tidak dikirim ke server.'],
  ['label', 't-label', 'Pilih berkas'],
  ['caption', 't-caption', 'Seret klip ke timeline untuk mulai.'],
  ['timecode', 't-timecode', '00:00:18.12'],
  ['timecode-lg', 't-timecode-lg', '00:01:04.27'],
  ['tick', 't-tick', '00:10'],
] as const;

type ColorId = 'white' | 'ink' | 'accent' | 'danger';
const COLORS: SwatchOption<ColorId>[] = [
  { value: 'white', label: 'Putih', token: '--surface-raised' },
  { value: 'ink', label: 'Gelap', token: '--ink' },
  { value: 'accent', label: 'Aksen', token: '--accent' },
  { value: 'danger', label: 'Merah', token: '--danger' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gallery-section">
      <h2 className="t-title">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="gallery-row">
      {label && <span className="gallery-row-label t-caption">{label}</span>}
      <div className="gallery-row-items">{children}</div>
    </div>
  );
}

export function Gallery() {
  const [tab, setTab] = useState<'video' | 'audio' | 'warna'>('video');
  const [speed, setSpeed] = useState<number>(1);
  const [res, setRes] = useState<string>('1080');
  const [scale, setScale] = useState(100);
  const [bright, setBright] = useState(0);
  const [color, setColor] = useState<ColorId>('white');
  const [dialog, setDialog] = useState(false);
  const [tool, setTool] = useState('select');
  const [chosen, setChosen] = useState('belum ada');

  return (
    <main className="gallery">
      <header className="gallery-header">
        <h1 className="t-title">Klip · komponen</h1>
        <p className="t-caption">Halaman internal. Semua komponen dasar dan keadaannya. Tekan Tab untuk melihat fokus.</p>
      </header>

      <Section title="Token warna">
        <div className="gallery-tokens">
          {TOKENS.map((t) => (
            <div key={t} className="gallery-token">
              <span className="gallery-token-chip" style={{ background: `var(--${t})` }} />
              <code className="t-tick">--{t}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Gaya teks">
        {TEXT_STYLES.map(([name, cls, sample]) => (
          <Row key={name} label={name}>
            <span className={cls}>{sample}</span>
          </Row>
        ))}
      </Section>

      <Section title="Tombol">
        <Row label="bawaan">
          <Button>Batal</Button>
          <Button data-force="hover">Hover</Button>
          <Button data-force="focus">Fokus</Button>
          <Button icon={<I.IconPlus />}>Tambah lajur</Button>
          <Button disabled>Nonaktif</Button>
        </Row>
        <Row label="primary">
          <Button variant="primary" icon={<I.IconDownload />}>Ekspor</Button>
          <Button variant="primary" data-force="hover">Hover</Button>
          <Button variant="primary" disabled>Nonaktif</Button>
        </Row>
        <Row label="ghost">
          <Button variant="ghost">Proyek tanpa judul</Button>
          <Button variant="ghost" data-force="hover">Hover</Button>
          <Button variant="ghost" disabled>Nonaktif</Button>
        </Row>
        <Row label="danger">
          <Button variant="danger">Batalkan</Button>
          <Button variant="danger" data-force="hover">Hover</Button>
        </Row>
      </Section>

      <Section title="Tombol ikon">
        <Row label="32px">
          <IconButton label="Urungkan" shortcut="Ctrl+Z"><I.IconUndo /></IconButton>
          <IconButton label="Ulangi" shortcut="Ctrl+Shift+Z"><I.IconRedo /></IconButton>
          <IconButton label="Hover" data-force="hover"><I.IconFullscreen /></IconButton>
          <IconButton label="Nonaktif" disabled><I.IconRedo /></IconButton>
        </Row>
        <Row label="24px">
          <IconButton size="sm" label="Sembunyikan lajur"><I.IconEye size={16} /></IconButton>
          <IconButton size="sm" label="Bisukan lajur" aria-pressed={true}><I.IconVolumeOff size={16} /></IconButton>
          <IconButton size="sm" label="Tambah lajur"><I.IconPlus size={16} /></IconButton>
        </Row>
      </Section>

      <Section title="Alat">
        <Row>
          <ToolButton icon={<I.IconCursor />} label="Pilih" shortcut="V" pressed={tool === 'select'} onClick={() => setTool('select')} />
          <ToolButton icon={<I.IconCutLeft />} label="Potong kiri" shortcut="Q" className="tool-wide" />
          <ToolButton icon={<I.IconSplit />} label="Belah" shortcut="W" className="tool-wide" />
          <ToolButton icon={<I.IconCutRight />} label="Potong kanan" shortcut="E" className="tool-wide" />
          <ToolButton icon={<I.IconText />} label="Teks" shortcut="T" pressed={tool === 'text'} onClick={() => setTool('text')} />
          <ToolButton icon={<I.IconEffect />} label="Hover" pressed={false} data-force="hover" />
          <ToolButton icon={<I.IconTrash />} label="Hapus" shortcut="Delete" danger />
          <ToolButton icon={<I.IconTrash />} label="Hapus" danger disabled />
        </Row>
      </Section>

      <Section title="Tab">
        <div className="gallery-panel">
          <Tabs
            idPrefix="g"
            label="Properti klip"
            items={[{ id: 'video', label: 'Video' }, { id: 'audio', label: 'Audio' }, { id: 'warna', label: 'Warna' }]}
            value={tab}
            onChange={setTab}
          />
          <TabPanel idPrefix="g" id={tab} className="gallery-panel-body">
            <p className="t-caption">Isi tab {tab}.</p>
          </TabPanel>
        </div>
      </Section>

      <Section title="Segmen">
        <Row label="kecepatan">
          <Segmented
            label="Kecepatan"
            mono
            value={speed}
            onChange={setSpeed}
            options={[{ value: 0.5, label: '0,5×' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }]}
          />
        </Row>
        <Row label="resolusi">
          <Segmented
            label="Resolusi"
            mono
            value={res}
            onChange={setRes}
            options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '2160', label: '4K', disabled: true }]}
          />
        </Row>
      </Section>

      <Section title="Input dan field">
        <div className="gallery-panel gallery-panel-body gallery-fields">
          <Field label="Nama berkas">{({ controlId }) => <Input id={controlId} defaultValue="klip-saya" />}</Field>
          <Field label="Durasi">{({ controlId }) => <Input id={controlId} mono defaultValue="00:00:05.00" />}</Field>
          <Field label="Nonaktif">{({ controlId }) => <Input id={controlId} disabled defaultValue="Tidak bisa diubah" />}</Field>
          <Field label="Skala" value={`${scale}%`}>
            {({ controlId }) => (
              <Slider id={controlId} min={10} max={400} value={scale} onChange={setScale} valueText={`${scale}%`} />
            )}
          </Field>
          <Field label="Kecerahan" value={`${bright > 0 ? '+' : ''}${bright}`}>
            {({ controlId }) => (
              <Slider id={controlId} min={-100} max={100} origin={0} value={bright} onChange={setBright} />
            )}
          </Field>
          <Field label="Nonaktif" value="50%">
            {({ controlId }) => <Slider id={controlId} min={0} max={100} value={50} onChange={() => {}} disabled />}
          </Field>
          <Field label="Warna">
            {() => <Swatches label="Warna teks" options={COLORS} value={color} onChange={setColor} />}
          </Field>
        </div>
      </Section>

      <Section title="Progress">
        <div className="gallery-progress">
          <Progress label="Contoh 0%" value={0} />
          <Progress label="Contoh 40%" value={0.4} />
          <Progress label="Contoh 100%" value={1} />
        </div>
      </Section>

      <Section title="Badge, menu, dialog, tooltip">
        <Row>
          <span className="badge">
            <I.IconShield size={14} />
            Diproses di perangkatmu
          </span>
          <MenuButton
            label="Tambah lajur"
            items={[
              { id: 'video', label: 'Lajur video', icon: <I.IconFilm size={16} /> },
              { id: 'audio', label: 'Lajur audio', icon: <I.IconMusic size={16} /> },
              { id: 'text', label: 'Lajur teks', icon: <I.IconText size={16} /> },
              { id: 'effect', label: 'Lajur efek', icon: <I.IconEffect size={16} /> },
            ]}
            onSelect={(id) => setChosen(id)}
            renderTrigger={(p) => (
              <Button {...p} icon={<I.IconPlus />}>
                Tambah lajur
              </Button>
            )}
          />
          <span className="t-caption">Dipilih: {chosen}</span>
          <Button onClick={() => setDialog(true)}>Buka dialog</Button>
        </Row>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="Ekspor video"
          description="Contoh dialog. Esc menutup, fokus tetap di dalam."
          footer={
            <>
              <Button onClick={() => setDialog(false)}>Batal</Button>
              <Button variant="primary" onClick={() => setDialog(false)}>
                Ekspor
              </Button>
            </>
          }
        >
          <Field label="Nama">{({ controlId }) => <Input id={controlId} defaultValue="klip-saya" />}</Field>
          <Progress label="Progres ekspor" value={0.62} />
          <p className="t-caption">Jangan tutup tab ini sampai selesai.</p>
        </Dialog>
      </Section>

      <Section title="Klip timeline">
        <div className="gallery-lane">
          {(
            [
              ['clip-video', <I.IconFilm size={14} />, 'pantai.mp4', false],
              ['clip-audio', <I.IconMusic size={14} />, 'musik-latar.mp3', false],
              ['clip-text', <I.IconText size={14} />, 'Halo dunia', false],
              ['clip-effect', <I.IconEffect size={14} />, 'Hitam putih', false],
              ['clip-video', <I.IconImage size={14} />, 'Terpilih', true],
            ] as const
          ).map(([cls, icon, name, sel], i) => (
            <div key={i} className={`clip ${cls}`} aria-pressed={sel} style={{ left: 8 + i * 150, width: 138, top: 4 }}>
              <span className="clip-handle clip-handle-start" />
              {icon}
              <span className="clip-name">{name}</span>
              <span className="clip-handle clip-handle-end" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Ikon">
        <div className="gallery-icons">
          {ICONS.map(([name, Icon]) => (
            <div key={name} className="gallery-icon">
              <Icon />
              <span className="t-caption">{name}</span>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
