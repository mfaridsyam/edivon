import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PreviewEngine } from '../engine/preview';
import { jumpToEnd, jumpToStart } from '../state/actions';
import { useEditor } from '../state/store';
import { frameSize, projectDuration, type Aspect } from '../timeline/model';
import { formatTimecode } from '../timeline/time';
import { IconButton } from '../ui/Button';
import { Segmented } from '../ui/Controls';
import { Tooltip } from '../ui/Tooltip';
import { IconFullscreen, IconPause, IconPlay, IconSkipEnd, IconSkipStart } from '../ui/icons';
import { CropOverlay } from './CropOverlay';
import { TransformOverlay } from './TransformOverlay';
import './stage.css';

const MAX_FRAME_W = 560;
const STAGE_PAD = 24;

const ASPECTS = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
] as const satisfies readonly { value: Aspect; label: string }[];

function Timecode() {
  const playhead = useEditor((s) => s.playhead);
  const duration = useEditor((s) => projectDuration(s.project));
  return (
    <div className="transport-time">
      <span className="t-timecode-lg" aria-label={`Posisi ${formatTimecode(playhead)}`}>
        {formatTimecode(playhead)}
      </span>
      <span className="transport-total t-timecode" aria-label={`Durasi ${formatTimecode(duration)}`}>
        / {formatTimecode(duration)}
      </span>
    </div>
  );
}

export function togglePlay(): void {
  const s = useEditor.getState();
  s.setPlaying(!s.playing);
}

function Transport({ onFullscreen }: { onFullscreen: () => void }) {
  const playing = useEditor((s) => s.playing);
  const aspect = useEditor((s) => s.project.aspect);
  const apply = useEditor((s) => s.apply);
  return (
    <div className="transport">
      <Timecode />
      <div className="transport-controls">
        <IconButton label="Lompat ke awal" shortcut="Home" onClick={jumpToStart}>
          <IconSkipStart />
        </IconButton>
        <Tooltip content={playing ? 'Jeda' : 'Putar'} shortcut="Spasi">
          <button
            type="button"
            className="play-btn"
            aria-label={playing ? 'Jeda' : 'Putar'}
            aria-keyshortcuts="Space"
            onClick={togglePlay}
          >
            {playing ? <IconPause /> : <IconPlay />}
          </button>
        </Tooltip>
        <IconButton label="Lompat ke akhir" shortcut="End" onClick={jumpToEnd}>
          <IconSkipEnd />
        </IconButton>
      </div>
      <div className="transport-end">
        <Segmented
          label="Rasio"
          mono
          options={ASPECTS}
          value={aspect}
          onChange={(value) => apply((p) => ({ ...p, aspect: value }))}
        />
        <IconButton label="Layar penuh" onClick={onFullscreen}>
          <IconFullscreen />
        </IconButton>
      </div>
    </div>
  );
}

export function Stage() {
  const aspect = useEditor((s) => s.project.aspect);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new PreviewEngine();
    engine.attach(canvas);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Bingkai pratinjau mengikuti rasio proyek, maks. 560px lebar, dan muat di area pratinjau.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { width: rw, height: rh } = frameSize(aspect);
    const ratio = rw / rh;
    const measure = () => {
      const isFull = document.fullscreenElement === frameRef.current;
      const availW = isFull ? window.innerWidth : viewport.clientWidth - STAGE_PAD * 2;
      const availH = isFull ? window.innerHeight : viewport.clientHeight - STAGE_PAD * 2;
      let w = Math.min(availW, availH * ratio);
      if (!isFull) w = Math.min(w, MAX_FRAME_W);
      w = Math.max(0, Math.floor(w));
      setBox({ w, h: Math.floor(w / ratio) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    document.addEventListener('fullscreenchange', measure);
    return () => {
      ro.disconnect();
      document.removeEventListener('fullscreenchange', measure);
    };
  }, [aspect]);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    engineRef.current?.resize(box.w * dpr, box.h * dpr);
  }, [box]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="stage">
      <div ref={viewportRef} className="stage-viewport">
        <div
          ref={frameRef}
          className="stage-frame"
          style={fullscreen ? undefined : { width: box.w, height: box.h }}
          onDoubleClick={toggleFullscreen}
        >
          <canvas
            ref={canvasRef}
            className="stage-canvas"
            role="img"
            aria-label={`Pratinjau video, rasio ${aspect}`}
            style={fullscreen ? { width: box.w, height: box.h } : undefined}
          />
          {!fullscreen && <TransformOverlay width={box.w} height={box.h} />}
          {!fullscreen && <CropOverlay width={box.w} height={box.h} />}
        </div>
      </div>
      <Transport onFullscreen={toggleFullscreen} />
    </div>
  );
}
