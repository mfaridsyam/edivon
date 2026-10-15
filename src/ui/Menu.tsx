import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface MenuButtonProps {
  items: readonly MenuItem[];
  onSelect: (id: string) => void;
  /** Merender tombol pemicu; props wajib disebarkan ke <button>. */
  renderTrigger: (props: {
    ref: (el: HTMLButtonElement | null) => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string | undefined;
    onClick: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  }) => ReactNode;
  label: string;
}

/** Menu sederhana dengan role="menu": panah atas/bawah, Home/End, Enter memilih, Esc menutup. */
export function MenuButton({ items, onSelect, renderTrigger, label }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openMenu = (index: number) => {
    setActive(index);
    setOpen(true);
  };

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!open || !menu || !trigger) return;
    const r = trigger.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - w - 8);
    left = Math.max(8, left);
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = r.top - h - 4;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => window.removeEventListener('pointerdown', onPointer, true);
  }, [open, close]);

  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    close(true);
    onSelect(item.id);
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const count = items.length;
    if (e.key === 'ArrowDown') setActive((a) => (a + 1) % count);
    else if (e.key === 'ArrowUp') setActive((a) => (a - 1 + count) % count);
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(count - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      close(e.key === 'Escape');
      if (e.key === 'Tab') return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      {renderTrigger({
        ref: (el) => {
          triggerRef.current = el;
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => (open ? close(false) : openMenu(0)),
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            openMenu(0);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            openMenu(items.length - 1);
          }
        },
      })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className="menu"
            style={{ visibility: 'hidden' }}
            onKeyDown={onMenuKey}
          >
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="menu-item"
                tabIndex={i === active ? 0 : -1}
                aria-disabled={item.disabled || undefined}
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(i)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
