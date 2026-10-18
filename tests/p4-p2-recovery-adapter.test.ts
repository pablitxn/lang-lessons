import test from 'node:test';
import assert from 'node:assert/strict';
import { createP2RecoveryAdapter, type P2RecoverySnapshot, type P2RetryFeedbackRequest } from '../src/app/p2-recovery-adapter';

function fixture() {
  let snapshot: P2RecoverySnapshot = { session: { sessionId: 's', mode: 'sentence', status: 'closed', revision: 4 },
    progress: { sessionId: 's', journalRevision: 9 }, activeSegments: [], feedback: { jobId: 'job', state: 'failed', retryRevision: 2 } };
  const requests: P2RetryFeedbackRequest[] = []; const identity = { accountId: 'a', sessionId: 's' };
  const abort = new AbortController(); let fail = false; let history = true;
  const adapter = createP2RecoveryAdapter({ identity, isCurrent: () => true,
    client: {
      async read() { return snapshot; },
      async retryFailedFeedback(request) { requests.push(request); if (fail) throw new Error('Lost reply');
        return { sessionId: request.sessionId, jobId: request.jobId, state: 'pending', retryRevision: request.expectedRetryRevision + 1 }; },
    }, async readCallHistory() { return history; },
  });
  return { adapter, requests, identity, signal: abort.signal, abort, snapshot: () => snapshot,
    setSnapshot(next: P2RecoverySnapshot) { snapshot = next; }, fail(value: boolean) { fail = value; }, history(value: boolean) { history = value; } };
}

test('P2 recovery adapter preserves independent journal/lifecycle/retry revisions and earlier stopped call history', async () => {
  const f = fixture(); const record = await f.adapter.read(f.identity, f.signal);
  assert.equal(record.hadConnectedCall, true); assert.deepEqual(record.activeSegments, []);
  assert.equal(record.session.revision, 4); assert.equal(record.progress?.journalRevision, 9); assert.equal(record.feedbackJob?.retryRevision, 2);
  assert.equal(record.feedback, 'failed'); f.adapter.dispose();
});
test('retry sends exactly the P2 job identity and retry fence, with no account or lifecycle revision fields', async () => {
  const f = fixture(); await f.adapter.read(f.identity, f.signal);
  const record = await f.adapter.retryFeedback({ ...f.identity, operationId: 'operation' }, f.signal);
  assert.deepEqual(f.requests, [{ sessionId: 's', jobId: 'job', operationId: 'operation', expectedRetryRevision: 2 }]);
  assert.equal(record.feedback, 'pending'); assert.equal(record.feedbackJob?.retryRevision, 3); f.adapter.dispose();
});
test('uncertain retry retains the original P2 payload across a canonical refresh', async () => {
  const f = fixture(); await f.adapter.read(f.identity, f.signal); f.fail(true);
  await assert.rejects(f.adapter.retryFeedback({ ...f.identity, operationId: 'operation' }, f.signal));
  f.setSnapshot({ ...f.snapshot(), feedback: { jobId: 'job', state: 'pending', retryRevision: 3 } });
  await f.adapter.read(f.identity, f.signal); f.fail(false);
  await f.adapter.retryFeedback({ ...f.identity, operationId: 'operation' }, f.signal);
  assert.deepEqual(f.requests[1], f.requests[0]); f.adapter.dispose();
});
test('absence of a feedback job maps to not-requested without treating active segment absence as call history', async () => {
  const f = fixture(); f.setSnapshot({ ...f.snapshot(), session: { ...f.snapshot().session, status: 'open' }, feedback: null });
  const earlierCall = await f.adapter.read(f.identity, f.signal); assert.equal(earlierCall.hadConnectedCall, true);
  assert.equal(earlierCall.feedback, 'not-requested'); f.history(false);
  assert.equal((await f.adapter.read(f.identity, f.signal)).hadConnectedCall, false); f.adapter.dispose();
});
test('cross-account calls and foreign session fences are rejected', async () => {
  const f = fixture(); await assert.rejects(f.adapter.read({ ...f.identity, accountId: 'other' }, f.signal));
  f.setSnapshot({ ...f.snapshot(), progress: { sessionId: 'other', journalRevision: 9 } });
  await assert.rejects(f.adapter.read(f.identity, f.signal), /scope mismatch/); assert.equal(f.requests.length, 0); f.adapter.dispose();
});
test('account abort clears cached recovery and retry state and permanently invalidates that adapter', async () => {
  const f = fixture(); await f.adapter.read(f.identity, f.signal); f.abort.abort();
  await assert.rejects(f.adapter.retryFeedback({ ...f.identity, operationId: 'operation' }, new AbortController().signal));
  assert.equal(f.requests.length, 0); f.adapter.dispose();
});
test('new operations cannot requeue already pending, succeeded or insufficient jobs', async () => {
  for (const state of ['pending', 'succeeded', 'insufficient-evidence'] as const) {
    const f = fixture(); f.setSnapshot({ ...f.snapshot(), feedback: { jobId: 'job', state, retryRevision: 2 } });
    await f.adapter.read(f.identity, f.signal);
    await assert.rejects(f.adapter.retryFeedback({ ...f.identity, operationId: 'new' }, f.signal));
    assert.equal(f.requests.length, 0); f.adapter.dispose();
  }
});
