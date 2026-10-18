import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueuedProgressSink } from '../src/features/progress/queued-progress-sink';
import { progressFingerprint, type PendingProgressStore, type ProgressScope } from '../src/features/progress/pending-progress-store';
import { applyProgressBatch, emptyProgressJournal } from '../src/foundation/progress-batch';
import type { PracticeEvent } from '../src/contracts';

const scope = { userId: 'user-a', sessionId: 'session' };
const event = (revision = 1): PracticeEvent => ({ schemaVersion: 1, kind: 'attempt-result', eventId: `event-${revision}`, source: 'typed', trust: 'client-reported', result: 'accepted',
  ref: { sessionId: 'session', exerciseId: 'exercise', generation: 1, obligation: 'spelling:past', attemptId: `attempt-${revision}`, revision } });
class MemoryStore implements PendingProgressStore {
  readonly rows = new Map<string, PracticeEvent>(); failWrite = false;
  key(scope: ProgressScope, id: string) { return JSON.stringify([scope.userId, scope.sessionId, id]); }
  async enqueue(scope: ProgressScope, events: readonly PracticeEvent[]) {
    if (this.failWrite) throw new Error('Fixture disk failure');
    const next = new Map(this.rows);
    for (const item of events) {
      const key = this.key(scope, item.eventId); const old = next.get(key);
      if (old && progressFingerprint(old) !== progressFingerprint(item)) throw new Error('Conflict');
      next.set(key, structuredClone(item));
    }
    this.rows.clear(); for (const [key, item] of next) this.rows.set(key, item);
  }
  async list(scope: ProgressScope) { return [...this.rows].filter(([key]) => { const parts = JSON.parse(key); return parts[0] === scope.userId && parts[1] === scope.sessionId; }).map(([, item]) => structuredClone(item)); }
  async acknowledge(scope: ProgressScope, events: readonly PracticeEvent[]) {
    if (this.failWrite) throw new Error('Fixture disk failure');
    for (const item of events) {
      const key = this.key(scope, item.eventId); const old = this.rows.get(key);
      if (old && progressFingerprint(old) !== progressFingerprint(item)) throw new Error('Conflict');
      this.rows.delete(key);
    }
  }
}
function server() {
  let journal = emptyProgressJournal('session'); let loseReply = false; let requests = 0;
  return {
    send: async (events: readonly PracticeEvent[]) => { requests++; const applied = applyProgressBatch(journal, events); journal = applied.state;
      if (loseReply) { loseReply = false; throw new Error('Lost reply after server commit'); } return applied.result; },
    readFence: async () => ({ sessionId: 'session', journalRevision: journal.revision }),
    loseNextReply: () => { loseReply = true; }, revision: () => journal.revision, requests: () => requests,
  };
}
test('reload replays an interrupted committed write with identical ID and duplicate receipt', async () => {
  const store = new MemoryStore(); const remote = server(); remote.loseNextReply();
  const first = createQueuedProgressSink({ scope, store, isCurrentUser: () => true, ...remote });
  await assert.rejects(first.submit([event()]));
  assert.equal(remote.revision(), 1); assert.equal((await store.list(scope)).length, 1);
  assert.equal(first.getSnapshot().phase, 'error'); first.deactivate();
  const reloaded = createQueuedProgressSink({ scope, store, isCurrentUser: () => true, ...remote });
  assert.deepEqual(await reloaded.flush(), { sessionId: 'session', journalRevision: 1 });
  assert.equal(remote.revision(), 1); assert.equal(remote.requests(), 2);
  assert.equal((await store.list(scope)).length, 0); assert.equal(reloaded.getSnapshot().phase, 'idle');
});
test('failed local persistence retains an unsaved event in memory and explicit retry persists before sending', async () => {
  const store = new MemoryStore(); store.failWrite = true; const remote = server();
  const sink = createQueuedProgressSink({ scope, store, isCurrentUser: () => true, ...remote });
  await assert.rejects(sink.submit([event()]));
  assert.equal(remote.requests(), 0); assert.equal(sink.getSnapshot().unsaved, 1); assert.equal(sink.getSnapshot().error, 'local-write');
  store.failWrite = false; await sink.flush();
  assert.equal(sink.getSnapshot().unsaved, 0); assert.equal(remote.revision(), 1);
});
test('user/session partitions and logout fence prevent replay or deletion under a different user', async () => {
  const store = new MemoryStore(); const remote = server();
  await store.enqueue(scope, [event()]);
  await store.enqueue({ userId: 'user-b', sessionId: 'session' }, [event()]);
  const otherSession = { userId: 'user-a', sessionId: 'other' };
  await store.enqueue(otherSession, [{ ...event(), ref: { ...event().ref, sessionId: 'other' } }]);
  let current = true;
  const sink = createQueuedProgressSink({ scope, store, isCurrentUser: () => current, readFence: remote.readFence,
    send: async events => { const result = await remote.send(events); current = false; return result; } });
  await assert.rejects(sink.flush());
  assert.equal((await store.list(scope)).length, 1); assert.equal(sink.getSnapshot().phase, 'inactive');
  assert.equal((await store.list({ userId: 'user-b', sessionId: 'session' })).length, 1);
  assert.equal((await store.list(otherSession)).length, 1);
  await assert.rejects(sink.submit([event(2)]));
});
test('partial or forged acknowledgments retain pending rows and reject flush', async () => {
  const store = new MemoryStore();
  const sink = createQueuedProgressSink({ scope, store, isCurrentUser: () => true,
    send: async () => ({ status: 'committed', acknowledgments: [], current: { sessionId: 'session', journalRevision: 99 } }),
    readFence: async () => ({ sessionId: 'session', journalRevision: 99 }) });
  await assert.rejects(sink.submit([event()]));
  assert.equal((await store.list(scope)).length, 1); assert.equal(sink.getSnapshot().error, 'invalid-receipt');
});
test('concurrent submit and no-call flush include every queued event and never create a tutor operation', async () => {
  const store = new MemoryStore(); const remote = server();
  const sink = createQueuedProgressSink({ scope, store, isCurrentUser: () => true, ...remote });
  const first = sink.submit([event()]); const second = sink.submit([event(2)]); const closing = sink.flush();
  const results = await Promise.all([first, second]);
  assert.ok(results.every(result => result.status === 'committed'));
  assert.deepEqual(await closing, { sessionId: 'session', journalRevision: 2 });
  assert.equal((await store.list(scope)).length, 0);
});
test('strict queue schema excludes raw answers, transcripts and wrong-session events', () => {
  const sink = createQueuedProgressSink({ scope, store: new MemoryStore(), isCurrentUser: () => true, ...server() });
  assert.throws(() => sink.submit([{ ...event(), transcript: 'private' } as unknown as PracticeEvent]), /Invalid progress/);
  assert.throws(() => sink.submit([{ ...event(), ref: { ...event().ref, sessionId: 'other' } }]), /session/);
});
test('failed local acknowledgment deletion retains the durable pending row until duplicate replay succeeds', async () => {
  const store = new MemoryStore(); const remote = server(); let failDeletion = true;
  const sink = createQueuedProgressSink({ scope, store, isCurrentUser: () => true, readFence: remote.readFence,
    send: async events => { const result = await remote.send(events); if (failDeletion) store.failWrite = true; return result; } });
  await assert.rejects(sink.submit([event()]));
  assert.equal(remote.revision(), 1); assert.equal((await store.list(scope)).length, 1);
  store.failWrite = false; failDeletion = false; await sink.flush();
  assert.equal(remote.revision(), 1); assert.equal((await store.list(scope)).length, 0);
});
test('local append during a held canonical fence is durable and included before flush acknowledgment', async () => {
  const store = new MemoryStore(); const remote = server();
  let release!: () => void; let fenceStarted!: () => void;
  const started = new Promise<void>(resolve => { fenceStarted = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; }); let holdFirst = true;
  const sink = createQueuedProgressSink({ scope, store, isCurrentUser: () => true, send: remote.send,
    readFence: async () => { const value = await remote.readFence(); if (holdFirst) { holdFirst = false; fenceStarted(); await held; } return value; } });
  const first = sink.submit([event()]); await started;
  let secondAcknowledged = false;
  const second = sink.submit([event(2)]).then(result => { secondAcknowledged = true; return result; });
  for (let i = 0; i < 100 && !(await store.list(scope)).some(row => row.eventId === 'event-2'); i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual((await store.list(scope)).map(row => row.eventId), ['event-2']);
  assert.equal(secondAcknowledged, false); assert.equal(sink.getSnapshot().unsaved, 0);
  release();
  const result = await first; assert.equal(result.current.journalRevision, 2);
  await second; assert.equal((await store.list(scope)).length, 0);
});
