import { useSyncExternalStore } from 'react';
import type { ProgressQueueStatus } from './queued-progress-sink';

export function ProgressSyncStatus({ queue }: { queue: {
  getSnapshot(): ProgressQueueStatus;
  subscribe(listener: () => void): () => void;
  flush(): Promise<unknown>;
} }) {
  const status = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  if (status.phase === 'idle') return null;
  return <section aria-label="Progress synchronization">
    <p role="status">{status.phase === 'loading' ? "Checking this account’s pending progress on this device." : status.unsaved > 0
      ? `${status.unsaved} progress events have not been saved on this device. Keep this page open to retry.`
      : status.error === 'local-write'
        ? 'Local progress storage could not be read or updated. Pending data has not been discarded.'
      : status.phase === 'inactive'
        ? 'Pending progress remains associated with the previous account. Sign in to that account to synchronize it.'
        : status.phase === 'error'
          ? `${status.pending} progress events remain pending on this device. Synchronization has not completed.`
          : `${status.pending + status.unsaved} progress events are waiting for server acknowledgment.`}</p>
    {status.phase === 'error' && <button type="button" className="ll-button" onClick={() => { void queue.flush().catch(() => {}); }}>Retry progress sync</button>}
  </section>;
}
