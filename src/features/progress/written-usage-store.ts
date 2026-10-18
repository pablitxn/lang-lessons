import { validateProgressScope, type ProgressScope } from './pending-progress-store';

/** Exact P2 cc7e6c1 producer-local schema, awaiting shared promotion. No client time/total. */
export interface WrittenObservation {
  schemaVersion: 1; sessionId: string; streamId: string; eventId: string; sequence: number;
  kind: 'visible' | 'hidden' | 'input' | 'tap';
}
export interface UsageReceipt { eventId: string; sequence: number; intervalId: string | null; observedAt: string; status: 'recorded' | 'duplicate' }
export interface WrittenUsageStore {
  append(scope: ProgressScope, streamId: string, eventId: string, kind: WrittenObservation['kind']): Promise<WrittenObservation>;
  list(scope: ProgressScope): Promise<readonly WrittenObservation[]>;
  acknowledge(scope: ProgressScope, row: WrittenObservation): Promise<void>;
}
export function validateWrittenObservation(scope: ProgressScope, row: WrittenObservation): WrittenObservation {
  const keys = ['schemaVersion', 'sessionId', 'streamId', 'eventId', 'sequence', 'kind'];
  if (!row || typeof row !== 'object' || Object.keys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))
    || row.schemaVersion !== 1 || row.sessionId !== scope.sessionId || !Number.isSafeInteger(row.sequence) || row.sequence < 1
    || !['visible', 'hidden', 'input', 'tap'].includes(row.kind)) throw new Error('Invalid stored usage observation.');
  validateProgressScope(scope); validateProgressScope({ userId: row.streamId, sessionId: row.eventId });
  return { schemaVersion: 1, sessionId: row.sessionId, streamId: row.streamId, eventId: row.eventId, sequence: row.sequence, kind: row.kind };
}
interface StreamQueue extends ProgressScope { streamId: string; sequence: number; pending: WrittenObservation[] }
const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new Error('Local usage storage failed.'));
});
export function createIndexedDbWrittenUsageStore(factory: IDBFactory = indexedDB, name = 'lang-lessons.pending-written-usage.v1'): WrittenUsageStore & { pendingSessions(userId: string): Promise<readonly { sessionId: string; pending: number }[]>; close(): Promise<void> } {
  let database: Promise<IDBDatabase> | undefined;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const req = factory.open(name, 1); let failed = false;
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore('streams', { keyPath: ['userId', 'sessionId', 'streamId'] });
        store.createIndex('scope', ['userId', 'sessionId']);
        store.createIndex('user', 'userId');
      };
      req.onsuccess = () => { if (failed) { req.result.close(); return; } req.result.onversionchange = () => { req.result.close(); database = undefined; }; resolve(req.result); };
      const fail = () => { failed = true; database = undefined; reject(new Error('Local usage storage unavailable.')); };
      req.onerror = fail; req.onblocked = fail;
    });
    return database;
  }
  async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('streams', mode); let result: T;
      tx.oncomplete = () => resolve(result); tx.onerror = () => {};
      tx.onabort = () => reject(new Error('Usage storage transaction failed; pending observations retained.'));
      void work(tx.objectStore('streams')).then(value => { result = value; }, () => { try { tx.abort(); } catch { reject(new Error('Usage storage transaction failed.')); } });
    });
  }
  return {
    async append(scope, streamId, eventId, kind) {
      validateProgressScope(scope); validateProgressScope({ userId: streamId, sessionId: eventId });
      if (!['visible', 'hidden', 'input', 'tap'].includes(kind)) throw new Error('Invalid written observation kind.');
      return transaction('readwrite', async store => {
        const key = [scope.userId, scope.sessionId, streamId];
        const current = await request(store.get(key)) as StreamQueue | undefined;
        const stream = current ?? { ...scope, streamId, sequence: 0, pending: [] };
        const duplicate = stream.pending.find(row => row.eventId === eventId);
        if (duplicate) { if (duplicate.kind !== kind) throw new Error('Conflicting usage replay.'); return validateWrittenObservation(scope, duplicate); }
        const row: WrittenObservation = { schemaVersion: 1, sessionId: scope.sessionId, streamId, eventId, sequence: stream.sequence + 1, kind };
        if (!Number.isSafeInteger(row.sequence)) throw new Error('Usage sequence exhausted.');
        stream.sequence = row.sequence; stream.pending.push(row); await request(store.put(stream)); return row;
      });
    },
    async list(scope) {
      validateProgressScope(scope);
      return transaction('readonly', async store => {
        const streams = await request(store.index('scope').getAll([scope.userId, scope.sessionId])) as StreamQueue[];
        return streams.flatMap(stream => [...stream.pending].sort((a, b) => a.sequence - b.sequence)).map(row => validateWrittenObservation(scope, row));
      });
    },
    async acknowledge(scope, row) {
      validateProgressScope(scope);
      validateWrittenObservation(scope, row);
      if (row.sessionId !== scope.sessionId) throw new Error('Usage scope mismatch.');
      await transaction('readwrite', async store => {
        const stream = await request(store.get([scope.userId, scope.sessionId, row.streamId])) as StreamQueue | undefined;
        if (!stream) return;
        const pending = stream.pending.find(item => item.eventId === row.eventId);
        if (pending && (pending.sequence !== row.sequence || pending.kind !== row.kind)) throw new Error('Conflicting usage receipt.');
        stream.pending = stream.pending.filter(item => item.eventId !== row.eventId);
        await request(store.put(stream));
      });
    },
    async pendingSessions(userId) {
      validateProgressScope({ userId, sessionId: 'scope-query' });
      return transaction('readonly', async store => {
        const streams = await request(store.index('user').getAll(userId)) as StreamQueue[];
        const counts = new Map<string, number>();
        for (const stream of streams) if (stream.pending.length) counts.set(stream.sessionId, (counts.get(stream.sessionId) ?? 0) + stream.pending.length);
        return [...counts].map(([sessionId, pending]) => ({ sessionId, pending }));
      });
    },
    async close() { const db = await database; db?.close(); database = undefined; },
  };
}
