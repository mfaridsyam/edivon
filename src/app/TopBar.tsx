import { useEffect, useRef, useState } from 'react';
import { canRedo, canUndo } from '../state/history';
import { useEditor } from '../state/store';
import { Button, IconButton } from '../ui/Button';
import { Input } from '../ui/Controls';
import { IconDownload, IconFilm, IconPanel, IconRedo, IconShield, IconSliders, IconUndo } from '../ui/icons';
import { useUi } from './uiState';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

function ProjectName() {
  const name = useEditor((s) => s.project.name);
  const apply = useEditor((s) => s.apply);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const finish = (save: boolean) => {
    const value = draft.trim();
    if (save && value && value !== name) apply((p) => ({ ...p, name: value }));
    setEditing(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        className="topbar-name-input"
        aria-label="Nama proyek"
        value={draft}
        maxLength={80}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true);
          else if (e.key === 'Escape') {
            e.stopPropagation();
            finish(false);
          }
        }}
      />
    );
  }
  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      className="topbar-name"
      aria-label={`Nama proyek: ${name}. Klik untuk mengubah.`}
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
    >
      <span className="topbar-name-text">{name}</span>
    </Button>
  );
}

export function TopBar() {
  const history = useEditor((s) => s.history);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const openExport = useUi((s) => s.openExport);
  const narrow = useUi((s) => s.narrow);
  const leftOpen = useUi((s) => s.leftOpen);
  const toggleLeft = useUi((s) => s.toggleLeft);
  const openDrawer = useUi((s) => s.openDrawer);

  return (
    <header className="topbar">
      <div className="topbar-start">
        <h1 className="topbar-logo t-title">
          <IconFilm size={18} className="topbar-logo-icon" />
          Klip
        </h1>
        {narrow && (
          <Button
            variant="ghost"
            icon={<IconPanel />}
            aria-label="Panel media"
            aria-expanded={leftOpen}
            aria-controls="panel-left"
            onClick={toggleLeft}
          >
            <span className="topbar-btn-text">Media</span>
          </Button>
        )}
        <ProjectName />
      </div>
      <div className="topbar-center">
        <span className="badge" title="Video diproses di browser ini. Berkas tidak dikirim ke server.">
          <IconShield size={14} />
          <span className="badge-text">Diproses di perangkatmu</span>
        </span>
      </div>
      <div className="topbar-end">
        <IconButton label="Urungkan" shortcut={`${MOD}+Z`} tooltipPlacement="bottom" onClick={undo} disabled={!canUndo(history)}>
          <IconUndo />
        </IconButton>
        <IconButton
          label="Ulangi"
          shortcut={`${MOD}+Shift+Z`}
          tooltipPlacement="bottom"
          onClick={redo}
          disabled={!canRedo(history)}
        >
          <IconRedo />
        </IconButton>
        {narrow && (
          <Button variant="ghost" icon={<IconSliders />} aria-label="Properti" aria-haspopup="dialog" onClick={openDrawer}>
            <span className="topbar-btn-text">Properti</span>
          </Button>
        )}
        <Button variant="primary" icon={<IconDownload />} onClick={openExport}>
          Ekspor
        </Button>
      </div>
    </header>
  );
}
