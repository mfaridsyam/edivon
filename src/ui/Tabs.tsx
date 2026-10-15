import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabsProps<T extends string> {
  /** Awalan id unik untuk menautkan tab dan panelnya. */
  idPrefix: string;
  label: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
}

export function tabId(prefix: string, id: string) {
  return `${prefix}-tab-${id}`;
}

export function tabPanelId(prefix: string, id: string) {
  return `${prefix}-panel-${id}`;
}

/** Tab 36px dengan role="tablist". Panah kiri/kanan, Home, dan End berpindah tab. */
export function Tabs<T extends string>({ idPrefix, label, items, value, onChange }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = (id: T) => {
    onChange(id);
    const el = listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(idPrefix, id))}`);
    el?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((t) => t.id === value);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    const item = items[next];
    if (item) focusTab(item.id);
  };

  return (
    <div ref={listRef} className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            id={tabId(idPrefix, t.id)}
            type="button"
            role="tab"
            className="tab"
            aria-selected={selected}
            aria-controls={selected ? tabPanelId(idPrefix, t.id) : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  idPrefix: string;
  id: string;
  className?: string;
  children: ReactNode;
}

export function TabPanel({ idPrefix, id, className, children }: TabPanelProps) {
  return (
    <div
      id={tabPanelId(idPrefix, id)}
      role="tabpanel"
      aria-labelledby={tabId(idPrefix, id)}
      className={['tab-panel', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
