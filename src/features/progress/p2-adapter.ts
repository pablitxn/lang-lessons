import type { PracticeEvent, ProgressBatchResult, ProgressFence, SessionSnapshot } from '../../contracts';
import { createQueuedProgressSink } from './queued-progress-sink';
import { validateProgressScope, type PendingProgressStore, type ProgressScope } from './pending-progress-store';

/** Structural client ports match P2 cc7e6c1; root owns authenticated HTTP mapping. */
export function createP2ProgressSink(options: {
  scope: ProgressScope;
  store: PendingProgressStore;
  isCurrentUser: () => boolean;
  learning: { submit(sessionId: string, events: readonly PracticeEvent[]): Promise<ProgressBatchResult> };
  recovery: { read(sessionId: string): Promise<{ session: SessionSnapshot; progress: ProgressFence }> };
}) {
  const scope = { ...options.scope };
  return createQueuedProgressSink({ scope, store: options.store, isCurrentUser: options.isCurrentUser,
    send: events => options.learning.submit(scope.sessionId, events),
    readFence: async () => {
      const snapshot = await options.recovery.read(scope.sessionId);
      if (snapshot.session.sessionId !== scope.sessionId || snapshot.progress.sessionId !== scope.sessionId) {
        throw new Error('Recovery returned a different exercise session.');
      }
      // Never substitute the lifecycle revision for the independent progress journal fence.
      return snapshot.progress;
    },
  });
}

/** Explicit root action only. Stream creation has no invented idempotency or automatic retry. */
export async function createP2WrittenUsageQueue(options: {
  scope: ProgressScope;
  store: import('./written-usage-store').WrittenUsageStore;
  isCurrentUser: () => boolean;
  usage: {
    openWrittenStream(sessionId: string): Promise<string>;
    written(row: import('./written-usage-store').WrittenObservation): Promise<import('./written-usage-store').UsageReceipt>;
  };
}) {
  const scope = { ...options.scope }; validateProgressScope(scope);
  if (!options.isCurrentUser()) throw new Error('Written activity account is inactive.');
  const streamId = await options.usage.openWrittenStream(scope.sessionId);
  if (!options.isCurrentUser()) throw new Error('Written activity account changed during stream creation.');
  validateProgressScope({ userId: streamId, sessionId: scope.sessionId });
  const { createWrittenUsageQueue } = await import('./written-usage-queue');
  return createWrittenUsageQueue({ scope, streamId, store: options.store, isCurrentUser: options.isCurrentUser,
    written: row => options.usage.written(row) });
}
