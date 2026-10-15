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
import { HEAD_W, ROW_GAP, TRACK_H, frameToX, useTimelineUi, xToFrame } from './geometry';
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

function PlayheadLine({ zoom }: { zoom: number }) {
  const playhead = useEditor((s) => s.playhead);
  return (
    <div
      className="tl-playhead-line"
      style={{ transform: `translateX(${HEAD_W + frameToX(playhead, zoom)}px)` }}
      aria-hidden="true"
    />
  );
}

function Guides({ zoom, tracks }: { zoom: number; tracks: readonly Track[] }) {
  const snapFrame = useTimelineUi((s) => s.snapFrame);
  const splitHover = useTimelineUi((s) => s.splitHover);
  const ghost = useTimelineUi((s) => s.dropGhost);
  const tool = useEditor((s) => s.tool);
  const ghostRow = ghost ? tracks.findIndex((t) => t.id === ghost.trackId) : -1;
  return (
    <>
      {snapFrame !== null && (
        <div
          className="tl-guide tl-guide-snap"
          style={{ transform: `translateX(${HEAD_W + frameToX(snapFrame, zoom)}px)` }}
          aria-hidden="true"
        />
      )}
      {tool === 'split' && splitHover && (
        <div
          className="tl-guide tl-guide-split"
          style={{ transform: `translateX(${HEAD_W + frameToX(splitHover.frame, zoom)}px)` }}
          aria-hidden="true"
        />
      )}
      {ghost && ghostRow >= 0 && (
        <div
          className="tl-ghost"
          style={{
            left: HEAD_W + frameToX(ghost.start, zoom),
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

  const laneWidth = Math.max(
    view.width - HEAD_W,
    frameToX(duration, zoom) + Math.max(240, (view.width - HEAD_W) * 0.5),
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
      const visible = el.clientWidth - HEAD_W;
      if (x < el.scrollLeft || x > el.scrollLeft + visible - 24) {
        el.scrollLeft = Math.max(0, x - 24);
      }
    });
  }, []);

  const onEmptyPointerDown = (e: PointerEvent<HTMLDivElement>, track: Track) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onLanePointerDown(e, track, xToFrame(e.clientX - rect.left, zoom));
  };

  return (
    <div ref={scrollRef} className="tl-body">
      <div className="tl-content" style={{ width: HEAD_W + laneWidth }}>
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
                  <span className="tl-empty t-caption">Seret media ke sini.</span>
                )}
              </div>
            </div>
          ))}
          <div className="tl-clips" style={{ left: HEAD_W, width: laneWidth }}>
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

        <Guides zoom={zoom} tracks={tracks} />
        <PlayheadLine zoom={zoom} />
      </div>
    </div>
  );
}
