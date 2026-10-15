import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { EFFECTS } from '../engine/effects';
import { addEffectClip, addMediaToTimeline, addTextClip } from '../state/actions';
import { TEXT_PRESETS } from '../state/clipFactory';
import { importFiles } from '../state/importMedia';
import type { MediaItem } from '../state/media';
import { useEditor, type LeftTab } from '../state/store';
import { formatShort } from '../timeline/time';
import { Button } from '../ui/Button';
import { TabPanel, Tabs } from '../ui/Tabs';
import { IconDownload, IconEffect, IconFilm, IconImage, IconMusic } from '../ui/icons';
import { endPayloadDrag, startPayloadDrag } from './dragPayload';
import { YouTubeImport } from './YouTubeImport';
import './mediabin.css';

const TABS = [
  { id: 'media', label: 'Media' },
  { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Teks' },
  { id: 'effect', label: 'Efek' },
] as const satisfies readonly { id: LeftTab; label: string }[];

const ACCEPT = 'video/*,audio/*,image/*';

function hasFiles(e: DragEvent<HTMLElement>): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

function Dropzone({ hint }: { hint: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className="dropzone"
      data-over={over || undefined}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <IconDownload size={18} />
      <p className="t-body">{hint}</p>
      <Button onClick={() => inputRef.current?.click()}>Pilih berkas</Button>
      <p className="t-caption">Berkas tidak dikirim ke server.</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Pilih berkas video, audio, atau gambar"
        data-testid="file-input"
        onChange={(e) => {
          const files = e.currentTarget.files;
          if (files && files.length > 0) importFiles(Array.from(files));
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}

function kindIcon(kind: MediaItem['kind'], size = 18) {
  if (kind === 'audio') return <IconMusic size={size} />;
  if (kind === 'image') return <IconImage size={size} />;
  return <IconFilm size={size} />;
}

function cardLabel(m: MediaItem): string {
  const kind = m.kind === 'audio' ? 'Audio' : m.kind === 'image' ? 'Gambar' : 'Video';
  if (m.status === 'loading') return `${m.name}, ${kind}, sedang dibaca`;
  if (m.status === 'error') return `${m.name}, ${kind}, ${m.error ?? 'tidak bisa dibaca'}`;
  const dur = m.kind === 'image' ? '' : `, durasi ${formatShort(m.duration)}`;
  return `${m.name}, ${kind}${dur}`;
}

function MediaGrid({ items, label }: { items: MediaItem[]; label: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeId = items.some((m) => m.id === selected) ? selected : (items[0]?.id ?? null);

  const focusItem = (id: string) => {
    setSelected(id);
    listRef.current?.querySelector<HTMLElement>(`[data-media-id="${CSS.escape(id)}"]`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number, m: MediaItem) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = index + 1;
    else if (e.key === 'ArrowLeft') next = index - 1;
    else if (e.key === 'ArrowDown') next = index + 2;
    else if (e.key === 'ArrowUp') next = index - 2;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Enter') {
      e.preventDefault();
      addMediaToTimeline(m.id);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    const target = items[Math.min(items.length - 1, Math.max(0, next))];
    if (target) focusItem(target.id);
  };

  return (
    <div ref={listRef} className="media-grid" role="listbox" aria-label={label}>
      {items.map((m, i) => {
        const ready = m.status === 'ready';
        return (
          <div
            key={m.id}
            role="option"
            aria-selected={m.id === selected}
            aria-label={cardLabel(m)}
            aria-disabled={!ready || undefined}
            tabIndex={m.id === activeId ? 0 : -1}
            data-media-id={m.id}
            className="media-card"
            draggable={ready}
            title={ready ? `${m.name}. Klik dua kali atau tekan Enter untuk menambah ke timeline.` : m.name}
            onClick={() => setSelected(m.id)}
            onDoubleClick={() => addMediaToTimeline(m.id)}
            onKeyDown={(e) => onKeyDown(e, i, m)}
            onDragStart={(e) => {
              setSelected(m.id);
              startPayloadDrag(e, { kind: 'media', id: m.id }, m.name);
            }}
            onDragEnd={endPayloadDrag}
          >
            <div className="media-thumb">
              {m.thumbnail ? (
                <img src={m.thumbnail} alt="" draggable={false} />
              ) : (
                <span className="media-thumb-placeholder">
                  {m.status === 'loading' ? <span className="t-caption">Membaca…</span> : kindIcon(m.kind)}
                </span>
              )}
              {ready && m.kind !== 'image' && <span className="media-duration t-tick">{formatShort(m.duration)}</span>}
            </div>
            <span className="media-name">{m.name}</span>
            {m.status === 'error' && <span className="media-note media-note-error">{m.error}</span>}
            {ready && !m.exportable && <span className="media-note">Belum bisa diekspor di browser ini.</span>}
          </div>
        );
      })}
    </div>
  );
}

function TextPresets() {
  return (
    <div className="bin-section">
      <p className="t-caption">Klik untuk menambah teks di playhead, atau seret ke lajur Teks.</p>
      <div className="preset-list">
        {TEXT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="preset-card"
            draggable
            onClick={() => addTextClip(p.id)}
            onDragStart={(e) => startPayloadDrag(e, { kind: 'text', preset: p.id }, p.label)}
            onDragEnd={endPayloadDrag}
            aria-label={`Tambah ${p.label.toLowerCase()}`}
          >
            <span className={`preset-sample preset-${p.id}`}>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function EffectList() {
  const sample = useEditor((s) => s.media.find((m) => m.kind !== 'audio' && m.thumbnail)?.thumbnail ?? null);
  return (
    <div className="bin-section">
      <p className="t-caption">Efek berlaku untuk semua lapisan di bawahnya. Klik untuk menambah di playhead atau pada klip terpilih.</p>
      <div className="media-grid">
        {EFFECTS.map((fx) => (
          <button
            key={fx.id}
            type="button"
            className="media-card effect-card"
            draggable
            onClick={() => addEffectClip(fx.id)}
            onDragStart={(e) => startPayloadDrag(e, { kind: 'effect', effect: fx.id }, fx.label)}
            onDragEnd={endPayloadDrag}
            aria-label={`Tambah efek ${fx.label.toLowerCase()}`}
          >
            <span className="media-thumb">
              {sample ? (
                <>
                  <img src={sample} alt="" draggable={false} />
                  <img
                    src={sample}
                    alt=""
                    draggable={false}
                    className="effect-overlay"
                    style={{ filter: fx.filter(90), opacity: fx.mix }}
                  />
                </>
              ) : (
                <span className="media-thumb-placeholder">
                  <IconEffect size={18} />
                </span>
              )}
            </span>
            <span className="media-name">{fx.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function MediaBin() {
  const tab = useEditor((s) => s.leftTab);
  const setTab = useEditor((s) => s.setLeftTab);
  const media = useEditor((s) => s.media);
  const visual = media.filter((m) => m.kind !== 'audio');
  const audio = media.filter((m) => m.kind === 'audio');

  return (
    <div
      className="bin"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <Tabs idPrefix="bin" label="Panel media" items={TABS} value={tab} onChange={setTab} />
      <TabPanel idPrefix="bin" id={tab} className="bin-body">
        {tab === 'media' && (
          <>
            <Dropzone hint="Seret video atau gambar ke sini." />
            <YouTubeImport defaultFormat="mp4" />
            {visual.length > 0 && <MediaGrid items={visual} label="Video dan gambar" />}
          </>
        )}
        {tab === 'audio' && (
          <>
            <Dropzone hint="Seret musik atau rekaman suara ke sini." />
            <YouTubeImport defaultFormat="mp3" />
            {audio.length > 0 && <MediaGrid items={audio} label="Audio" />}
          </>
        )}
        {tab === 'text' && <TextPresets />}
        {tab === 'effect' && <EffectList />}
      </TabPanel>
    </div>
  );
}
