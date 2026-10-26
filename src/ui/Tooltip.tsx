import {
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  shortcut?: string;
  placement?: 'top' | 'bottom';
  children: ReactElement<TooltipChildProps>;
}

interface TooltipChildProps {
  onPointerEnter?: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: PointerEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
}

const SHOW_DELAY = 400;
const EDGE = 8;
const GAP = 6;

/**
 * Tooltip ringan: muncul saat hover (dengan jeda) atau fokus keyboard.
 * Nama aksesibel tetap berasal dari aria-label pemicunya; tooltip hanya pelengkap visual.
 */
export function Tooltip({ content, shortcut, placement = 'top', children }: TooltipProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setAnchor(null);
  }, []);

  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = anchor.left + anchor.width / 2 - w / 2;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE));
    let top = placement === 'top' ? anchor.top - h - GAP : anchor.bottom + GAP;
    if (top < EDGE) top = anchor.bottom + GAP;
    if (top + h > window.innerHeight - EDGE) top = anchor.top - h - GAP;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.visibility = 'visible';
  }, [anchor, placement]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
    };
  }, [anchor, hide]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const props = children.props;
  const trigger = cloneElement(children, {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      props.onPointerEnter?.(e);
      // Hanya untuk mouse: di layar sentuh ketukan juga memicu "enter" dan tooltip akan tertinggal.
      if (e.pointerType !== 'mouse') return;
      const el = e.currentTarget;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setAnchor(el.getBoundingClientRect()), SHOW_DELAY);
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      props.onPointerLeave?.(e);
      hide();
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      props.onFocus?.(e);
      if (e.currentTarget.matches(':focus-visible')) setAnchor(e.currentTarget.getBoundingClientRect());
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      props.onBlur?.(e);
      hide();
    },
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      props.onPointerDown?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {anchor &&
        createPortal(
          <div ref={tipRef} role="tooltip" className="tooltip" style={{ visibility: 'hidden' }}>
            <span>{content}</span>
            {shortcut && <kbd className="tooltip-kbd">{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </>
  );
}
