import { createBrowserWrittenPractice } from './browser-written-practice';
import type { LearningLanguage, LessonMode, PracticeEvent, ProgressBatchResult, ProgressFence } from '../contracts';
import { createIndexedDbProgressStore } from '../features/progress/pending-progress-store';
import { createIndexedDbWrittenUsageStore, type UsageReceipt, type WrittenObservation } from '../features/progress/written-usage-store';
import { createQueuedProgressSink } from '../features/progress/queued-progress-sink';
import { createP2WrittenUsageQueue } from '../features/progress/p2-adapter';
import { ProgressSyncStatus } from '../features/progress/ProgressSyncStatus';
import type { SessionProgressBinding } from './PersistedLesson';

/** One account/session binding; queues preserve their original identities across reloads. */
export async function createBrowserProgressBinding(options: {
  actorId: string; sessionId: string; language?: LearningLanguage; mode?: LessonMode; isCurrentUser(): boolean;
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
  let usage; let written: Awaited<ReturnType<typeof createBrowserWrittenPractice>> | undefined;
  try {
    if (options.mode) written = await createBrowserWrittenPractice({ userId: options.actorId, sessionId: options.sessionId, mode: options.mode, language: options.language ?? 'en', isCurrent: isCurrentUser });
    usage = await createP2WrittenUsageQueue({ scope, store: usageStore, isCurrentUser, usage: options.usage }); }
  catch (error) { written?.dispose(); active = false; queue.deactivate(); await Promise.all([store.close(), usageStore.close()]); throw error; }
  const preparation = new Set<() => void>();
  const canWrite = () => isCurrentUser() && !frozen && (written?.canWrite() ?? true);
  return {
    sink: { submit: events => canWrite() ? queue.submit(written?.mapNewEvents(events) ?? events) : Promise.reject(new Error('Practice writes are frozen.')),
      flush: async () => { await written?.flush(); await usage.flush(); return queue.flush(); } },
    ...(written ? { writtenPractice: written.binding } : {}),
    canWrite,
    freezeWrites() { frozen = true; for (const finish of preparation) finish(); },
    releasePreparation() { frozen = false; },
    writtenActivity: { canWrite, onObservation: kind => usage.record(kind),
      registerPreparation(finish) { preparation.add(finish); return () => { preparation.delete(finish); }; } },
    status: <>{written?.status}<ProgressSyncStatus queue={queue} /><ProgressSyncStatus queue={usage} /></>,
    dispose() { written?.dispose(); active = false; queue.deactivate(); usage.deactivate(); preparation.clear();
      // Closing a handle never deletes persisted work. Pending transactions finish first.
      void Promise.allSettled([queue.flush(), usage.flush()]).then(() => Promise.all([store.close(), usageStore.close()])).catch(() => {});
    },
  };
}
