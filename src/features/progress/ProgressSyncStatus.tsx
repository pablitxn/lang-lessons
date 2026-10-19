import { useSyncExternalStore } from 'react';
import type { ProgressQueueStatus } from './queued-progress-sink';

export function ProgressSyncStatus({ queue }: { queue: {
  getSnapshot(): ProgressQueueStatus;
  subscribe(listener: () => void): () => void;
  flush(): Promise<unknown>;
} }) {
  const status = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  if (status.phase !== 'error' && status.phase !== 'inactive') return null;
  return <section aria-label="Progress synchronization">
    <p role="status">{status.error === 'local-write'
      ? 'Your progress could not be saved on this device. Keep this lesson open and try again.'
      : status.phase === 'inactive'
        ? 'Sign in to the original account to finish saving this practice.'
        : 'Your progress could not be synced. Please try again.'}</p>
    {status.phase === 'error' && <button type="button" className="ll-button" onClick={() => { void queue.flush().catch(() => {}); }}>Retry saving</button>}
  </section>;
}
