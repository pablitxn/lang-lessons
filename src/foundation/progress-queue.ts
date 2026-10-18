import type { PracticeEvent, ProgressBatchResult, ProgressFence, ProgressSink } from '../contracts/progress';
import { MAX_PRACTICE_BATCH, parsePracticeEvent } from './progress-batch';

/** Session-local transport queue. Enqueue is synchronous, sends are incremental;
 * close flushes existing writes rather than starting persistence. No automatic retry or storage policy. */
export function createProgressQueue(sessionId: string, send: (events: readonly PracticeEvent[]) => Promise<ProgressBatchResult>) {
  let fence: ProgressFence = { sessionId, journalRevision: 0 };
  let tail: Promise<void> = Promise.resolve(); let frozen = false; let failure: Error | null = null;
  const pending = new Set<readonly PracticeEvent[]>();
  const sink: ProgressSink = {
    submit(input) {
      if (frozen || failure) return Promise.reject(failure ?? new Error('Practice writes are frozen'));
      const events = input.map(parsePracticeEvent);
      if (!events.length || events.length > MAX_PRACTICE_BATCH || events.some(event => !event || event.ref.sessionId !== sessionId)) {
        failure = new Error('Invalid practice batch'); return Promise.reject(failure);
      }
      const owned = events as PracticeEvent[]; pending.add(owned);
      const request = tail.then(async () => {
        if (failure) throw failure;
        const result = await send(owned);
        if (result.status !== 'committed') throw new Error('Practice batch was rejected');
        if (result.current.sessionId !== sessionId || !Number.isSafeInteger(result.current.journalRevision)
          || result.current.journalRevision < fence.journalRevision || result.acknowledgments.length !== owned.length
          || result.acknowledgments.some((ack, index) => ack.eventId !== owned[index]!.eventId
            || !['accepted', 'duplicate'].includes(ack.status) || !Number.isSafeInteger(ack.committedRevision)
            || ack.committedRevision < 1 || ack.committedRevision > result.current.journalRevision)) {
          throw new Error('Practice acknowledgment mismatch');
        }
        fence = { ...result.current }; pending.delete(owned); return result;
      }).catch(error => { failure = error instanceof Error ? error : new Error('Practice save failed'); throw failure; });
      // Keep the internal chain observed even when a feature abandons its promise.
      tail = request.then(() => {}, () => {});
      return request;
    },
    async flush() { await tail; if (failure || pending.size) throw failure ?? new Error('Practice writes remain pending'); return { ...fence }; },
  };
  return { sink, canWrite: () => !frozen && !failure,
    freezeWrites: () => { frozen = true; }, releasePreparation: () => { frozen = false; },
    inspect: () => ({ pendingBatches: pending.size, frozen, failed: Boolean(failure) }),
  };
}
