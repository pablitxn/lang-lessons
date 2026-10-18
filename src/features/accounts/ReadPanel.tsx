import { useEffect, useState, type ReactNode } from 'react';
import type { ReadResult } from './access';
import './accounts.css';

/** Callers key this panel by actor, grants and resource to discard prior data. */
export function ReadPanel<T>({ load, children }: { load: (signal: AbortSignal) => Promise<ReadResult<T>>; children: (value: T) => ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ loader: typeof load; result: ReadResult<T> | 'error' } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    void Promise.resolve().then(() => load(controller.signal)).then(result => {
      if (!controller.signal.aborted) setState({ loader: load, result });
    }, () => { if (!controller.signal.aborted) setState({ loader: load, result: 'error' }); });
    return () => controller.abort();
  }, [load, attempt]);
  const result = state?.loader === load ? state.result : null;
  if (!result) return <p role="status">Loading…</p>;
  if (result === 'error') return <div><p role="alert">Could not load this view.</p><button onClick={() => { setState(null); setAttempt(value => value + 1); }}>Try again</button></div>;
  if (result.status === 'denied') return <p role="alert">Access denied. Your permissions may have changed.</p>;
  return <>{children(result.value)}</>;
}
