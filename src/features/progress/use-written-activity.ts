import { useEffect, useRef } from 'react';
import type { WrittenObservation } from './written-usage-store';

/** P2 producer-local schema; the integrator owns promotion and authenticated HTTP routing. */
export interface WrittenActivityBinding {
  onObservation: (kind: WrittenObservation['kind']) => void | Promise<void>;
  canWrite: () => boolean;
  /** Root calls this before flushing usage and progress, then submitting close. */
  registerPreparation: (finish: () => void) => () => void;
}

/** Sends only transitions/interaction kinds. P2 computes intervals from its database clock. */
export function useWrittenActivity(sessionId: string, binding: WrittenActivityBinding | undefined) {
  const element = useRef<HTMLDivElement>(null);
  const latest = useRef(binding); latest.current = binding;
  const enabled = binding !== undefined;
  useEffect(() => {
    const node = element.current;
    if (!enabled || !node) return;
    const initialBinding = latest.current!;
    let intersects = false; let reportedVisible = false; let preparing = false;
    function emit(kind: WrittenObservation['kind']) {
      // The queue exposes its own honest error/pending state; avoid an unhandled event-handler rejection.
      try { void Promise.resolve((latest.current ?? initialBinding).onObservation(kind)).catch(() => {}); } catch { /* Receiver owns error state. */ }
    }
    function visibility() {
      const visible = !preparing && intersects && document.visibilityState === 'visible';
      if (visible === reportedVisible) return;
      reportedVisible = visible; emit(visible ? 'visible' : 'hidden');
    }
    const observer = new IntersectionObserver(entries => {
      intersects = entries.some(entry => entry.target === node && entry.isIntersecting); visibility();
    });
    observer.observe(node);
    const interaction = (event: Event) => {
      if (!event.isTrusted || !latest.current?.canWrite() || !intersects || document.visibilityState !== 'visible') return;
      if (preparing) { preparing = false; visibility(); }
      if (reportedVisible) emit(event.type === 'input' ? 'input' : 'tap');
    };
    const finish = () => { preparing = true; visibility(); };
    node.addEventListener('input', interaction); node.addEventListener('pointerdown', interaction);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', finish); window.addEventListener('pageshow', visibility);
    const release = initialBinding.registerPreparation(finish);
    return () => {
      release(); observer.disconnect();
      node.removeEventListener('input', interaction); node.removeEventListener('pointerdown', interaction);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', finish); window.removeEventListener('pageshow', visibility);
      finish();
    };
  }, [sessionId, enabled]);
  return element;
}
