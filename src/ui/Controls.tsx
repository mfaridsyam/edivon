import { forwardRef, useId, useRef, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';

/* ---------- Segmen ---------- */

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string | number> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  mono?: boolean;
  disabled?: boolean;
}

/** Segmen (kecepatan, resolusi): role="radiogroup", panah kiri/kanan memilih. */
export function Segmented<T extends string | number>({ label, options, value, onChange, mono, disabled }: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = options.filter((o) => !o.disabled);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = enabled.findIndex((o) => o.value === value);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % enabled.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + enabled.length) % enabled.length;
    if (next === null) return;
    e.preventDefault();
    const opt = enabled[next];
    if (!opt) return;
    onChange(opt.value);
    const i = options.indexOf(opt);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus();
  };

  const focusable = options.some((o) => o.value === value && !o.disabled) ? value : enabled[0]?.value;

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={['segmented', mono && 'segmented-mono'].filter(Boolean).join(' ')}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            className="segment"
            aria-checked={checked}
            disabled={disabled || o.disabled}
            tabIndex={o.value === focusable ? 0 : -1}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Slider ---------- */

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  /** Titik awal isian; bawaan `min`. Mis. 0 untuk rentang −100..100. */
  origin?: number;
  valueText?: string;
}

/**
 * Slider memakai <input type="range"> asli. Track 4px border-strong, bagian terisi accent,
 * thumb 14px. Isian digambar dengan elemen terpisah, bukan gradien.
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { min, max, step = 1, value, onChange, origin, valueText, className, disabled, ...rest },
  ref,
) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const pct = (v: number) => ((clamp(v) - min) / (max - min || 1)) * 100;
  const from = pct(origin ?? min);
  const to = pct(value);
  const left = Math.min(from, to);
  const width = Math.abs(to - from);
  return (
    <div className={['slider', disabled && 'slider-disabled', className].filter(Boolean).join(' ')}>
      <div className="slider-track" aria-hidden="true">
        <div className="slider-fill" style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        {...rest}
      />
    </div>
  );
});

/* ---------- Progress ---------- */

interface ProgressProps {
  /** 0..1 */
  value: number;
  label: string;
  valueText?: string;
}

export function Progress({ value, label, valueText }: ProgressProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={valueText ?? `${pct}%`}
    >
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- Input ---------- */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ mono, className, ...rest }, ref) {
  return <input ref={ref} className={['input', mono && 'input-mono', className].filter(Boolean).join(' ')} {...rest} />;
});

/* ---------- Baris field ---------- */

interface FieldProps {
  label: string;
  /** Nilai yang ditampilkan dalam mono 56px rata kanan. */
  value?: string;
  /** Dipanggil dengan id untuk dikaitkan ke kontrol lewat aria-labelledby/htmlFor. */
  children: (ids: { labelId: string; controlId: string }) => ReactNode;
}

/** Baris field: label 72px, kontrol, nilai mono 56px rata kanan. */
export function Field({ label, value, children }: FieldProps) {
  const base = useId();
  const labelId = `${base}-label`;
  const controlId = `${base}-control`;
  return (
    <div className="field">
      <label id={labelId} htmlFor={controlId} className="field-label">
        {label}
      </label>
      <div className="field-control">{children({ labelId, controlId })}</div>
      {value !== undefined && (
        <output className="field-value" htmlFor={controlId}>
          {value}
        </output>
      )}
    </div>
  );
}

/* ---------- Pilihan warna ---------- */

export interface SwatchOption<T extends string> {
  value: T;
  label: string;
  /** Nama token CSS, mis. "--ink". */
  token: string;
}

interface SwatchesProps<T extends string> {
  label: string;
  options: readonly SwatchOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Swatches<T extends string>({ label, options, value, onChange }: SwatchesProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((o) => o.value === value);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    if (next === null) return;
    e.preventDefault();
    const opt = options[next];
    if (!opt) return;
    onChange(opt.value);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className="swatches" onKeyDown={onKeyDown}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.label}
          title={o.label}
          tabIndex={o.value === value ? 0 : -1}
          className="swatch"
          style={{ background: `var(${o.token})` }}
          onClick={() => onChange(o.value)}
        />
      ))}
    </div>
  );
}
