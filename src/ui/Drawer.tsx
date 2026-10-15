import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';
import { IconClose } from './icons';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Laci dari kanan untuk layar sempit. Memakai <dialog> modal: fokus terjebak di dalam, Esc menutup. */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, []);

  return (
    <dialog ref={ref} className="drawer" aria-labelledby={titleId}>
      <div className="drawer-header">
        <h2 id={titleId} className="t-title">
          {title}
        </h2>
        <IconButton label="Tutup" tooltipPlacement="bottom" onClick={onClose}>
          <IconClose />
        </IconButton>
      </div>
      <div className="drawer-body">{children}</div>
    </dialog>
  );
}
