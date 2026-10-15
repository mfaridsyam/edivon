import { memo, useMemo, useRef, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { editor, useEditor } from '../../state/store';
import { projectDuration } from '../../timeline/model';
import { FPS, formatShort, formatTimecode, rulerSteps } from '../../timeline/time';
import { frameToX, xToFrame } from './geometry';

interface TicksProps {
  zoom: number;
  from: number;
  to: number;
}

/** Hanya tick di rentang yang terlihat yang dirender. */
const Ticks = memo(function Ticks({ zoom, from, to }: TicksProps) {
  const { minor, major } = rulerSteps(zoom);
  const items: ReactElement[] = [];
  const first = Math.max(0, Math.floor(from / zoom / minor));
  const last = Math.ceil(to / zoom / minor);
  const ratio = Math.round(major / minor);
  for (let i = first; i <= last; i++) {
    const seconds = i * minor;
    const x = seconds * zoom;
    const isMajor = i % ratio === 0;
    items.push(
      <span key={i} className={isMajor ? 'tl-tick tl-tick-major' : 'tl-tick'} style={{ left: x }}>
        {isMajor && <span className="tl-tick-label t-tick">{formatShort(seconds)}</span>}
      </span>,
    );
  }
  return <>{items}</>;
});

interface RulerProps {
  width: number;
  zoom: number;
  scrollLeft: number;
  viewWidth: number;
}

/** Penggaris 28px. Berperan sebagai slider playhead: seret untuk mencari, panah untuk per frame. */
export function Ruler({ width, zoom, scrollLeft, viewWidth }: RulerProps) {
  const playhead = useEditor((s) => s.playhead);
  const duration = useEditor((s) => projectDuration(s.project));
  const scrubbing = useRef<number | null>(null);
  const x = frameToX(playhead, zoom);
  const maxFrame = Math.max(duration, xToFrame(width, zoom));

  const from = scrollLeft - 160;
  const to = Math.min(width, scrollLeft + viewWidth + 160);
  const ticks = useMemo(() => <Ticks zoom={zoom} from={from} to={to} />, [zoom, from, to]);

  const seek = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const frame = Math.min(maxFrame, Math.max(0, xToFrame(clientX - rect.left, zoom)));
    editor.get().setPlayhead(frame);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const s = editor.get();
    if (s.playing) s.setPlaying(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbing.current = e.pointerId;
    seek(e.clientX, e.currentTarget);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (scrubbing.current !== e.pointerId) return;
    seek(e.clientX, e.currentTarget);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (scrubbing.current === e.pointerId) scrubbing.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = editor.get();
    let next: number | null = null;
    const step = e.shiftKey ? FPS : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = s.playhead - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = s.playhead + step;
    else if (e.key === 'PageDown') next = s.playhead - 10 * FPS;
    else if (e.key === 'PageUp') next = s.playhead + 10 * FPS;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = duration;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    s.setPlayhead(Math.min(maxFrame, Math.max(0, next)));
  };

  return (
    <div
      className="tl-ruler"
      style={{ width }}
      role="slider"
      tabIndex={0}
      aria-label="Playhead"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={maxFrame}
      aria-valuenow={playhead}
      aria-valuetext={formatTimecode(playhead)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {ticks}
      <span className="tl-playhead-knob" style={{ transform: `translateX(${x}px)` }} aria-hidden="true" />
    </div>
  );
}
