import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

/** Tombol 32px. Hanya satu `primary` per layar (selain tombol putar). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', icon, className, children, type = 'button', ...rest },
  ref,
) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Wajib: nama aksesibel, juga dipakai sebagai isi tooltip. */
  label: string;
  shortcut?: string;
  size?: 'md' | 'sm';
  tooltip?: boolean;
  tooltipPlacement?: 'top' | 'bottom';
  children: ReactNode;
}

/** Tombol ikon 32px (24px versi kecil), tanpa batas. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, size = 'md', tooltip = true, tooltipPlacement = 'top', className, children, type = 'button', ...rest },
  ref,
) {
  const cls = ['icon-btn', size === 'sm' && 'icon-btn-sm', className].filter(Boolean).join(' ');
  const button = (
    <button ref={ref} type={type} className={cls} aria-label={label} aria-keyshortcuts={shortcut} {...rest}>
      {children}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} shortcut={shortcut} placement={tooltipPlacement}>
      {button}
    </Tooltip>
  );
});

export interface ToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode;
  label: string;
  /** Teks tooltip; bawaan sama dengan label. */
  hint?: string;
  shortcut?: string;
  /** `undefined` untuk alat berupa aksi (mis. Hapus) yang tidak punya keadaan aktif. */
  pressed?: boolean;
  danger?: boolean;
}

/** Alat di bilah timeline: 64×44px, ikon 18px dengan label 12px di bawahnya. */
export function ToolButton({ icon, label, hint, shortcut, pressed, danger, className, type = 'button', ...rest }: ToolButtonProps) {
  const cls = ['tool', danger && 'tool-danger', className].filter(Boolean).join(' ');
  const ariaShortcut = shortcut === 'Delete' ? 'Delete Backspace' : shortcut;
  return (
    <Tooltip content={hint ?? label} shortcut={shortcut} placement="top">
      <button type={type} className={cls} aria-pressed={pressed} aria-keyshortcuts={ariaShortcut} {...rest}>
        {icon}
        <span className="tool-label">{label}</span>
      </button>
    </Tooltip>
  );
}
