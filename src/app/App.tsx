import { useEffect } from 'react';
import './layout.css';
import { TopBar } from './TopBar';
import { NARROW_QUERY, useUi } from './uiState';
import { useEditor } from '../state/store';
import { MediaBin } from '../panels/MediaBin';
import { Stage } from '../panels/Stage';
import { Inspector } from '../panels/Inspector';
import { Timeline } from '../panels/Timeline';

/** Wilayah aria-live untuk mengumumkan hasil aksi (belah, hapus, impor, ekspor). */
function LiveRegion() {
  const announcement = useEditor((s) => s.announcement);
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      <span key={announcement.id}>{announcement.text}</span>
    </div>
  );
}

export function App() {
  const narrow = useUi((s) => s.narrow);
  const leftOpen = useUi((s) => s.leftOpen);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => useUi.getState().setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const cls = ['app', narrow && 'app-narrow', narrow && !leftOpen && 'app-left-closed'].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <TopBar />
      <main className="workspace">
        <aside id="panel-left" className="panel panel-left" aria-label="Media" hidden={narrow && !leftOpen}>
          <MediaBin />
        </aside>
        <section className="stage-area" aria-label="Pratinjau">
          <Stage />
        </section>
        <aside id="panel-right" className="panel panel-right" aria-label="Properti">
          <Inspector />
        </aside>
      </main>
      <section className="timeline-area" aria-label="Timeline">
        <Timeline />
      </section>
      <LiveRegion />
    </div>
  );
}
