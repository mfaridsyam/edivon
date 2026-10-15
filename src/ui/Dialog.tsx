import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  /** Dipanggil saat Esc ditekan atau tombol tutup dipakai. */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Bila false, Esc tidak menutup dialog (mis. saat proses berjalan). */
  dismissible?: boolean;
}

/**
 * Dialog modal memakai <dialog> asli dengan showModal(): konten di luar menjadi inert
 * sehingga fokus terjebak di dalam, Esc menutup, dan fokus kembali ke pemicu saat ditutup.
 */
export function Dialog({ open, onClose, title, description, children, footer, dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (dismissibleRef.current) onCloseRef.current();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      {open && (
        <div className="dialog-body">
          <h2 id={titleId} className="t-title">
            {title}
          </h2>
          {description && (
            <div id={descId} className="dialog-description t-body">
              {description}
            </div>
          )}
          {children}
          {footer && <div className="dialog-footer">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
