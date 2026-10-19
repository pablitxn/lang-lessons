import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRecovery, type RecoveryRecord, type SessionRecoveryPorts } from '../src/app/session-recovery';
import { createSessionLifecycle } from '../src/app/session-lifecycle';
import { createSessionRuntime } from '../src/app/session-runtime';
import { createMockVoiceAdapter } from '../src/voice/mock';
import type { ConfirmCloseRequest, SessionCommands } from '../src/contracts';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(called = false) {
  let record: RecoveryRecord = { accountId: 'a', sessionId: 's', session: { sessionId: 's', mode: 'verb-image', status: 'open', revision: 1 }, hadConnectedCall: called, feedback: 'not-requested' };
  const calls: string[] = []; const retryIds: string[] = []; const closeRequests: ConfirmCloseRequest[] = [];
  let invalidation = () => {}; let current = true; let number = 0; let closedReplyFails = false; let flushFails = false;
  let retriesFail = false;
  let flushBarrier: Promise<void> | null = null;
  const sessions: SessionCommands = {
    async create() { throw new Error('No new session'); },
    async read() { return record.session; },
    async startCall() { throw new Error('Recovery must not start audio'); },
    async stopCall() { throw new Error('No new segment'); },
    async confirmClose(request) {
      calls.push('close'); closeRequests.push(request);
      if (closedReplyFails) throw new Error('Lost close reply');
      record = { ...record, session: { ...record.session, status: 'closed', revision: 2 }, feedback: called ? 'pending' : 'not-requested' };
      return { sessionId: 's', operationId: request.operationId, revision: 2, status: 'closed', feedback: record.feedback };
    },
    async readClose() { return null; },
  };
  const ports: SessionRecoveryPorts = {
    identity: { accountId: 'a', sessionId: 's' }, isCurrent: () => current,
    subscribeInvalidation(listener) { invalidation = listener; return () => {}; },
    async read() { calls.push('read'); return record; },
    async preparePractice(recovered) {
      calls.push('restore-queue');
      const runtime = createSessionRuntime(createMockVoiceAdapter(), recovered.sessionId);
      const lifecycle = createSessionLifecycle(runtime, {
        hadConnectedCall: recovered.hadConnectedCall, sessions,
        progress: { async flush() { calls.push('flush'); await flushBarrier; if (flushFails) throw new Error('Offline'); return { sessionId: 's', journalRevision: 3 }; } },
        freezeWrites() { calls.push('freeze'); }, releasePreparation() { calls.push('unfreeze'); },
        operationId: () => `close-${++number}`, isCurrent: () => current,
        navigate: target => calls.push(`navigate:${target}`),
      });
      return { lifecycle, release() { calls.push('release-handle'); } };
    },
    resume(recovered) { calls.push(`resume:${recovered.sessionId}`); },
    async retryFeedback(request) {
      retryIds.push(request.operationId); if (retriesFail) throw new Error('Lost reply');
      record = { ...record, feedback: 'pending' }; return record;
    }, operationId: () => `retry-${++number}`,
  };
  const recovery = createSessionRecovery(ports);
  return { recovery, ports, calls, retryIds, closeRequests, setRecord(next: Partial<RecoveryRecord>) { record = { ...record, ...next }; },
    record: () => record, invalidate() { current = false; invalidation(); },
    failRetry(value: boolean) { retriesFail = value; }, failClose(value: boolean) { closedReplyFails = value; }, failFlush(value: boolean) { flushFails = value; },
    holdFlush() { let release!: () => void; flushBarrier = new Promise<void>(resolve => { release = resolve; }); return release; } };
}

test('recovery reads without media or queue writes; explicit resume restores the same session', async () => {
  const f = fixture(true); await f.recovery.load(); assert.deepEqual(f.calls, ['read']);
  await f.recovery.resume();
  assert.deepEqual(f.calls, ['read', 'restore-queue', 'resume:s']);
  assert.equal(f.recovery.getSnapshot().phase, 'resumed'); f.recovery.dispose();
});
test('recovered no-call session finalizes directly after queue flush without a popup', async () => {
  const f = fixture(); await f.recovery.load(); await f.recovery.finalize('home');
  assert.equal(f.recovery.getSnapshot().record?.session.status, 'closed');
  assert.equal(f.recovery.getSnapshot().record?.feedback, 'not-requested');
  assert.deepEqual(f.calls, ['read', 'restore-queue', 'freeze', 'flush', 'close', 'navigate:home', 'read', 'release-handle']);
  assert.equal(f.retryIds.length, 0); f.recovery.dispose();
});
test('explicit legacy finalization of an earlier call does not present an active-call confirmation', async () => {
  const f = fixture(true); await f.recovery.load();
  const confirmations: boolean[] = []; const unsubscribe = f.recovery.subscribe(() => confirmations.push(f.recovery.getSnapshot().lifecycle?.getSnapshot().confirming ?? false));
  await f.recovery.finalize('home'); assert.equal(confirmations.includes(true), false); unsubscribe();
  assert.equal(f.recovery.getSnapshot().record?.feedback, 'pending'); assert.equal(f.closeRequests.length, 1); f.recovery.dispose();
});
test('failed final flush remains visible and manual finalization retry preserves the session', async () => {
  const f = fixture(); f.failFlush(true); await f.recovery.load(); await f.recovery.finalize('home');
  const lifecycle = f.recovery.getSnapshot().lifecycle!;
  assert.match(lifecycle.getSnapshot().error, /Progress could not be saved/);
  assert.equal(f.closeRequests.length, 0); f.failFlush(false); await lifecycle.retryExit();
  assert.equal(f.closeRequests.length, 1); assert.ok(f.calls.includes('navigate:home')); f.recovery.dispose();
});
test('manual close retry reuses the frozen payload and operation instead of dispatching a new close', async () => {
  const f = fixture(); f.failClose(true); await f.recovery.load(); await f.recovery.finalize('home');
  assert.equal(f.closeRequests.length, 1); f.failClose(false);
  await f.recovery.getSnapshot().lifecycle!.retryExit();
  assert.equal(f.closeRequests.length, 2); assert.deepEqual(f.closeRequests[1], f.closeRequests[0]); f.recovery.dispose();
});
test('failed feedback is never retried automatically and explicit retries retain an uncertain operation ID', async () => {
  const f = fixture(true); f.setRecord({ session: { ...f.record().session, status: 'closed' }, feedback: 'failed' });
  await f.recovery.load(); assert.equal(f.retryIds.length, 0); f.failRetry(true);
  await f.recovery.retryFeedback(); assert.equal(f.recovery.getSnapshot().record?.feedback, 'failed');
  assert.match(f.recovery.getSnapshot().error, /could not be confirmed/);
  f.failRetry(false); await Promise.all([f.recovery.retryFeedback(), f.recovery.retryFeedback()]);
  assert.deepEqual(f.retryIds, ['retry-1', 'retry-1']); assert.equal(f.recovery.getSnapshot().record?.feedback, 'pending');
  await f.recovery.retryFeedback(); assert.equal(f.retryIds.length, 2); f.recovery.dispose();
});
test('insufficient evidence and saved comments have no retry or invented comment', async () => {
  for (const feedback of ['insufficient-evidence', 'succeeded'] as const) {
    const f = fixture(true); f.setRecord({ session: { ...f.record().session, status: 'closed' }, feedback });
    await f.recovery.load(); await f.recovery.retryFeedback(); assert.equal(f.retryIds.length, 0);
    assert.equal(f.recovery.getSnapshot().record?.feedback, feedback); f.recovery.dispose();
  }
});
test('account change clears recovered state immediately and ignores a late read', async () => {
  const f = fixture(); let resolve!: (record: RecoveryRecord) => void;
  f.ports.read = () => new Promise(done => { resolve = done; });
  const loading = f.recovery.load(); await tick(); f.invalidate(); resolve(f.record()); await loading;
  assert.equal(f.recovery.getSnapshot().phase, 'invalidated'); assert.equal(f.recovery.getSnapshot().record, null);
  await f.recovery.resume(); assert.equal(f.calls.includes('restore-queue'), false); f.recovery.dispose();
});
test('foreign account/session recovery responses are rejected before opening any queue', async () => {
  for (const patch of [{ accountId: 'other' }, { sessionId: 'other' }]) {
    const f = fixture(); f.setRecord(patch); await f.recovery.load(); await f.recovery.resume();
    assert.equal(f.recovery.getSnapshot().record, null); assert.deepEqual(f.calls, ['read']); f.recovery.dispose();
  }
});
test('account invalidation during a final flush releases the handle without closing the old session', async () => {
  const f = fixture(true); const release = f.holdFlush(); await f.recovery.load(); const exit = f.recovery.finalize('home'); await tick();
  f.invalidate(); release(); await exit;
  assert.equal(f.recovery.getSnapshot().record, null); assert.equal(f.recovery.getSnapshot().lifecycle, null);
  assert.deepEqual(f.calls, ['read', 'restore-queue', 'freeze', 'flush', 'release-handle', 'unfreeze']); assert.equal(f.closeRequests.length, 0); f.recovery.dispose();
});

test('late queue restoration after account change releases its handle without resuming another account', async () => {
  const f = fixture(); const prepare = f.ports.preparePractice;
  let finish!: () => void;
  f.ports.preparePractice = async (record, signal) => {
    await new Promise<void>(resolve => { finish = resolve; });
    return prepare(record, signal);
  };
  await f.recovery.load(); const resume = f.recovery.resume(); await tick(); f.invalidate(); finish(); await resume;
  assert.equal(f.recovery.getSnapshot().record, null);
  assert.deepEqual(f.calls, ['read', 'restore-queue', 'release-handle']); f.recovery.dispose();
});
test('a late retry response cannot restore the previous account or session UI', async () => {
  const f = fixture(true); f.setRecord({ session: { ...f.record().session, status: 'closed' }, feedback: 'failed' });
  let finish!: (record: RecoveryRecord) => void;
  f.ports.retryFeedback = async () => new Promise(resolve => { finish = resolve; });
  await f.recovery.load(); const retry = f.recovery.retryFeedback(); await tick(); f.invalidate();
  finish({ ...f.record(), feedback: 'succeeded' }); await retry;
  assert.equal(f.recovery.getSnapshot().phase, 'invalidated'); assert.equal(f.recovery.getSnapshot().record, null); f.recovery.dispose();
});
test('unresolved close cannot resume practice and explicit retry refreshes the finalized recovery status', async () => {
  const f = fixture(); f.failClose(true); await f.recovery.load(); await f.recovery.finalize('home');
  await f.recovery.resume(); assert.ok(!f.calls.includes('resume:s'));
  f.failClose(false); await f.recovery.retryFinalize();
  assert.equal(f.recovery.getSnapshot().record?.session.status, 'closed');
  assert.equal(f.recovery.getSnapshot().lifecycle, null); f.recovery.dispose();
});

test('a failed root resume handoff remains visible and does not hide recovery controls', async () => {
  const f = fixture(); f.ports.resume = () => { throw new Error('Mount unavailable'); };
  await f.recovery.load(); await f.recovery.resume();
  assert.equal(f.recovery.getSnapshot().phase, 'available');
  assert.match(f.recovery.getSnapshot().error, /could not be resumed/); f.recovery.dispose();
});

test('a pending failed finalization retains its chosen destination for manual retry', async () => {
  const f = fixture(true); await f.recovery.load(); f.failFlush(true);
  await f.recovery.finalize('chosen-target'); await f.recovery.finalize('replacement-target');
  f.failFlush(false); await f.recovery.retryFinalize();
  assert.ok(f.calls.includes('navigate:chosen-target')); assert.ok(!f.calls.includes('navigate:replacement-target')); f.recovery.dispose();
});

test('async resume waits for root reconciliation and shares duplicate clicks without terminating practice', async () => {
  const f = fixture(); let finish!: () => void; let handoffs = 0;
  f.ports.resume = () => { handoffs++; return new Promise<void>(resolve => { finish = resolve; }); };
  await f.recovery.load(); const first = f.recovery.resume(); const duplicate = f.recovery.resume();
  assert.equal(first, duplicate); await tick();
  assert.equal(handoffs, 1); assert.equal(f.recovery.getSnapshot().phase, 'available');
  assert.equal(f.recovery.getSnapshot().busy, true);
  assert.deepEqual(f.calls, ['read', 'restore-queue']);
  finish(); await Promise.all([first, duplicate]);
  assert.equal(f.recovery.getSnapshot().phase, 'resumed'); assert.equal(f.recovery.getSnapshot().busy, false);
  assert.deepEqual(f.calls, ['read', 'restore-queue']); f.recovery.dispose();
});
test('async resume rejection keeps the card and restored queue available for explicit retry', async () => {
  const f = fixture(); let attempts = 0;
  f.ports.resume = async () => { await tick(); if (++attempts === 1) throw new Error('Transport reconciliation failed'); };
  await f.recovery.load(); await f.recovery.resume();
  const state = f.recovery.getSnapshot();
  assert.equal(state.phase, 'available'); assert.equal(state.busy, false); assert.equal(state.record?.sessionId, 's');
  assert.match(state.error, /could not be resumed/);
  await f.recovery.resume(); assert.equal(attempts, 2);
  assert.equal(f.recovery.getSnapshot().phase, 'resumed'); assert.equal(f.recovery.getSnapshot().error, '');
  assert.deepEqual(f.calls, ['read', 'restore-queue']); f.recovery.dispose();
});
test('account invalidation or disposal during async resume cannot mark the old session resumed', async () => {
  for (const invalidate of ['account', 'dispose', 'session-guard'] as const) {
    const f = fixture(); let finish!: () => void;
    f.ports.resume = () => new Promise<void>(resolve => { finish = resolve; });
    await f.recovery.load(); const resume = f.recovery.resume(); await tick();
    if (invalidate === 'account') f.invalidate();
    else if (invalidate === 'dispose') f.recovery.dispose();
    else f.ports.isCurrent = () => false;
    finish(); await resume;
    assert.equal(f.recovery.getSnapshot().phase, 'invalidated'); assert.equal(f.recovery.getSnapshot().record, null);
    assert.equal(f.recovery.getSnapshot().lifecycle, null); assert.equal(f.recovery.getSnapshot().error, ''); f.recovery.dispose();
  }
});
test('failed final flush leaves the recovered session open for asynchronous resume', async () => {
  const f = fixture(true); let finish!: () => void;
  f.ports.resume = () => new Promise<void>(resolve => { finish = resolve; });
  await f.recovery.load(); f.failFlush(true); await f.recovery.finalize('home');
  const resume = f.recovery.resume(); await tick();
  assert.equal(f.recovery.getSnapshot().phase, 'available'); assert.equal(f.closeRequests.length, 0);
  assert.deepEqual(f.calls, ['read', 'restore-queue', 'freeze', 'flush', 'unfreeze']);
  finish(); await resume; assert.equal(f.recovery.getSnapshot().phase, 'resumed'); f.recovery.dispose();
});
