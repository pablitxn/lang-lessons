import { useEffect, useRef } from 'react';
import { browserActivityClock, createWrittenActivity, type WrittenActivityInterval } from './written-activity';

/** Temporary feature seam pending the integration-owned interval contract. */
export interface WrittenActivityBinding {
  /** Synchronously enqueue the immutable observation; persistence remains root-owned. */
  onInterval: (interval: WrittenActivityInterval) => void;
  /** The same root preparation gate used for practice writes. */
  canWrite: () => boolean;
  /** Root invokes finish before flushing time observations during explicit exit. */
  registerPreparation: (finish: () => void) => () => void;
}

/** No tracking/observer/timer starts without an explicitly injected receiver. */
export function useWrittenActivity(sessionId: string, binding: WrittenActivityBinding | undefined) {
  const element = useRef<HTMLDivElement>(null);
  const latest = useRef(binding); latest.current = binding;
  const enabled = binding !== undefined;
  useEffect(() => {
    const node = element.current;
    if (!enabled || !node) return;
    const initialBinding = latest.current!;
    const tracker = createWrittenActivity({ sessionId, windowId: crypto.randomUUID(), clock: browserActivityClock,
      onInterval: interval => (latest.current ?? initialBinding).onInterval(interval) });
    let intersects = false;
    const visibility = () => tracker.setVisible(intersects && document.visibilityState === 'visible');
    const observer = new IntersectionObserver(entries => {
      intersects = entries.some(entry => entry.target === node && entry.isIntersecting);
      visibility();
    });
    observer.observe(node);
    const interaction = (event: Event) => { if (event.isTrusted && latest.current?.canWrite()) tracker.interact(); };
    const hide = () => tracker.setVisible(false);
    node.addEventListener('input', interaction);
    node.addEventListener('pointerdown', interaction);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    const release = latest.current!.registerPreparation(tracker.finish);
    return () => {
      release(); observer.disconnect();
      node.removeEventListener('input', interaction); node.removeEventListener('pointerdown', interaction);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', visibility);
      tracker.dispose();
    };
  }, [sessionId, enabled]);
  return element;
}
