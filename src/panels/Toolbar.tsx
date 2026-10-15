import type { ReactNode } from 'react';
import { canCutAtPlayhead, cutAtPlayhead, deleteSelection, setTool } from '../state/actions';
import { useEditor, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, type ToolId } from '../state/store';
import { CUT_ACTIONS, DELETE_TOOL, TOOLS, type CutId, type ToolDef } from '../state/tools';
import { IconButton, ToolButton } from '../ui/Button';
import { Slider } from '../ui/Controls';
import {
  IconCrop,
  IconCursor,
  IconCutLeft,
  IconCutRight,
  IconEffect,
  IconMinus,
  IconPlus,
  IconSpeed,
  IconSplit,
  IconText,
  IconTrash,
  IconVolume,
} from '../ui/icons';

const TOOL_ICON: Record<ToolId, ReactNode> = {
  select: <IconCursor />,
  text: <IconText />,
  crop: <IconCrop />,
  speed: <IconSpeed />,
  volume: <IconVolume />,
  effect: <IconEffect />,
};

const CUT_ICON: Record<CutId, ReactNode> = {
  'cut-left': <IconCutLeft />,
  split: <IconSplit />,
  'cut-right': <IconCutRight />,
};

const ZOOM_STEP = 1.5;
const LOG_RANGE = Math.log(ZOOM_MAX / ZOOM_MIN);

function zoomToSlider(zoom: number): number {
  return Math.round((Math.log(zoom / ZOOM_MIN) / LOG_RANGE) * 100);
}

function sliderToZoom(v: number): number {
  return ZOOM_MIN * Math.exp((v / 100) * LOG_RANGE);
}

/** Bilah alat di atas timeline: Pilih, aksi di garis merah, alat bermode lain, Hapus, dan zoom. */
export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const canCut = useEditor((s) => canCutAtPlayhead(s.project, s.playhead));
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const zoomPct = Math.round((zoom / ZOOM_DEFAULT) * 100);

  const modeButton = (t: ToolDef) => (
    <ToolButton
      key={t.id}
      icon={TOOL_ICON[t.id]}
      label={t.label}
      hint={t.hint}
      shortcut={t.key}
      pressed={tool === t.id}
      onClick={() => setTool(t.id)}
    />
  );

  return (
    <div className="toolbar">
      <div className="toolbar-tools" role="group" aria-label="Alat">
        {TOOLS.slice(0, 1).map(modeButton)}
        <span className="toolbar-sep" aria-hidden="true" />
        {CUT_ACTIONS.map((a) => (
          <ToolButton
            key={a.id}
            className="tool-wide"
            icon={CUT_ICON[a.id]}
            label={a.label}
            hint={a.hint}
            shortcut={a.key}
            disabled={!canCut}
            onClick={() => cutAtPlayhead(a.id)}
          />
        ))}
        <span className="toolbar-sep" aria-hidden="true" />
        {TOOLS.slice(1).map(modeButton)}
        <span className="toolbar-sep" aria-hidden="true" />
        <ToolButton
          icon={<IconTrash />}
          label={DELETE_TOOL.label}
          hint={DELETE_TOOL.hint}
          shortcut={DELETE_TOOL.key}
          danger
          disabled={!hasSelection}
          onClick={deleteSelection}
        />
      </div>
      <div className="toolbar-zoom" role="group" aria-label="Zoom timeline">
        <IconButton size="sm" label="Perkecil timeline" onClick={() => setZoom(zoom / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>
          <IconMinus size={16} />
        </IconButton>
        <Slider
          min={0}
          max={100}
          value={zoomToSlider(zoom)}
          onChange={(v) => setZoom(sliderToZoom(v))}
          aria-label="Zoom timeline"
          valueText={`${zoomPct}%`}
        />
        <IconButton size="sm" label="Perbesar timeline" onClick={() => setZoom(zoom * ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
          <IconPlus size={16} />
        </IconButton>
      </div>
    </div>
  );
}
