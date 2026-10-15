import type { ReactNode } from 'react';
import { EFFECTS } from '../engine/effects';
import { TEXT_COLOR_LABEL, TEXT_COLOR_TOKEN } from '../engine/tokens';
import { applyEffectToClip, changeSpeed, patchClip, resetClip } from '../state/actions';
import { useEditor, type RightTab } from '../state/store';
import {
  CLIP_TYPE_LABEL,
  SPEEDS,
  clipLabel,
  frameSize,
  isVisual,
  type Clip,
  type ColorAdjust,
  type EffectClip,
  type Speed,
  type TextClip,
  type TextColorId,
  type Transform,
} from '../timeline/model';
import { formatTimecode } from '../timeline/time';
import { Button } from '../ui/Button';
import { Field, Segmented, Slider, Swatches, type SwatchOption } from '../ui/Controls';
import { TabPanel, Tabs } from '../ui/Tabs';
import { ClipIcon } from './timeline/ClipView';
import './inspector.css';

const TABS = [
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'color', label: 'Warna' },
] as const satisfies readonly { id: RightTab; label: string }[];

const SPEED_OPTIONS = SPEEDS.map((v) => ({ value: v, label: `${String(v).replace('.', ',')}×` }));

const TEXT_COLORS: SwatchOption<TextColorId>[] = (Object.keys(TEXT_COLOR_TOKEN) as TextColorId[]).map((id) => ({
  value: id,
  label: TEXT_COLOR_LABEL[id],
  token: TEXT_COLOR_TOKEN[id],
}));

/** Tanda minus tipografis agar angka negatif mudah dibaca di font mono. */
function signed(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="insp-section" aria-label={title}>
      <h3 className="insp-section-title">{title}</h3>
      {children}
    </section>
  );
}

function Help({ children }: { children: ReactNode }) {
  return <p className="insp-help t-caption">{children}</p>;
}

function ResetRow({ onReset, label }: { onReset: () => void; label: string }) {
  return (
    <div className="insp-reset">
      <Button onClick={onReset} aria-label={label}>
        Setel ulang
      </Button>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  origin?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

function SliderField({ label, value, min, max, step = 1, origin, format, onChange }: NumberFieldProps) {
  return (
    <Field label={label} value={format(value)}>
      {({ controlId }) => (
        <Slider
          id={controlId}
          min={min}
          max={max}
          step={step}
          origin={origin}
          value={value}
          onChange={onChange}
          valueText={format(value)}
        />
      )}
    </Field>
  );
}

/* ---------- Video ---------- */

function TransformFields({ clip, showScale = true }: { clip: Clip & { transform: Transform }; showScale?: boolean }) {
  const aspect = useEditor((s) => s.project.aspect);
  const { width, height } = frameSize(aspect);
  const t = clip.transform;
  const set = (key: keyof Transform, value: number) =>
    patchClip(clip.id, key, (c) => ('transform' in c ? { ...c, transform: { ...c.transform, [key]: value } } : c));
  return (
    <>
      {showScale && (
        <SliderField
          label="Skala"
          value={Math.round(t.scale * 100)}
          min={10}
          max={400}
          format={(v) => `${v}%`}
          onChange={(v) => set('scale', v / 100)}
        />
      )}
      <SliderField label="Posisi X" value={Math.round(t.x)} min={-width} max={width} origin={0} format={signed} onChange={(v) => set('x', v)} />
      <SliderField label="Posisi Y" value={Math.round(t.y)} min={-height} max={height} origin={0} format={signed} onChange={(v) => set('y', v)} />
      <SliderField
        label="Rotasi"
        value={Math.round(t.rotation)}
        min={-180}
        max={180}
        origin={0}
        format={(v) => `${signed(v)}°`}
        onChange={(v) => set('rotation', v)}
      />
      <SliderField
        label="Opasitas"
        value={Math.round(t.opacity * 100)}
        min={0}
        max={100}
        format={(v) => `${v}%`}
        onChange={(v) => set('opacity', v / 100)}
      />
    </>
  );
}

function SpeedField({ clip }: { clip: Clip & { speed: Speed } }) {
  return (
    <Field label="Kecepatan">
      {() => <Segmented label="Kecepatan" mono options={SPEED_OPTIONS} value={clip.speed} onChange={(v) => changeSpeed(clip.id, v)} />}
    </Field>
  );
}

function TextFields({ clip }: { clip: TextClip }) {
  return (
    <>
      <div className="insp-textarea">
        <label htmlFor={`text-${clip.id}`} className="field-label">
          Isi
        </label>
        <textarea
          id={`text-${clip.id}`}
          className="textarea"
          value={clip.text}
          rows={3}
          onChange={(e) => {
            const text = e.currentTarget.value;
            patchClip(clip.id, 'text', (c) => (c.type === 'text' ? { ...c, text } : c));
          }}
        />
      </div>
      <SliderField
        label="Ukuran"
        value={clip.fontSize}
        min={12}
        max={320}
        format={(v) => `${v}`}
        onChange={(v) => patchClip(clip.id, 'fontSize', (c) => (c.type === 'text' ? { ...c, fontSize: v } : c))}
      />
      <Field label="Warna">
        {() => (
          <Swatches
            label="Warna teks"
            options={TEXT_COLORS}
            value={clip.textColor}
            onChange={(v) => patchClip(clip.id, 'textColor', (c) => (c.type === 'text' ? { ...c, textColor: v } : c))}
          />
        )}
      </Field>
    </>
  );
}

function EffectFields({ clip }: { clip: EffectClip }) {
  return (
    <>
      <div className="insp-effects" role="radiogroup" aria-label="Jenis efek">
        {EFFECTS.map((fx) => (
          <button
            key={fx.id}
            type="button"
            role="radio"
            aria-checked={clip.effect === fx.id}
            className="segment insp-effect"
            onClick={() => applyEffectToClip(clip.id, fx.id)}
          >
            {fx.label}
          </button>
        ))}
      </div>
      <SliderField
        label="Opasitas"
        value={Math.round(clip.opacity * 100)}
        min={0}
        max={100}
        format={(v) => `${v}%`}
        onChange={(v) => patchClip(clip.id, 'opacity', (c) => (c.type === 'effect' ? { ...c, opacity: v / 100 } : c))}
      />
    </>
  );
}

function VideoTab({ clip }: { clip: Clip }) {
  switch (clip.type) {
    case 'video':
    case 'image':
      return (
        <>
          <Section title="Transformasi">
            <TransformFields clip={clip} />
          </Section>
          {clip.type === 'video' && (
            <Section title="Waktu">
              <SpeedField clip={clip} />
            </Section>
          )}
          <ResetRow label="Setel ulang transformasi, kecepatan, dan crop" onReset={() => resetClip(clip.id, 'video')} />
        </>
      );
    case 'text':
      return (
        <>
          <Section title="Teks">
            <TextFields clip={clip} />
          </Section>
          <Section title="Transformasi">
            <TransformFields clip={clip} />
          </Section>
          <ResetRow label="Setel ulang transformasi teks" onReset={() => resetClip(clip.id, 'video')} />
        </>
      );
    case 'effect':
      return (
        <>
          <Section title="Efek">
            <EffectFields clip={clip} />
          </Section>
          <ResetRow label="Setel ulang opasitas efek" onReset={() => resetClip(clip.id, 'video')} />
        </>
      );
    case 'audio':
      return <Help>Klip audio tidak punya properti video. Buka tab Audio.</Help>;
  }
}

/* ---------- Audio ---------- */

function AudioTab({ clip }: { clip: Clip }) {
  if (clip.type === 'video' && !clip.hasAudio) return <Help>Video ini tidak punya suara.</Help>;
  if (clip.type !== 'video' && clip.type !== 'audio') return <Help>Klip ini tidak punya audio.</Help>;
  return (
    <>
      <Section title="Suara">
        <SliderField
          label="Volume"
          value={Math.round(clip.volume * 100)}
          min={0}
          max={200}
          format={(v) => `${v}%`}
          onChange={(v) =>
            patchClip(clip.id, 'volume', (c) => (c.type === 'video' || c.type === 'audio' ? { ...c, volume: v / 100 } : c))
          }
        />
        {clip.type === 'audio' && <SpeedField clip={clip} />}
      </Section>
      <ResetRow label="Setel ulang volume" onReset={() => resetClip(clip.id, 'audio')} />
    </>
  );
}

/* ---------- Warna ---------- */

function ColorTab({ clip }: { clip: Clip }) {
  if (!isVisual(clip)) return <Help>Klip ini tidak punya pengaturan warna.</Help>;
  const a = clip.adjust;
  const set = (key: keyof ColorAdjust, value: number) =>
    patchClip(clip.id, key, (c) => ('adjust' in c ? { ...c, adjust: { ...c.adjust, [key]: value } } : c));
  return (
    <>
      <Section title="Penyesuaian">
        <SliderField label="Kecerahan" value={a.brightness} min={-100} max={100} origin={0} format={signed} onChange={(v) => set('brightness', v)} />
        <SliderField label="Kontras" value={a.contrast} min={-100} max={100} origin={0} format={signed} onChange={(v) => set('contrast', v)} />
        <SliderField label="Saturasi" value={a.saturation} min={-100} max={100} origin={0} format={signed} onChange={(v) => set('saturation', v)} />
      </Section>
      <ResetRow label="Setel ulang warna" onReset={() => resetClip(clip.id, 'color')} />
    </>
  );
}

/* ---------- Panel ---------- */

function ClipHeader({ clip }: { clip: Clip }) {
  return (
    <div className="insp-header">
      <span className={`insp-chip clip-${clip.type === 'image' ? 'video' : clip.type}`} aria-hidden="true">
        <ClipIcon type={clip.type} size={16} />
      </span>
      <div className="insp-header-text">
        <h2 className="t-title insp-name" title={clipLabel(clip)}>
          {clipLabel(clip)}
        </h2>
        <p className="t-caption">
          {CLIP_TYPE_LABEL[clip.type]} · {formatTimecode(clip.start)} – {formatTimecode(clip.start + clip.duration)}
        </p>
      </div>
    </div>
  );
}

export function Inspector() {
  const tab = useEditor((s) => s.rightTab);
  const setTab = useEditor((s) => s.setRightTab);
  const selection = useEditor((s) => s.selection);
  const clip = useEditor((s) => (s.selection.length === 1 ? s.project.clips.find((c) => c.id === s.selection[0]) : undefined));

  return (
    <div className="insp">
      <Tabs idPrefix="insp" label="Properti klip" items={TABS} value={tab} onChange={setTab} />
      <TabPanel idPrefix="insp" id={tab} className="insp-body">
        {!clip ? (
          <Help>
            {selection.length > 1
              ? 'Pilih satu klip saja untuk mengubah propertinya.'
              : 'Pilih klip di timeline untuk mengubah propertinya.'}
          </Help>
        ) : (
          <>
            <ClipHeader clip={clip} />
            {tab === 'video' && <VideoTab clip={clip} />}
            {tab === 'audio' && <AudioTab clip={clip} />}
            {tab === 'color' && <ColorTab clip={clip} />}
          </>
        )}
      </TabPanel>
    </div>
  );
}
