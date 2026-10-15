import './timeline/timeline.css';
import { useEditor } from '../state/store';
import { Toolbar } from './Toolbar';
import { TimelineBody } from './timeline/TimelineBody';

export function Timeline() {
  const tool = useEditor((s) => s.tool);
  return (
    <div className={`timeline tool-${tool}`}>
      <Toolbar />
      <TimelineBody />
    </div>
  );
}
