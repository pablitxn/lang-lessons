import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProgressBatch, emptyProgressJournal, parsePracticeEvent } from '../src/foundation/progress-batch';
import { createExitCoordinator } from '../src/foundation/exit-coordinator';
import { createPictureDecodeQueue } from '../src/foundation/picture-decode';
import type { PracticeEvent, ConfirmCloseRequest } from '../src/contracts';

function event(eventId = 'one', revision = 1): PracticeEvent {
  return { schemaVersion: 1, eventId, kind: 'attempt-result', result: 'accepted', source: 'typed', trust: 'client-reported',
    ref: { sessionId: 'session', exerciseId: 'exercise', generation: 1, obligation: 'spelling:past', attemptId: `a${revision}`, revision } };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('invalid or conflicting batches roll back every new receipt and expose no accepted acknowledgment', () => {
  const original = emptyProgressJournal('session');
  for (const input of [[event(), { ...event('two'), rawTranscript: 'private' }],
    [event(), { ...event(), result: 'incorrect' }], [event(), { ...event('two'), ref: { ...event().ref, sessionId: 'other' } }]]) {
    const next = applyProgressBatch(original, input);
    assert.equal(next.state, original); assert.equal(next.result.status, 'rejected');
    assert.equal('acknowledgments' in next.result, false); assert.equal(original.receipts.size, 0);
  }
});
test('replayed receipt keeps committed revision distinct from current journal revision', () => {
  const first = applyProgressBatch(emptyProgressJournal('session'), [event()]);
  const second = applyProgressBatch(first.state, [event('two', 2)]);
  const replay = applyProgressBatch(second.state, [event()]);
  assert.equal(replay.result.status, 'committed');
  if (replay.result.status === 'committed') {
    assert.deepEqual(replay.result.acknowledgments, [{ eventId: 'one', status: 'duplicate', committedRevision: 1 }]);
    assert.equal(replay.result.current.journalRevision, 2);
  }
  assert.equal(applyProgressBatch(second.state, [event('old', 1)]).result.status, 'rejected');
});
test('strict events exclude raw text, processing and forged server trust without altering oral gates', () => {
  assert.equal(parsePracticeEvent({ ...event(), trust: 'verified' }), null);
  assert.equal(parsePracticeEvent({ ...event(), result: 'processing' }), null);
  assert.equal(parsePracticeEvent({ ...event(), ref: { ...event().ref, revision: -1 } }), null);
  assert.equal(parsePracticeEvent({ ...event(), source: { toString: () => 'typed' } }), null);
  assert.equal(applyProgressBatch(emptyProgressJournal('session'), Array(101).fill(event())).result.status, 'rejected');
  const parsed = parsePracticeEvent(event()); assert.notEqual(parsed?.ref, event().ref);
  assert.equal(parsed?.trust, 'client-reported');
});
function exitFixture() {
  const calls: string[] = []; const requests: ConfirmCloseRequest[] = [];
  const decision = deferred<'cancel' | 'confirm'>(); const flush = deferred<{sessionId: string; journalRevision: number}>();
  let current = true; let failClose = false;
  const coordinator = createExitCoordinator({
    exit: { sessionId: 'session', requestExit: () => { calls.push('decision'); return decision.promise; },
      freezeWrites: () => { calls.push('freeze'); }, releasePreparation: () => { calls.push('release'); } },
    progress: { flush: () => { calls.push('flush'); return flush.promise; } },
    sessions: { read: async () => { calls.push('read'); return { sessionId: 'session', mode: 'verb-image', status: 'open', revision: 7 }; },
      confirmClose: async request => { calls.push('close'); requests.push(request); if (failClose) throw new Error('lost response');
        return { sessionId: 'session', operationId: request.operationId, status: 'closed', revision: 8, feedback: 'pending' }; } },
    operationId: () => 'stable-close', isCurrent: () => current, navigate: target => { calls.push(`navigate:${target}`); },
  });
  return { coordinator, calls, requests, decision, flush, stale: () => { current = false; }, fail: (value: boolean) => { failClose = value; } };
}
test('root waits for P4 decision then final acknowledgments and fresh lifecycle revision before navigation', async () => {
  const f = exitFixture(); const first = f.coordinator.request('home');
  assert.equal(f.coordinator.request('other'), first); assert.deepEqual(f.calls, ['decision']);
  f.decision.resolve('confirm'); await settle(); assert.deepEqual(f.calls, ['decision', 'freeze', 'flush']);
  f.flush.resolve({ sessionId: 'session', journalRevision: 12 }); assert.equal(await first, 'closed');
  assert.deepEqual(f.calls, ['decision', 'freeze', 'flush', 'read', 'close', 'navigate:home']);
  assert.equal(f.requests[0]?.expectedRevision, 7); assert.equal(f.requests[0]?.finalProgress.journalRevision, 12);
  await f.coordinator.request('again'); assert.equal(f.requests.length, 1);
});
test('cancel, rejected final events and session replacement never dispatch close or navigate', async () => {
  const cancel = exitFixture(); const p = cancel.coordinator.request('home'); cancel.decision.resolve('cancel');
  assert.equal(await p, 'cancelled'); assert.deepEqual(cancel.calls, ['decision']);
  const failed = exitFixture(); const q = failed.coordinator.request('home'); failed.decision.resolve('confirm'); await settle();
  failed.flush.reject(new Error('batch rejected')); await assert.rejects(q); assert.deepEqual(failed.calls, ['decision', 'freeze', 'flush', 'release']);
  const stale = exitFixture(); const r = stale.coordinator.request('home'); stale.decision.resolve('confirm'); await settle(); stale.stale();
  stale.flush.resolve({ sessionId: 'session', journalRevision: 1 }); assert.equal(await r, 'stale'); assert.equal(stale.requests.length, 0);
});
test('ambiguous close failure retains the same key/body and first destination for explicit retry', async () => {
  const f = exitFixture(); f.fail(true); const p = f.coordinator.request('home'); f.decision.resolve('confirm');
  f.flush.resolve({ sessionId: 'session', journalRevision: 2 }); await assert.rejects(p);
  f.fail(false); assert.equal(await f.coordinator.request('other'), 'closed');
  assert.equal(f.requests[0], f.requests[1]); assert.equal(f.calls.includes('release'), false);
  assert.equal(f.calls.at(-1), 'navigate:home');
});
test('image decoding serializes across generations, coalesces queued work and ignores stale success', async () => {
  const started: string[] = []; const ready: string[] = []; const first = deferred<void>(); const last = deferred<void>();
  const queue = createPictureDecodeQueue(src => { started.push(src); return started.length === 1 ? first.promise : last.promise; }, p => ready.push(p.key));
  queue.setNext({ key: 'a', src: '/images/verbs/be-1.jpg' });
  queue.setNext({ key: 'b', src: '/images/verbs/be-2.jpg' });
  queue.setNext({ key: 'c', src: '/images/verbs/be-3.jpg' });
  assert.equal(started.length, 1); first.resolve(); await settle();
  assert.deepEqual(ready, []); assert.deepEqual(started, ['/images/verbs/be-1.jpg', '/images/verbs/be-3.jpg']);
  last.resolve(); await settle(); assert.deepEqual(ready, ['c']); queue.dispose();
});
test('failed decode does not block queued next image; disposal suppresses completion and external URLs', async () => {
  let count = 0; const ready: string[] = []; const delayed = deferred<void>();
  const queue = createPictureDecodeQueue(async () => { count++; if (count === 1) throw new Error('decode'); await delayed.promise; }, p => ready.push(p.key));
  queue.setNext({ key: 'external', src: 'https://example.com/a.jpg' }); assert.equal(count, 0);
  queue.setNext({ key: 'a', src: '/images/verbs/be-1.jpg' }); queue.setNext({ key: 'b', src: '/images/verbs/be-2.jpg' });
  await settle(); assert.equal(count, 2); queue.dispose(); delayed.resolve(); await settle(); assert.deepEqual(ready, []);
});
test('independent obligations accept out-of-order revisions while same-attempt invalidation needs a newer revision', () => {
  const first = applyProgressBatch(emptyProgressJournal('session'), [event('past', 4)]);
  const base = { ...event('base', 1), ref: { ...event('base', 1).ref, obligation: 'spelling:base' as const } };
  const second = applyProgressBatch(first.state, [base]); assert.equal(second.result.status, 'committed');
  const invalidation: PracticeEvent = { schemaVersion: 1, eventId: 'invalidate', ref: event('unused', 5).ref,
    kind: 'attempt-invalidated', source: 'typed', trust: 'client-reported' };
  const third = applyProgressBatch(second.state, [invalidation]); assert.equal(third.result.status, 'committed');
  assert.equal(applyProgressBatch(third.state, [event('same', 5)]).result.status, 'rejected');
  assert.equal(applyProgressBatch(third.state, [event('next', 6)]).result.status, 'committed');
});
