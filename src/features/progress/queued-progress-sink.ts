import type { PracticeEvent, PracticeEventAck, ProgressBatchResult, ProgressFence, ProgressSink } from '../../contracts';
import { scopedEvents, validateProgressScope, type PendingProgressStore, type ProgressScope } from './pending-progress-store';

export interface ProgressQueueStatus {
  readonly phase: 'loading' | 'idle' | 'pending' | 'syncing' | 'error' | 'inactive';
  readonly pending: number;
  readonly unsaved: number;
  readonly error: 'local-write' | 'transport' | 'server-rejected' | 'invalid-receipt' | 'identity-changed' | null;
}

/** The supplied transport derives actor authority from the authenticated server session. */
export function createQueuedProgressSink(options: {
  scope: ProgressScope;
  store: PendingProgressStore;
  isCurrentUser: () => boolean;
  send: (events: readonly PracticeEvent[]) => Promise<ProgressBatchResult>;
  readFence: () => Promise<ProgressFence>;
}): ProgressSink & { getSnapshot(): ProgressQueueStatus; subscribe(listener: () => void): () => void; deactivate(): void } {
  validateProgressScope(options.scope);
  const scope = { ...options.scope };
  const stages: PracticeEvent[][] = [];
  const receipts = new Map<string, PracticeEventAck>();
  const listeners = new Set<() => void>();
  let disabled = false;
  let work: Promise<unknown> = Promise.resolve();
  let localWrites: Promise<void> = Promise.resolve();
  let enqueueRevision = 0;
  let state: ProgressQueueStatus = { phase: 'loading', pending: 0, unsaved: 0, error: null };
  const unsaved = () => stages.reduce((count, batch) => count + batch.length, 0);
  function publish(patch: Partial<ProgressQueueStatus>) {
    state = Object.freeze({ ...state, ...patch, unsaved: unsaved() });
    for (const listener of listeners) listener();
  }
  function fail(error: NonNullable<ProgressQueueStatus['error']>): never {
    publish({ phase: error === 'identity-changed' ? 'inactive' : 'error', error });
    throw new Error(`Progress sync failed: ${error}. Pending work has not been discarded.`);
  }
  function current() { if (disabled || !options.isCurrentUser()) fail('identity-changed'); }
  function fence(value: ProgressFence) {
    if (!value || value.sessionId !== scope.sessionId || !Number.isSafeInteger(value.journalRevision) || value.journalRevision < 0) fail('invalid-receipt');
    return { sessionId: value.sessionId, journalRevision: value.journalRevision };
  }
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = work.then(operation);
    work = result.catch(() => {});
    return result;
  }
  // Local transactions must never wait for an unresolved remote request.
  function persist(): Promise<void> {
    const saved = localWrites.then(async () => {
      while (stages.length) {
        try { await options.store.enqueue(scope, stages[0]!); }
        catch { fail('local-write'); }
        stages.shift();
        let pending: number;
        try { pending = (await options.store.list(scope)).length; } catch { fail('local-write'); }
        publish({ pending, phase: disabled || !options.isCurrentUser() ? 'inactive' : 'pending' });
      }
    });
    localWrites = saved.catch(() => {});
    return saved;
  }
  async function drain(): Promise<ProgressFence> {
    // Persist captured work even when logout happened meanwhile; never send it as another user.
    await persist(); current(); publish({ phase: 'syncing', error: null });
    for (;;) {
      await persist();
      const observedEnqueueRevision = enqueueRevision;
      let pending: readonly PracticeEvent[];
      try { pending = await options.store.list(scope); } catch { fail('local-write'); }
      publish({ pending: pending.length }); current();
      if (!pending.length) {
        let value: ProgressFence;
        try { value = await options.readFence(); } catch { fail('transport'); }
        current();
        const finalFence = fence(value);
        if (stages.length || enqueueRevision !== observedEnqueueRevision) continue;
        publish({ phase: 'idle', pending: 0, error: null }); return finalFence;
      }
      const batch = pending.slice(0, 100);
      let result: ProgressBatchResult;
      try { result = await options.send(batch); } catch { fail('transport'); }
      current();
      if (result?.status === 'rejected') fail('server-rejected');
      if (result?.status !== 'committed' || !Array.isArray(result.acknowledgments)) fail('invalid-receipt');
      const latest = fence(result.current);
      const acknowledgments = result.acknowledgments;
      if (acknowledgments.some(ack => !ack || typeof ack !== 'object')) fail('invalid-receipt');
      if (acknowledgments.length !== batch.length || new Set(acknowledgments.map(ack => ack.eventId)).size !== batch.length
        || batch.some(event => !acknowledgments.some(ack => ack.eventId === event.eventId
          && (ack.status === 'accepted' || ack.status === 'duplicate')
          && Number.isSafeInteger(ack.committedRevision) && ack.committedRevision >= 1 && ack.committedRevision <= latest.journalRevision))) fail('invalid-receipt');
      try { await options.store.acknowledge(scope, batch); } catch { fail('local-write'); }
      for (const ack of acknowledgments) receipts.set(ack.eventId, { eventId: ack.eventId, status: ack.status, committedRevision: ack.committedRevision });
    }
  }
  // Hydrate the count for recovery UI without causing a transport request.
  void serialize(async () => {
    try { const pending = (await options.store.list(scope)).length; publish({ pending, phase: disabled || !options.isCurrentUser() ? 'inactive' : pending || unsaved() ? 'pending' : 'idle' }); }
    catch { publish({ phase: 'error', error: 'local-write' }); }
  });
  return {
    submit(input) {
      if (disabled || !options.isCurrentUser()) return Promise.reject(new Error('Progress session is inactive.'));
      const batch = scopedEvents(scope, input); stages.push(batch); enqueueRevision++;
      publish({ phase: 'pending', error: null });
      const saved = persist();
      return saved.then(() => serialize(async () => {
        let currentFence = await drain();
        // Another tab may have acknowledged and removed our rows. Replay unchanged IDs
        // once to obtain this caller's receipts; the server returns duplicates.
        if (batch.some(event => !receipts.has(event.eventId))) {
          stages.push(batch); enqueueRevision++; currentFence = await drain();
        }
        const acknowledgments = batch.map(event => receipts.get(event.eventId));
        if (acknowledgments.some(ack => !ack)) fail('invalid-receipt');
        return { status: 'committed' as const, acknowledgments: acknowledgments as PracticeEventAck[], current: currentFence };
      }));
    },
    flush: () => persist().then(() => serialize(drain)),
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    deactivate() { disabled = true; publish({ phase: 'inactive', error: 'identity-changed' }); },
  };
}
