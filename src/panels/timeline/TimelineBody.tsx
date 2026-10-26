import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { addTrack, toggleTrackHidden, toggleTrackMuted } from '../../state/actions';
import { editor, useEditor } from '../../state/store';
import { projectDuration, type Track, type TrackKind } from '../../timeline/model';
import { FPS } from '../../timeline/time';
import { IconButton } from '../../ui/Button';
import { MenuButton } from '../../ui/Menu';
import {
  IconEffect,
  IconEye,
  IconEyeOff,
  IconFilm,
  IconMusic,
  IconPlus,
  IconText,
  IconVolume,
  IconVolumeOff,
} from '../../ui/icons';
import { ClipView } from './ClipView';
import { HEAD_W, HEAD_W_COMPACT, ROW_GAP, TRACK_H, frameToX, useHeadWidth, useTimelineUi, xToFrame } from './geometry';
import { COARSE_QUERY, COMPACT_QUERY, matches, useMediaQuery } from '../../ui/useMediaQuery';
import { ZOOM_MAX, ZOOM_MIN } from '../../state/store';
import { laneDropHandlers, onLanePointerDown } from './laneEvents';
import { Ruler } from './Ruler';

const ADD_TRACK_ITEMS = [
  { id: 'video', label: 'Lajur video', icon: <IconFilm size={16} /> },
  { id: 'audio', label: 'Lajur audio', icon: <IconMusic size={16} /> },
  { id: 'text', label: 'Lajur teks', icon: <IconText size={16} /> },
  { id: 'effect', label: 'Lajur efek', icon: <IconEffect size={16} /> },
] as const;

function TrackHead({ track }: { track: Track }) {
  const visual = track.kind !== 'audio';
  const audible = track.kind === 'video' || track.kind === 'audio';
  return (
    <div className="tl-head">
      <span className="tl-head-name" title={track.name}>
        {track.name}
      </span>
      {visual && (
        <IconButton
          size="sm"
          label={track.hidden ? `Tampilkan ${track.name}` : `Sembunyikan ${track.name}`}
          aria-pressed={track.hidden}
          onClick={() => toggleTrackHidden(track.id)}
        >
          {track.hidden ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        </IconButton>
      )}
      {audible && (
        <IconButton
          size="sm"
          label={track.muted ? `Nyalakan suara ${track.name}` : `Bisukan ${track.name}`}
          aria-pressed={track.muted}
          onClick={() => toggleTrackMuted(track.id)}
        >
          {track.muted ? <IconVolumeOff size={16} /> : <IconVolume size={16} />}
        </IconButton>
      )}
    </div>
  );
}

function PlayheadLine({ zoom, headW }: { zoom: number; headW: number }) {
  const playhead = useEditor((s) => s.playhead);
  return (
    <div
      className="tl-playhead-line"
      style={{ transform: `translateX(${headW + frameToX(playhead, zoom)}px)` }}
      aria-hidden="true"
    />
  );
}

function Guides({ zoom, tracks, headW }: { zoom: number; tracks: readonly Track[]; headW: number }) {
  const snapFrame = useTimelineUi((s) => s.snapFrame);
  const ghost = useTimelineUi((s) => s.dropGhost);
  const ghostRow = ghost ? tracks.findIndex((t) => t.id === ghost.trackId) : -1;
  return (
    <>
      {snapFrame !== null && (
        <div
          className="tl-guide tl-guide-snap"
          style={{ transform: `translateX(${headW + frameToX(snapFrame, zoom)}px)` }}
          aria-hidden="true"
        />
      )}
      {ghost && ghostRow >= 0 && (
        <div
          className="tl-ghost"
          style={{
            left: headW + frameToX(ghost.start, zoom),
            width: Math.max(2, frameToX(ghost.duration, zoom)),
            top: 28 + ghostRow * (TRACK_H + ROW_GAP) + ROW_GAP + 4,
          }}
          aria-hidden="true"
        />
      )}
    </>
  );
}

export function TimelineBody() {
  const tracks = useEditor((s) => s.project.tracks);
  const clips = useEditor((s) => s.project.clips);
  const selection = useEditor((s) => s.selection);
  const zoom = useEditor((s) => s.zoom);
  const duration = useEditor((s) => projectDuration(s.project));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scrollLeft: 0, width: 960 });
  const prevZoom = useRef(zoom);
  /** Posisi gulir yang diminta cubitan dua jari; dipakai menggantikan penahan playhead saat zoom. */
  const pinchScroll = useRef<number | null>(null);
  const headW = useHeadWidth();
  const coarse = useMediaQuery(COARSE_QUERY);

  const laneWidth = Math.max(
    view.width - headW,
    frameToX(duration, zoom) + Math.max(240, (view.width - headW) * 0.5),
  );

  const trackIds = useMemo(() => tracks.map((t) => t.id), [tracks]);
  const trackIndex = useMemo(() => new Map(tracks.map((t, i) => [t.id, i])), [tracks]);
  const selected = useMemo(() => new Set(selection), [selection]);

  // Ukuran viewport dan posisi gulir, untuk penggaris yang hanya merender bagian terlihat.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setView({ scrollLeft: el.scrollLeft, width: el.clientWidth }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  // Zoom menjaga posisi playhead di layar.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const old = prevZoom.current;
    prevZoom.current = zoom;
    if (!el || old === zoom) return;
    if (pinchScroll.current !== null) {
      el.scrollLeft = Math.max(0, pinchScroll.current);
      pinchScroll.current = null;
      return;
    }
    const seconds = editor.get().playhead / FPS;
    const onScreen = seconds * old - el.scrollLeft;
    el.scrollLeft = Math.max(0, seconds * zoom - onScreen);
  }, [zoom]);

  // Saat diputar, timeline mengikuti playhead.
  useEffect(() => {
    return editor.subscribe((s, prev) => {
      if (s.playhead === prev.playhead) return;
      const el = scrollRef.current;
      if (!el || !s.playing) return;
      const x = frameToX(s.playhead, s.zoom);
      const visible = el.clientWidth - (matches(COMPACT_QUERY) ? HEAD_W_COMPACT : HEAD_W);
      if (x < el.scrollLeft || x > el.scrollLeft + visible - 24) {
        el.scrollLeft = Math.max(0, x - 24);
      }
    });
  }, []);

  // Di ponsel, klip pertama langsung terlihat utuh: zoom menyesuaikan durasi proyek.
  useEffect(() => {
    return editor.subscribe((s, prev) => {
      if (s.project === prev.project || !matches(COMPACT_QUERY)) return;
      const before = projectDuration(prev.project);
      const after = projectDuration(s.project);
      const el = scrollRef.current;
      if (before !== 0 || after === 0 || !el) return;
      const visible = el.clientWidth - (matches(COMPACT_QUERY) ? HEAD_W_COMPACT : HEAD_W) - 24;
      const fit = visible / (after / FPS);
      s.setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit)));
    });
  }, []);

  // Cubit dua jari untuk zoom timeline; waktu di antara kedua jari tetap di tempatnya.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let pinch: { dist: number; zoom: number; time: number; x: number } | null = null;
    const geometry = (t: TouchList) => {
      const a = t[0];
      const b = t[1];
      if (!a || !b) return null;
      const rect = el.getBoundingClientRect();
      return { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mid: (a.clientX + b.clientX) / 2 - rect.left };
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const g = geometry(e.touches);
      if (!g || g.dist < 10) return;
      const z = editor.get().zoom;
      const x = g.mid - headW;
      pinch = { dist: g.dist, zoom: z, time: (el.scrollLeft + x) / z, x };
    };
    const onMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      const g = geometry(e.touches);
      if (!g) return;
      e.preventDefault();
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinch.zoom * (g.dist / pinch.dist)));
      pinchScroll.current = pinch.time * z - pinch.x;
      editor.get().setZoom(z);
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [headW]);

  const onEmptyPointerDown = (e: PointerEvent<HTMLDivElement>, track: Track) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onLanePointerDown(e, track, xToFrame(e.clientX - rect.left, zoom));
  };

  return (
    <div ref={scrollRef} className="tl-body">
      <div className="tl-content" style={{ width: headW + laneWidth }}>
        <div className="tl-ruler-row">
          <div className="tl-corner">
            <span className="t-caption">Lajur</span>
            <MenuButton
              label="Tambah lajur"
              items={ADD_TRACK_ITEMS}
              onSelect={(id) => addTrack(id as TrackKind)}
              renderTrigger={(p) => (
                <IconButton size="sm" label="Tambah lajur" tooltipPlacement="bottom" {...p}>
                  <IconPlus size={16} />
                </IconButton>
              )}
            />
          </div>
          <Ruler width={laneWidth} zoom={zoom} scrollLeft={view.scrollLeft} viewWidth={view.width} />
        </div>

        <div className="tl-rows">
          {tracks.map((track) => (
            <div key={track.id} className="tl-row">
              <TrackHead track={track} />
              <div
                className={`tl-lane${track.hidden ? ' tl-lane-hidden' : ''}`}
                style={{ width: laneWidth }}
                role="group"
                aria-label={`Lajur ${track.name}`}
                data-track-id={track.id}
                onPointerDown={(e) => onEmptyPointerDown(e, track)}
                {...laneDropHandlers(track, zoom)}
              >
                {clips.length === 0 && track.kind === 'video' && track.id === tracks.findLast((t) => t.kind === 'video')?.id && (
                  <span className="tl-empty t-caption">{coarse ? 'Tambahkan media dari panel Media.' : 'Seret media ke sini.'}</span>
                )}
              </div>
            </div>
          ))}
          <div className="tl-clips" style={{ left: headW, width: laneWidth }}>
            {clips.map((clip) => (
              <ClipView
                key={clip.id}
                clip={clip}
                trackIndex={trackIndex.get(clip.trackId) ?? 0}
                selected={selected.has(clip.id)}
                zoom={zoom}
                trackIds={trackIds}
              />
            ))}
          </div>
        </div>

        <Guides zoom={zoom} tracks={tracks} headW={headW} />
        <PlayheadLine zoom={zoom} headW={headW} />
      </div>
    </div>
  );
}
