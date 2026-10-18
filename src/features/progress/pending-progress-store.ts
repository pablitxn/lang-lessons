import type { PracticeEvent } from '../../contracts';
import { parsePracticeEvent } from '../../foundation/progress-batch';

export interface ProgressScope { readonly userId: string; readonly sessionId: string }
export interface PendingProgressStore {
  enqueue(scope: ProgressScope, events: readonly PracticeEvent[]): Promise<void>;
  list(scope: ProgressScope): Promise<readonly PracticeEvent[]>;
  acknowledge(scope: ProgressScope, events: readonly PracticeEvent[]): Promise<void>;
}
export function progressFingerprint(event: PracticeEvent): string {
  const ref = event.ref;
  return JSON.stringify([event.schemaVersion, event.eventId, event.kind, event.source, event.trust,
    ref.sessionId, ref.exerciseId, ref.generation, ref.obligation, ref.attemptId, ref.revision,
    event.kind === 'attempt-result' ? event.result : null]);
}
export function validateProgressScope(scope: ProgressScope) {
  if (![scope.userId, scope.sessionId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f]/u.test(value))) {
    throw new Error('Invalid progress queue scope.');
  }
}
export function scopedEvents(scope: ProgressScope, events: readonly PracticeEvent[]): PracticeEvent[] {
  validateProgressScope(scope);
  if (!Array.isArray(events) || events.length < 1 || events.length > 100) throw new Error('Invalid progress batch.');
  return events.map(value => {
    const event = parsePracticeEvent(value);
    if (!event || event.ref.sessionId !== scope.sessionId) throw new Error('Invalid progress event or session.');
    return event;
  });
}

interface StoredEvent { order?: number; userId: string; sessionId: string; eventId: string; event: PracticeEvent }
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(new Error('Local progress storage request failed.'));
});

/** Queue contains only exact-schema client-reported events; authentication stays server-owned. */
export function createIndexedDbProgressStore(factory: IDBFactory = indexedDB, name = 'lang-lessons.pending-progress.v1'): PendingProgressStore & { pendingSessions(userId: string): Promise<readonly { sessionId: string; pending: number }[]>; close(): Promise<void> } {
  let opening: Promise<IDBDatabase> | undefined;
  function open() {
    if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
      const pending = factory.open(name, 1);
      let rejected = false;
      pending.onupgradeneeded = () => {
        const store = pending.result.createObjectStore('events', { keyPath: 'order', autoIncrement: true });
        store.createIndex('identity', ['userId', 'sessionId', 'eventId'], { unique: true });
        store.createIndex('scope', ['userId', 'sessionId']);
        store.createIndex('user', 'userId');
      };
      pending.onsuccess = () => {
        if (rejected) { pending.result.close(); return; }
        pending.result.onversionchange = () => { pending.result.close(); opening = undefined; };
        resolve(pending.result);
      };
      const fail = () => { rejected = true; opening = undefined; reject(new Error('Local progress storage is unavailable.')); };
      pending.onerror = fail; pending.onblocked = fail;
    });
    return opening;
  }
  async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction('events', mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => {}; // The abort handler reports a content-free error.
      tx.onabort = () => reject(new Error('Local progress transaction failed; pending work was retained.'));
      void work(tx.objectStore('events')).then(value => { result = value; }, () => {
        try { tx.abort(); } catch { reject(new Error('Local progress transaction failed.')); }
      });
    });
  }
  return {
    async enqueue(scope, input) {
      const events = scopedEvents(scope, input);
      await transaction('readwrite', async store => {
        for (const event of events) {
          const prior = await request(store.index('identity').get([scope.userId, scope.sessionId, event.eventId])) as StoredEvent | undefined;
          if (prior) {
            if (progressFingerprint(prior.event) !== progressFingerprint(event)) throw new Error('Conflicting local replay.');
          } else await request(store.add({ userId: scope.userId, sessionId: scope.sessionId, eventId: event.eventId, event } satisfies StoredEvent));
        }
      });
    },
    async list(scope) {
      validateProgressScope(scope);
      return transaction('readonly', async store => {
        const rows = await request(store.index('scope').getAll([scope.userId, scope.sessionId])) as StoredEvent[];
        return rows.map(row => scopedEvents(scope, [row.event])[0]!);
      });
    },
    async acknowledge(scope, input) {
      const events = scopedEvents(scope, input);
      await transaction('readwrite', async store => {
        for (const event of events) {
          const prior = await request(store.index('identity').get([scope.userId, scope.sessionId, event.eventId])) as StoredEvent | undefined;
          if (!prior) continue;
          if (progressFingerprint(prior.event) !== progressFingerprint(event) || prior.order === undefined) throw new Error('Conflicting acknowledgment.');
          await request(store.delete(prior.order));
        }
      });
    },
    async pendingSessions(userId) {
      validateProgressScope({ userId, sessionId: 'scope-query' });
      return transaction('readonly', async store => {
        const rows = await request(store.index('user').getAll(userId)) as StoredEvent[];
        const counts = new Map<string, number>();
        for (const row of rows) counts.set(row.sessionId, (counts.get(row.sessionId) ?? 0) + 1);
        return [...counts].map(([sessionId, pending]) => ({ sessionId, pending }));
      });
    },
    async close() { const database = await opening; database?.close(); opening = undefined; },
  };
}
