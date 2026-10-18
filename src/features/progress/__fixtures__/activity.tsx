import { createRoot } from 'react-dom/client';
import { useWrittenActivity, type WrittenActivityBinding } from '../use-written-activity';
import type { WrittenActivityInterval } from '../written-activity';

declare global { interface Window { p5Activity: { intervals: WrittenActivityInterval[]; finish: () => void; writable: boolean } } }
window.p5Activity = { intervals: [], finish: () => {}, writable: true };
const binding: WrittenActivityBinding = {
  onInterval: row => window.p5Activity.intervals.push(row),
  canWrite: () => window.p5Activity.writable,
  registerPreparation: finish => { window.p5Activity.finish = finish; return () => { window.p5Activity.finish = () => {}; }; },
};
function Fixture() {
  const ref = useWrittenActivity('fixture-session', binding);
  return <div ref={ref}><h1>Written activity fixture</h1><p>Local test observations only; no account or network transport.</p><input aria-label="Written activity input" /></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
