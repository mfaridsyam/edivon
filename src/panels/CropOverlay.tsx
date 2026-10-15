import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { mediaRect } from '../engine/compositor';
import { patchClip } from '../state/actions';
import { editor, useEditor } from '../state/store';
import { findTrack, frameSize, type Crop, type ImageClip, type VideoClip } from '../timeline/model';
import { updateClip } from '../timeline/ops';

interface CropOverlayProps {
  width: number;
  height: number;
}

type Side = keyof Crop;

const SIDE_LABEL: Record<Side, string> = {
  left: 'Crop kiri',
  right: 'Crop kanan',
  top: 'Crop atas',
  bottom: 'Crop bawah',
};

/** Sisa minimum gambar setelah crop (fraksi), agar klip tidak hilang sepenuhnya. */
const MIN_KEEP = 0.05;

function clampCrop(c: Crop, side: Side, value: number): Crop {
  const opposite: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
  const max = 1 - MIN_KEEP - c[opposite[side]];
  return { ...c, [side]: Math.min(max, Math.max(0, value)) };
}

/** Pegangan crop di atas pratinjau saat alat Crop aktif. Tiap pegangan juga slider yang bisa dipakai dengan panah. */
export function CropOverlay({ width, height }: CropOverlayProps) {
  const tool = useEditor((s) => s.tool);
  const aspect = useEditor((s) => s.project.aspect);
  const target = useEditor((s) => {
    if (s.selection.length !== 1) return null;
    const clip = s.project.clips.find((c) => c.id === s.selection[0]);
    return clip && (clip.type === 'video' || clip.type === 'image') ? clip : null;
  });
  const active = useEditor((s) => (target ? s.playhead >= target.start && s.playhead < target.start + target.duration : false));
  const hidden = useEditor((s) => (target ? (findTrack(s.project, target.trackId)?.hidden ?? false) : false));
  const media = useEditor((s) => (target ? s.media.find((m) => m.id === target.mediaId) : undefined));
  const drag = useRef<{ side: Side; pointerId: number; x: number; y: number; crop: Crop } | null>(null);

  if (tool !== 'crop' || width === 0) return null;
  if (!target) return <p className="stage-hint t-caption">Pilih klip video atau gambar untuk di-crop.</p>;
  if (!active || hidden) return <p className="stage-hint t-caption">Pindahkan playhead ke klip yang dipilih untuk melihat crop.</p>;
  if (!media || media.width === 0) return null;

  const clip: VideoClip | ImageClip = target;
  const ref = frameSize(aspect);
  const unit = height / ref.height;
  const t = clip.transform;
  const c = clip.crop;
  const full = mediaRect(media.width, media.height, width, height, t.scale);
  const rad = (t.rotation * Math.PI) / 180;

  const box = {
    left: full.x + c.left * full.w,
    top: full.y + c.top * full.h,
    width: full.w * (1 - c.left - c.right),
    height: full.h * (1 - c.top - c.bottom),
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>, side: Side) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { side, pointerId: e.pointerId, x: e.clientX, y: e.clientY, crop: c };
    editor.get().beginGesture();
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // Geseran layar diputar balik ke sumbu lokal klip.
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const lx = dx * Math.cos(-rad) - dy * Math.sin(-rad);
    const ly = dx * Math.sin(-rad) + dy * Math.cos(-rad);
    const fx = lx / full.w;
    const fy = ly / full.h;
    const delta = d.side === 'left' ? fx : d.side === 'right' ? -fx : d.side === 'top' ? fy : -fy;
    const crop = clampCrop(d.crop, d.side, d.crop[d.side] + delta);
    editor.get().updateGesture((p) =>
      updateClip(p, clip.id, (cl) => (cl.type === 'video' || cl.type === 'image' ? { ...cl, crop } : cl)),
    );
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    editor.get().endGesture();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>, side: Side) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step;
    else if (e.key === 'Home') delta = -c[side];
    else return;
    e.preventDefault();
    e.stopPropagation();
    const crop = clampCrop(c, side, c[side] + delta);
    patchClip(clip.id, `crop-${side}`, (cl) => (cl.type === 'video' || cl.type === 'image' ? { ...cl, crop } : cl));
  };

  const handle = (side: Side, style: CSSProperties) => (
    <span
      key={side}
      role="slider"
      tabIndex={0}
      aria-label={SIDE_LABEL[side]}
      aria-valuemin={0}
      aria-valuemax={95}
      aria-valuenow={Math.round(c[side] * 100)}
      aria-valuetext={`${Math.round(c[side] * 100)}%`}
      className={`crop-handle crop-handle-${side}`}
      style={style}
      onPointerDown={(e) => onPointerDown(e, side)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onKeyDown={(e) => onKeyDown(e, side)}
    />
  );

  return (
    <div
      className="crop-layer"
      style={{
        left: width / 2 + t.x * unit,
        top: height / 2 + t.y * unit,
        transform: `rotate(${t.rotation}deg)`,
      }}
    >
      <div className="crop-full" style={{ left: full.x, top: full.y, width: full.w, height: full.h }} />
      <div className="crop-box" style={box} />
      {handle('left', { left: box.left, top: box.top + box.height / 2 })}
      {handle('right', { left: box.left + box.width, top: box.top + box.height / 2 })}
      {handle('top', { left: box.left + box.width / 2, top: box.top })}
      {handle('bottom', { left: box.left + box.width / 2, top: box.top + box.height })}
    </div>
  );
}
