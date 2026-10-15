import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EFFECTS } from '../../engine/effects';
import { applyEffectToClip, changeSpeed, patchClip } from '../../state/actions';
import { useEditor } from '../../state/store';
import { SPEEDS, clipLabel, type Clip } from '../../timeline/model';
import { Field, Segmented, Slider } from '../../ui/Controls';
import { closeClipPopover, useClipPopover, type PopoverTool } from './clipTools';

const TITLE: Record<PopoverTool, string> = {
  speed: 'Kecepatan',
  volume: 'Volume',
  effect: 'Efek',
};

const SPEED_OPTIONS = SPEEDS.map((v) => ({ value: v, label: `${String(v).replace('.', ',')}×` }));

function Body({ clip, tool }: { clip: Clip; tool: PopoverTool }) {
  if (tool === 'speed') {
    if (clip.type !== 'video' && clip.type !== 'audio') {
      return <p className="t-caption">Kecepatan hanya untuk klip video dan audio.</p>;
    }
    return (
      <Segmented label="Kecepatan" mono options={SPEED_OPTIONS} value={clip.speed} onChange={(v) => changeSpeed(clip.id, v)} />
    );
  }
  if (tool === 'volume') {
    if (clip.type !== 'video' && clip.type !== 'audio') return <p className="t-caption">Klip ini tidak punya audio.</p>;
    if (clip.type === 'video' && !clip.hasAudio) return <p className="t-caption">Video ini tidak punya suara.</p>;
    const v = Math.round(clip.volume * 100);
    return (
      <Field label="Volume" value={`${v}%`}>
        {({ controlId }) => (
          <Slider
            id={controlId}
            min={0}
            max={200}
            value={v}
            valueText={`${v}%`}
            onChange={(n) =>
              patchClip(clip.id, 'volume', (c) => (c.type === 'video' || c.type === 'audio' ? { ...c, volume: n / 100 } : c))
            }
          />
        )}
      </Field>
    );
  }
  if (clip.type === 'audio') return <p className="t-caption">Efek hanya untuk klip video, gambar, dan teks.</p>;
  const current = clip.type === 'effect' ? clip.effect : null;
  return (
    <div className="popover-effects" role="group" aria-label="Pilih efek">
      {EFFECTS.map((fx) => (
        <button
          key={fx.id}
          type="button"
          className="menu-item"
          aria-pressed={current === fx.id}
          onClick={() => {
            applyEffectToClip(clip.id, fx.id);
            closeClipPopover();
          }}
        >
          {fx.label}
        </button>
      ))}
    </div>
  );
}

/** Popover kecil di dekat klip; Esc atau klik di luar menutupnya dan fokus kembali ke klip. */
export function ClipPopover() {
  const open = useClipPopover((s) => s.open);
  const clip = useEditor((s) => (open ? s.project.clips.find((c) => c.id === open.clipId) : undefined));
  const tool = useEditor((s) => s.tool);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = Math.min(open.anchor.left, window.innerWidth - w - 8);
    left = Math.max(8, left);
    let top = open.anchor.top - h - 6;
    if (top < 8) top = open.anchor.bottom + 6;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
    el.querySelector<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      useClipPopover.setState({ open: null });
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => window.removeEventListener('pointerdown', onPointer, true);
  }, [open]);

  // Tutup bila klipnya hilang (mis. dihapus atau di-undo) atau alat berganti.
  useEffect(() => {
    if (open && (!clip || tool !== open.tool)) useClipPopover.setState({ open: null });
  }, [open, clip, tool]);

  if (!open || !clip) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${TITLE[open.tool]}: ${clipLabel(clip)}`}
      className="popover"
      style={{ visibility: 'hidden' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          closeClipPopover();
        }
      }}
    >
      <p className="popover-title t-label">
        {TITLE[open.tool]} · <span className="popover-clip">{clipLabel(clip)}</span>
      </p>
      <Body clip={clip} tool={open.tool} />
    </div>,
    document.body,
  );
}
