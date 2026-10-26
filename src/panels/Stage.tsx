import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PreviewEngine } from '../engine/preview';
import { jumpToEnd, jumpToStart } from '../state/actions';
import { useEditor } from '../state/store';
import { ASPECTS, frameSize, projectDuration } from '../timeline/model';
import { formatTimecode } from '../timeline/time';
import { IconButton } from '../ui/Button';
import { Segmented } from '../ui/Controls';
import { Tooltip } from '../ui/Tooltip';
import { IconFullscreen, IconFullscreenExit, IconPause, IconPlay, IconSkipEnd, IconSkipStart } from '../ui/icons';
import { COMPACT_QUERY, matches } from '../ui/useMediaQuery';
import {
  exitFullscreen,
  fullscreenElement,
  lockLandscape,
  onFullscreenChange,
  requestFullscreen,
  unlockOrientation,
} from './fullscreen';
import { CropOverlay } from './CropOverlay';
import { TransformOverlay } from './TransformOverlay';
import './stage.css';

const MAX_FRAME_W = 560;
const STAGE_PAD = 24;

const ASPECT_OPTIONS = ASPECTS.map((value) => ({ value, label: value }));

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

function Transport({ onFullscreen, fullscreen }: { onFullscreen: () => void; fullscreen: boolean }) {
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
          options={ASPECT_OPTIONS}
          value={aspect}
          onChange={(value) => apply((p) => ({ ...p, aspect: value }))}
        />
        <IconButton label={fullscreen ? 'Keluar dari layar penuh' : 'Layar penuh'} onClick={onFullscreen}>
          {fullscreen ? <IconFullscreenExit /> : <IconFullscreen />}
        </IconButton>
      </div>
    </div>
  );
}

export function Stage() {
  const aspect = useEditor((s) => s.project.aspect);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  /** 'native' = API layar penuh browser; 'pseudo' = menutupi seluruh jendela (iPhone tidak punya API-nya). */
  const [fullMode, setFullMode] = useState<'none' | 'native' | 'pseudo'>('none');
  const fullscreen = fullMode !== 'none';

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
      const pad = fullscreen ? 0 : STAGE_PAD * 2;
      const availW = viewport.clientWidth - pad;
      const availH = viewport.clientHeight - pad;
      let w = Math.min(availW, availH * ratio);
      if (!fullscreen) w = Math.min(w, MAX_FRAME_W);
      w = Math.max(0, Math.floor(w));
      setBox({ w, h: Math.floor(w / ratio) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [aspect, fullscreen]);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    engineRef.current?.resize(box.w * dpr, box.h * dpr);
  }, [box]);

  useEffect(
    () =>
      onFullscreenChange(() => {
        const native = fullscreenElement() === stageRef.current;
        setFullMode((m) => (native ? 'native' : m === 'native' ? 'none' : m));
        if (!native) unlockOrientation();
      }),
    [],
  );

  // Mode cadangan tidak punya Esc bawaan browser.
  useEffect(() => {
    if (fullMode !== 'pseudo') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullMode('none');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullMode]);

  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    if (fullMode === 'pseudo') {
      setFullMode('none');
      return;
    }
    if (fullMode === 'native' || fullscreenElement()) {
      await exitFullscreen();
      return;
    }
    if (await requestFullscreen(stage)) {
      const { width: w, height: h } = frameSize(aspect);
      if (w > h && matches(COMPACT_QUERY)) lockLandscape();
      return;
    }
    setFullMode('pseudo');
  };

  return (
    <div
      ref={stageRef}
      className={['stage', fullscreen && 'stage-full', fullMode === 'pseudo' && 'stage-pseudo-full'].filter(Boolean).join(' ')}
    >
      <div ref={viewportRef} className="stage-viewport">
        <div
          ref={frameRef}
          className="stage-frame"
          style={{ width: box.w, height: box.h }}
          onDoubleClick={() => void toggleFullscreen()}
        >
          <canvas
            ref={canvasRef}
            className="stage-canvas"
            role="img"
            aria-label={`Pratinjau video, rasio ${aspect}`}
          />
          {!fullscreen && <TransformOverlay width={box.w} height={box.h} />}
          {!fullscreen && <CropOverlay width={box.w} height={box.h} />}
        </div>
      </div>
      <Transport onFullscreen={() => void toggleFullscreen()} fullscreen={fullscreen} />
    </div>
  );
}
