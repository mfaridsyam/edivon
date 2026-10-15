import './layout.css';
import { TopBar } from './TopBar';
import { MediaBin } from '../panels/MediaBin';
import { Stage } from '../panels/Stage';
import { Inspector } from '../panels/Inspector';
import { Timeline } from '../panels/Timeline';

export function App() {
  return (
    <div className="app">
      <TopBar />
      <main className="workspace">
        <aside className="panel panel-left" aria-label="Media">
          <MediaBin />
        </aside>
        <section className="stage-area" aria-label="Pratinjau">
          <Stage />
        </section>
        <aside className="panel panel-right" aria-label="Properti">
          <Inspector />
        </aside>
      </main>
      <section className="timeline-area" aria-label="Timeline">
        <Timeline />
      </section>
    </div>
  );
}
