import type { PracticeEvent, ProgressBatchResult, ProgressFence } from '../contracts';
import { createIndexedDbProgressStore } from '../features/progress/pending-progress-store';
import { createIndexedDbWrittenUsageStore, type UsageReceipt, type WrittenObservation } from '../features/progress/written-usage-store';
import { createQueuedProgressSink } from '../features/progress/queued-progress-sink';
import { createP2WrittenUsageQueue } from '../features/progress/p2-adapter';
import { ProgressSyncStatus } from '../features/progress/ProgressSyncStatus';
import type { SessionProgressBinding } from './PersistedLesson';

/** One account/session binding; queues preserve their original identities across reloads. */
export async function createBrowserProgressBinding(options: {
  actorId: string; sessionId: string; isCurrentUser(): boolean;
  send(events: readonly PracticeEvent[]): Promise<ProgressBatchResult>;
  readFence(): Promise<ProgressFence>;
  usage: { openWrittenStream(sessionId: string): Promise<string>; written(row: WrittenObservation): Promise<UsageReceipt> };
}): Promise<SessionProgressBinding> {
  let active = true; let frozen = false;
  const scope = { userId: options.actorId, sessionId: options.sessionId };
  const store = createIndexedDbProgressStore();
  const usageStore = createIndexedDbWrittenUsageStore();
  const isCurrentUser = () => active && options.isCurrentUser();
  const queue = createQueuedProgressSink({ scope, store, isCurrentUser, send: options.send, readFence: options.readFence });
  let usage;
  try { usage = await createP2WrittenUsageQueue({ scope, store: usageStore, isCurrentUser, usage: options.usage }); }
  catch (error) { active = false; queue.deactivate(); await Promise.all([store.close(), usageStore.close()]); throw error; }
  const preparation = new Set<() => void>();
  const canWrite = () => isCurrentUser() && !frozen;
  return {
    sink: { submit: events => canWrite() ? queue.submit(events) : Promise.reject(new Error('Practice writes are frozen.')),
      flush: async () => { await usage.flush(); return queue.flush(); } },
    canWrite,
    freezeWrites() { frozen = true; for (const finish of preparation) finish(); },
    releasePreparation() { frozen = false; },
    writtenActivity: { canWrite, onObservation: kind => usage.record(kind),
      registerPreparation(finish) { preparation.add(finish); return () => { preparation.delete(finish); }; } },
    status: <><ProgressSyncStatus queue={queue} /><ProgressSyncStatus queue={usage} /></>,
    dispose() { active = false; queue.deactivate(); usage.deactivate(); preparation.clear();
      // Closing a handle never deletes persisted work. Pending transactions finish first.
      void Promise.allSettled([queue.flush(), usage.flush()]).then(() => Promise.all([store.close(), usageStore.close()])).catch(() => {});
    },
  };
}
