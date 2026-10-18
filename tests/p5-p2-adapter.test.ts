import test from 'node:test';
import assert from 'node:assert/strict';
import { createP2ProgressSink } from '../src/features/progress/p2-adapter';
import { createWrittenUsageQueue } from '../src/features/progress/written-usage-queue';
import type { WrittenObservation, WrittenUsageStore } from '../src/features/progress/written-usage-store';

test('P2 recovery adapter reads the journal fence rather than lifecycle revision and preserves session identity', async () => {
  let submittedSession = ''; let recoveredSession = '';
  const scope = { userId: 'fixture-user', sessionId: 'fixture-session' };
  const sink = createP2ProgressSink({ scope, isCurrentUser: () => true,
    store: { enqueue: async () => {}, list: async () => [], acknowledge: async () => {} },
    learning: { submit: async sessionId => { submittedSession = sessionId; throw new Error('not expected'); } },
    recovery: { read: async sessionId => { recoveredSession = sessionId; return { session: { sessionId, mode: 'verb-image', status: 'open', revision: 91 }, progress: { sessionId, journalRevision: 7 } }; } } });
  assert.deepEqual(await sink.flush(), { sessionId: scope.sessionId, journalRevision: 7 });
  assert.equal(recoveredSession, scope.sessionId); assert.equal(submittedSession, '');
});
test('P2 written observation consumer orders exact schema, preserves lost-reply IDs and accepts duplicate receipt', async () => {
  const pending: WrittenObservation[] = []; let sequence = 0;
  const store: WrittenUsageStore = {
    append: async (scope, streamId, eventId, kind) => { const prior = pending.find(row => row.eventId === eventId); if (prior) return prior;
      const row: WrittenObservation = { schemaVersion: 1, sessionId: scope.sessionId, streamId, eventId, sequence: ++sequence, kind }; pending.push(row); return row; },
    list: async () => [...pending], acknowledge: async (_, row) => { pending.splice(pending.findIndex(item => item.eventId === row.eventId), 1); },
  };
  const observed: WrittenObservation[] = []; const acknowledged = new Set<string>(); let fail = true;
  const options = { scope: { userId: 'user', sessionId: 'session' }, streamId: 'server-issued-fixture-stream', store, isCurrentUser: () => true,
    written: async (row: WrittenObservation) => { observed.push({ ...row }); const duplicate = acknowledged.has(row.eventId); acknowledged.add(row.eventId);
      if (fail) { fail = false; throw new Error('lost reply'); }
      return { eventId: row.eventId, sequence: row.sequence, status: duplicate ? 'duplicate' as const : 'recorded' as const, intervalId: null, observedAt: '2026-10-18T12:00:00Z' }; } };
  const first = createWrittenUsageQueue(options);
  await assert.rejects(first.record('visible')); first.deactivate();
  const resumed = createWrittenUsageQueue(options); await resumed.flush();
  await resumed.record('input'); await resumed.record('hidden');
  assert.deepEqual(observed[0], observed[1]);
  assert.deepEqual(observed.map(row => row.sequence), [1, 1, 2, 3]);
  assert.deepEqual(observed.map(row => row.kind), ['visible', 'visible', 'input', 'hidden']);
  assert.equal(pending.length, 0);
  for (const row of observed) assert.deepEqual(Object.keys(row).sort(), ['eventId', 'kind', 'schemaVersion', 'sequence', 'sessionId', 'streamId'].sort());
});
test('P2 usage factory uses a server-issued stream and rejects an account switch during creation', async () => {
  const { createP2WrittenUsageQueue } = await import('../src/features/progress/p2-adapter');
  let current = true; let opened = '';
  const store: WrittenUsageStore = { append: async () => { throw new Error('not called'); }, list: async () => [], acknowledge: async () => {} };
  await assert.rejects(createP2WrittenUsageQueue({ scope: { userId: 'a', sessionId: 'same-session' }, store, isCurrentUser: () => current,
    usage: { openWrittenStream: async sessionId => { opened = sessionId; current = false; return 'server-stream'; }, written: async () => { throw new Error('must not send'); } } }), /account changed/);
  assert.equal(opened, 'same-session');
});
test('usage drain includes later durable input before resolving an earlier held request', async () => {
  const pending: WrittenObservation[] = []; let sequence = 0;
  const store: WrittenUsageStore = {
    append: async (scope, streamId, eventId, kind) => { const row: WrittenObservation = { schemaVersion: 1, sessionId: scope.sessionId, streamId, eventId, sequence: ++sequence, kind }; pending.push(row); return row; },
    list: async () => [...pending], acknowledge: async (_, row) => { pending.splice(pending.findIndex(item => item.eventId === row.eventId), 1); },
  };
  let release!: () => void; let notify!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { notify = resolve; });
  const sent: number[] = [];
  const queue = createWrittenUsageQueue({ scope: { userId: 'user', sessionId: 'session' }, streamId: 'stream', store, isCurrentUser: () => true,
    written: async row => { sent.push(row.sequence); if (row.sequence === 1) { notify(); await held; }
      return { eventId: row.eventId, sequence: row.sequence, intervalId: null, observedAt: '2026-10-18T12:00:00Z', status: 'recorded' }; } });
  const first = queue.record('visible'); await started;
  let acknowledged = false; const second = queue.record('input').then(() => { acknowledged = true; });
  for (let i = 0; i < 100 && pending.length < 2; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(pending.map(row => row.sequence), [1, 2]); assert.equal(acknowledged, false);
  release(); await first;
  assert.deepEqual(sent, [1, 2]); assert.equal(pending.length, 0);
  await second; assert.equal(queue.getSnapshot().phase, 'idle');
});
