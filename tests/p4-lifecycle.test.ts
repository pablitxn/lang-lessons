import test from 'node:test';
import assert from 'node:assert/strict';
import type { CloseResult, ProgressFence, SessionCommands, VoiceEvent } from '../src/contracts';
import { createSessionRuntime } from '../src/app/session-runtime';
import { createSessionLifecycle } from '../src/app/session-lifecycle';
import { createMockVoiceAdapter } from '../src/voice/mock';
import { verbContext } from './helpers/assessment-fixtures';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(options: Parameters<typeof createSessionRuntime>[2] = {}, lifecycleOptions: Parameters<typeof createSessionLifecycle>[2] = {}) {
  const base = createMockVoiceAdapter();
  let connects = 0; const connect = base.connect;
  base.connect = async options => { connects++; return connect(options); };
  const runtime = createSessionRuntime(base, 's1', options); runtime.voice.setContext(verbContext());
  const calls: string[] = []; let revision = 0; let sequence = 0; let current = true; let rejectFlush = false;
  let flush: (() => Promise<ProgressFence>) | null = null;
  let close: ((request: Parameters<SessionCommands['confirmClose']>[0]) => Promise<CloseResult>) | null = null;
  const session = () => ({ sessionId: 's1', mode: 'verb-image' as const, status: 'open' as const, revision });
  const sessions: SessionCommands = {
    async create() { throw new Error('Must use the existing session'); },
    async read() { calls.push('read'); return session(); },
    async startCall() { calls.push('start'); revision++; return { session: session(), segment: { sessionId: 's1', segmentId: `segment-${revision}`, connectionEpoch: revision } }; },
    async stopCall() { calls.push('stop'); revision++; return session(); },
    async confirmClose(request) { calls.push('close'); if (close) return close(request); return { ...request, status: 'closed', revision: ++revision, feedback: 'not-requested' } as CloseResult; },
    async readClose() { return null; },
  };
  const lifecycle = createSessionLifecycle(runtime, {
    sessions, progress: { async flush() { calls.push('flush'); if (flush) return flush(); if (rejectFlush) throw new Error('Rejected final event'); return { sessionId: 's1', journalRevision: 7 }; } },
    freezeWrites() { calls.push('freeze'); }, releasePreparation() { calls.push('release'); },
    operationId: () => `operation-${++sequence}`, isCurrent: () => current, navigate: target => calls.push(`navigate:${target}`),
  }, lifecycleOptions);
  return { base, runtime, lifecycle, calls, sessions, connects: () => connects, rejectFlush: () => { rejectFlush = true; }, stale: () => { current = false; },
    setFlush: (fn: () => Promise<ProgressFence>) => { flush = fn; },
    setClose: (fn: NonNullable<typeof close>) => { close = fn; } };
}

test('entry and context make no connection; explicit stop/restart preserves context and session', async () => {
  const f = fixture(); const context = f.runtime.getContext(); await tick();
  assert.equal(f.connects(), 0); assert.deepEqual(f.calls, []);
  await f.lifecycle.start(); await f.lifecycle.stop(); await f.lifecycle.start();
  assert.equal(f.connects(), 2); assert.equal(f.runtime.getContext(), context); assert.equal(f.runtime.sessionId, 's1');
  assert.equal(f.calls.filter(x => x === 'close').length, 0); assert.equal(f.runtime.getSnapshot().hadConnectedCall, true);
  f.lifecycle.dispose();
});
test('unavailable voice fails before segment allocation and explicit retry remains recoverable', async () => {
  let ready = false; let prepares = 0;
  const f = fixture({}, { prepareConnection: async () => { prepares++; if (!ready) throw new Error('Tutor calls are unavailable.'); } });
  await f.lifecycle.start();
  assert.equal(prepares, 1); assert.deepEqual(f.calls, []); assert.equal(f.connects(), 0);
  assert.equal(f.lifecycle.getSnapshot().error, '');
  assert.match(f.lifecycle.getSnapshot().callError, /unavailable/);
  ready = true; await f.lifecycle.start();
  assert.equal(prepares, 2); assert.deepEqual(f.calls, ['read', 'start']); assert.equal(f.connects(), 1);
  assert.equal(f.lifecycle.getSnapshot().callError, ''); f.lifecycle.dispose();
});
test('unavailable voice does not prevent written-only session exit', async () => {
  const f = fixture({}, { prepareConnection: async () => { throw new Error('Tutor calls are unavailable.'); } });
  await f.lifecycle.start();
  assert.equal(await f.lifecycle.requestExit('home'), 'saved');
  assert.equal(f.lifecycle.getSnapshot().confirming, false); assert.equal(f.connects(), 0);
  assert.deepEqual(f.calls, ['freeze', 'flush', 'navigate:home']); f.lifecycle.dispose();
});
test('stop and exit cancel readiness without waiting for an ignored abort or allocating a segment', async () => {
  for (const action of ['stop', 'exit', 'dispose'] as const) {
    let release!: () => void; let signal!: AbortSignal;
    const f = fixture({}, { prepareConnection: pendingSignal => { signal = pendingSignal; return new Promise<void>(resolve => { release = resolve; }); } });
    const start = f.lifecycle.start(); await tick(); assert.deepEqual(f.calls, []);
    if (action === 'exit') assert.equal(await f.lifecycle.requestExit('home'), 'saved');
    else if (action === 'stop') await f.lifecycle.stop();
    else f.lifecycle.dispose();
    await start; assert.equal(signal.aborted, true); release(); await tick();
    assert.equal(f.calls.some(call => call === 'start' || call === 'stop'), false); assert.equal(f.connects(), 0);
    assert.equal(f.lifecycle.getSnapshot().error, ''); assert.equal(f.lifecycle.getSnapshot().callError, ''); f.lifecycle.dispose();
  }
});
test('a superseded account during readiness cannot allocate a call segment', async () => {
  let release!: () => void;
  const f = fixture({}, { prepareConnection: () => new Promise<void>(resolve => { release = resolve; }) });
  const start = f.lifecycle.start(); await tick(); f.stale(); release(); await start;
  assert.deepEqual(f.calls, []); assert.equal(f.connects(), 0); f.lifecycle.dispose();
});
test('stop while reading a start revision prevents allocating a later call segment', async () => {
  const f = fixture(); let release!: () => void; const read = f.sessions.read;
  f.sessions.read = async sessionId => { await new Promise<void>(resolve => { release = resolve; }); return read(sessionId); };
  const start = f.lifecycle.start(); await tick(); const stopping = f.lifecycle.stop(); release(); await Promise.all([start, stopping]);
  assert.deepEqual(f.calls, ['read']); assert.equal(f.connects(), 0); f.lifecycle.dispose();
});
test('cancel exit preserves live call and sends no progress or close operation', async () => {
  const f = fixture(); await f.lifecycle.start(); f.calls.length = 0;
  const exit = f.lifecycle.requestExit('home'); await tick();
  assert.equal(f.lifecycle.getSnapshot().confirming, true); f.lifecycle.decide('cancel');
  assert.equal(await exit, 'cancelled'); assert.equal(f.runtime.getSnapshot().state, 'ready'); assert.deepEqual(f.calls, []);
  f.lifecycle.dispose();
});
test('confirmed connected call stops and saves the same open practice while retaining the first destination', async () => {
  const f = fixture(); await f.lifecycle.start(); await f.lifecycle.stop(); await f.lifecycle.start(); f.calls.length = 0;
  const first = f.lifecycle.requestExit('home'); const second = f.lifecycle.requestExit('other'); await tick();
  f.lifecycle.decide('confirm'); assert.deepEqual(await Promise.all([first, second]), ['saved', 'saved']);
  assert.deepEqual(f.calls, ['freeze', 'read', 'stop', 'flush', 'navigate:home']);
  assert.equal((await f.sessions.read('s1')).status, 'open');
  f.lifecycle.dispose();
});
test('no-call exit does not confirm or create a call or directly request feedback', async () => {
  const f = fixture(); await f.lifecycle.requestExit('home');
  assert.equal(f.lifecycle.getSnapshot().confirming, false); assert.equal(f.connects(), 0);
  assert.deepEqual(f.calls, ['freeze', 'flush', 'navigate:home']); f.lifecycle.dispose();
});
test('rejected final progress releases preparation and never closes or navigates', async () => {
  const f = fixture(); f.rejectFlush(); await f.lifecycle.requestExit('home');
  assert.deepEqual(f.calls, ['freeze', 'flush', 'release']); assert.equal(f.lifecycle.getSnapshot().frozen, false);
  assert.match(f.lifecycle.getSnapshot().error, /Progress could not be saved/); f.lifecycle.dispose();
});
test('ambiguous close stays frozen without automatically retrying', async () => {
  const f = fixture(); f.setClose(async () => { throw new Error('Lost reply'); });
  await f.lifecycle.start(); const exit = f.lifecycle.finalize('home'); await tick(); f.lifecycle.decide('confirm'); await exit;
  await f.lifecycle.requestExit('other');
  assert.equal(f.calls.filter(x => x === 'close').length, 1); assert.equal(f.lifecycle.getSnapshot().frozen, true);
  assert.equal(f.lifecycle.getSnapshot().uncertainClose, true); assert.ok(!f.calls.some(x => x.startsWith('navigate:'))); f.lifecycle.dispose();
});
test('late close cannot navigate a superseded session', async () => {
  const f = fixture(); let finish!: (result: CloseResult) => void;
  f.setClose(request => new Promise(resolve => { finish = result => resolve({ ...result, sessionId: request.sessionId, operationId: request.operationId }); }));
  await f.lifecycle.start(); const exit = f.lifecycle.finalize('home'); await tick(); f.lifecycle.decide('confirm'); await tick(); f.stale();
  finish({ sessionId: 's1', operationId: '', status: 'closed', revision: 1, feedback: 'not-requested' } as CloseResult);
  assert.equal(await exit, 'stale'); assert.ok(!f.calls.some(x => x.startsWith('navigate:'))); f.lifecycle.dispose();
});
test('stop while startCall is pending never opens media and ends the returned segment', async () => {
  const f = fixture(); let finish!: () => void;
  const original = f.sessions.startCall;
  f.sessions.startCall = async request => { await new Promise<void>(resolve => { finish = resolve; }); return original(request); };
  const start = f.lifecycle.start(); await tick(); const stop = f.lifecycle.stop(); finish(); await Promise.all([start, stop]);
  assert.equal(f.connects(), 0); assert.equal(f.calls.filter(x => x === 'stop').length, 1); f.lifecycle.dispose();
});
test('callbacks retained by an old adapter subscription cannot revive or overwrite a restarted call', async () => {
  const base = createMockVoiceAdapter(); const callbacks: ((event: VoiceEvent) => void)[] = []; const subscribe = base.subscribe;
  base.subscribe = listener => { callbacks.push(listener); return subscribe(listener); };
  const runtime = createSessionRuntime(base, 's1'); await runtime.start(); const old = callbacks[0]!;
  runtime.stop(); await runtime.start(); old({ sessionId: 's1', eventId: 'late', type: 'error', code: 'provider', message: 'Stale', retryable: true });
  assert.equal(runtime.getSnapshot().error, ''); assert.equal(runtime.getSnapshot().state, 'ready'); runtime.stop();
});

test('a mismatched close response cannot navigate or permit another close', async () => {
  const f = fixture(); f.setClose(async request => ({ ...request, sessionId: 'another-session', status: 'closed', revision: 4, feedback: 'not-requested' }));
  await f.lifecycle.start(); const exit = f.lifecycle.finalize('home'); await tick(); f.lifecycle.decide('confirm'); await exit;
  await f.lifecycle.requestExit('other');
  assert.equal(f.calls.filter(x => x === 'close').length, 1); assert.equal(f.lifecycle.getSnapshot().frozen, true);
  assert.ok(!f.calls.some(x => x.startsWith('navigate:'))); f.lifecycle.dispose();
});
test('a failed connection invalidates retained provider callbacks', async () => {
  const base = createMockVoiceAdapter(); let retained!: (event: VoiceEvent) => void;
  base.subscribe = listener => { retained = listener; return () => {}; };
  base.connect = async () => { throw new Error('Failed connection'); };
  const runtime = createSessionRuntime(base, 's1'); await assert.rejects(runtime.start());
  retained({ sessionId: 's1', eventId: 'late-ready', type: 'state', state: 'ready' });
  assert.equal(runtime.getSnapshot().state, 'error'); assert.equal(runtime.getSnapshot().hadConnectedCall, false);
  runtime.stop();
});


test('written-only exit never opens confirmation and waits for the final queued progress receipt', async () => {
  const f = fixture();
  const acknowledged = ['earlier-written-result'];
  const queued = ['latest-written-result'];
  let acknowledge!: () => void;
  const confirmationStates: boolean[] = [];
  const unsubscribe = f.lifecycle.subscribe(() => confirmationStates.push(f.lifecycle.getSnapshot().confirming));
  f.setFlush(() => new Promise(resolve => { acknowledge = () => {
    acknowledged.push(...queued.splice(0));
    resolve({ sessionId: 's1', journalRevision: 8 });
  }; }));
  f.setClose(async () => { throw new Error('Written practice must remain open'); });
  const exit = f.lifecycle.requestExit('home'); await tick();
  assert.deepEqual(f.calls, ['freeze', 'flush']);
  assert.deepEqual(acknowledged, ['earlier-written-result']);
  assert.deepEqual(queued, ['latest-written-result']);
  assert.equal(f.lifecycle.getSnapshot().confirming, false);
  acknowledge(); assert.equal(await exit, 'saved');
  assert.deepEqual(acknowledged, ['earlier-written-result', 'latest-written-result']);
  assert.equal(confirmationStates.includes(true), false);
  assert.deepEqual(f.calls, ['freeze', 'flush', 'navigate:home']);
  unsubscribe(); f.lifecycle.dispose();
});

test('a previously connected but stopped tutor preserves written practice without a confirmation', async () => {
  const f = fixture(); await f.lifecycle.start(); await f.lifecycle.stop(); f.calls.length = 0;
  assert.equal(f.runtime.getSnapshot().state, 'offline');
  assert.equal(await f.lifecycle.requestExit('home'), 'saved');
  assert.equal(f.lifecycle.getSnapshot().confirming, false);
  assert.equal(f.runtime.getSnapshot().state, 'offline');
  assert.deepEqual(f.calls, ['freeze', 'flush', 'navigate:home']);
  f.lifecycle.dispose();
});

test('a disconnected tutor reconciles its owned segment and saves without an active-call popup', async () => {
  const f = fixture(); await f.lifecycle.start(); f.base.disconnect(); f.calls.length = 0;
  assert.equal(await f.lifecycle.requestExit('home'), 'saved');
  assert.equal(f.lifecycle.getSnapshot().confirming, false);
  assert.deepEqual(f.calls, ['freeze', 'read', 'stop', 'flush', 'navigate:home']); f.lifecycle.dispose();
});

test('written-only persistence failure keeps queued data and reports failure without an exit popup', async () => {
  const f = fixture(); const acknowledged = ['saved']; const queued = ['unsaved'];
  const confirmationStates: boolean[] = [];
  const unsubscribe = f.lifecycle.subscribe(() => confirmationStates.push(f.lifecycle.getSnapshot().confirming));
  f.setFlush(async () => { throw new Error('Persistence unavailable'); });
  await f.lifecycle.requestExit('home');
  assert.deepEqual(acknowledged, ['saved']); assert.deepEqual(queued, ['unsaved']);
  assert.equal(confirmationStates.includes(true), false);
  assert.equal(f.lifecycle.getSnapshot().frozen, false);
  assert.match(f.lifecycle.getSnapshot().error, /Progress could not be saved/);
  assert.deepEqual(f.calls, ['freeze', 'flush', 'release']);
  unsubscribe(); f.lifecycle.dispose();
});


test('Stop during runtime preparation ends the segment once without blocking restart or no-call exit', async () => {
  for (const next of ['restart', 'exit'] as const) {
    let release!: () => void; let prepares = 0;
    const f = fixture({ prepareConnection: async () => { if (++prepares === 1) await new Promise<void>(resolve => { release = resolve; }); } });
    const starting = f.lifecycle.start(); await tick();
    assert.equal(f.calls.filter(call => call === 'start').length, 1);
    const stopping = f.lifecycle.stop(); release(); await Promise.all([starting, stopping]);
    assert.equal(f.connects(), 0); assert.equal(f.calls.filter(call => call === 'stop').length, 1);
    assert.equal(f.lifecycle.getSnapshot().error, '');
    if (next === 'restart') { await f.lifecycle.start(); assert.equal(f.connects(), 1); assert.equal(f.runtime.getSnapshot().state, 'ready'); }
    else { assert.equal(await f.lifecycle.requestExit('home'), 'saved'); assert.equal(f.lifecycle.getSnapshot().confirming, false); }
    f.lifecycle.dispose();
  }
});
test('explicit Start after a same-session disconnect reconciles the old segment before connecting again', async () => {
  const f = fixture(); const context = f.runtime.getContext(); await f.lifecycle.start();
  f.base.disconnect(); assert.equal(f.runtime.getSnapshot().state, 'offline'); f.calls.length = 0;
  await f.lifecycle.start();
  assert.deepEqual(f.calls, ['read', 'stop', 'read', 'start']);
  assert.equal(f.connects(), 2); assert.equal(f.runtime.getSnapshot().state, 'ready');
  assert.equal(f.runtime.getContext(), context); assert.equal(f.runtime.sessionId, 's1');
  assert.equal(f.runtime.getSnapshot().hadConnectedCall, true); f.lifecycle.dispose();
});
test('a rejected disconnected-segment stop receipt blocks replacement and does not fabricate reconciliation', async () => {
  const f = fixture(); await f.lifecycle.start(); f.base.disconnect();
  f.sessions.stopCall = async () => { throw new Error('Stop not acknowledged'); };
  await f.lifecycle.start(); assert.equal(f.connects(), 1);
  assert.equal(f.calls.filter(call => call === 'start').length, 1);
  assert.match(f.lifecycle.getSnapshot().error, /needs checking/); f.lifecycle.dispose();
});

test('Stop while disconnected-segment reconciliation is pending prevents a replacement call', async () => {
  const f = fixture(); await f.lifecycle.start(); f.base.disconnect();
  const stopCall = f.sessions.stopCall; let release!: () => void;
  f.sessions.stopCall = async request => { await new Promise<void>(resolve => { release = resolve; }); return stopCall(request); };
  const restart = f.lifecycle.start(); await tick(); const stop = f.lifecycle.stop(); release(); await Promise.all([restart, stop]);
  assert.equal(f.connects(), 1); assert.equal(f.calls.filter(call => call === 'stop').length, 1);
  assert.equal(f.lifecycle.getSnapshot().error, ''); assert.equal(f.runtime.getSnapshot().state, 'offline'); f.lifecycle.dispose();
});
test('intentional startup cancellation still reports an unacknowledged segment stop', async () => {
  let release!: () => void;
  const f = fixture({ prepareConnection: () => new Promise<void>(resolve => { release = resolve; }) });
  f.sessions.stopCall = async () => { throw new Error('Stop receipt unavailable'); };
  const start = f.lifecycle.start(); await tick(); const stop = f.lifecycle.stop(); release(); await Promise.all([start, stop]);
  assert.equal(f.connects(), 0); assert.match(f.lifecycle.getSnapshot().error, /needs checking/);
  assert.equal(await f.lifecycle.requestExit('home'), undefined); f.lifecycle.dispose();
});

test('acknowledged cleanup after failed media preparation permits explicit retry and written-only exit', async () => {
  const f = fixture({ prepareConnection: async () => { throw new Error('Service unavailable'); } });
  await f.lifecycle.start();
  assert.equal(f.lifecycle.getSnapshot().error, '');
  assert.match(f.runtime.getSnapshot().error, /Service unavailable/);
  assert.equal(f.runtime.getSnapshot().hadConnectedCall, false);
  await f.lifecycle.start(); assert.equal(f.calls.filter(call => call === 'start').length, 2);
  assert.equal(f.calls.filter(call => call === 'stop').length, 2);
  assert.equal(await f.lifecycle.requestExit('home'), 'saved');
  assert.equal(f.lifecycle.getSnapshot().confirming, false); f.lifecycle.dispose();
});

test('exit cancels pending connection preparation before saving the still-open canonical session', async () => {
  const f = fixture({ prepareConnection: signal => new Promise<void>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  const start = f.lifecycle.start(); await tick();
  assert.equal(await f.lifecycle.requestExit('home'), 'saved'); await start;
  assert.equal(f.lifecycle.getSnapshot().confirming, false);
  assert.equal(f.connects(), 0);
  assert.ok(f.calls.indexOf('stop') < f.calls.indexOf('flush'));
  assert.equal(f.calls.includes('close'), false); f.lifecycle.dispose();
});

test('exit does not wait for a browser permission prompt that ignores abort', async () => {
  const f = fixture(); let release!: () => void;
  f.runtime.voice.connect = () => new Promise<void>(resolve => { release = resolve; });
  const start = f.lifecycle.start(); await tick();
  assert.equal(await f.lifecycle.requestExit('home'), 'saved'); await start;
  assert.equal(f.runtime.getSnapshot().state, 'offline');
  release(); await tick(); assert.equal(f.runtime.getSnapshot().hadConnectedCall, false);
  f.lifecycle.dispose();
});

test('confirmed current-call departure reports intervals and cleans up without closing written practice', async () => {
  const f = fixture(); const order: string[] = []; const reports: any[] = [];
  const lifecycle = createSessionLifecycle(f.runtime, {
    sessions: { ...f.sessions, async confirmClose(input) { order.push('close'); return f.sessions.confirmClose(input); } }, hadConnectedCall: null,
    progress: { async flush() { order.push('flush'); return { sessionId: 's1', journalRevision: 0 }; } },
    async reportCall(segment, intervals) { reports.push({ segment, intervals }); order.push('reported'); },
    async reconcileClose() { order.push('cleanup'); }, freezeWrites() {}, releasePreparation() {}, operationId: () => crypto.randomUUID(), isCurrent: () => true, navigate() {},
  });
  await lifecycle.start();
  const exit = lifecycle.requestExit('home'); await tick(); assert.equal(lifecycle.getSnapshot().confirming, true);
  assert.equal(reports.length, 0);
  lifecycle.decide('confirm'); assert.equal(await exit, 'saved');
  assert.equal(reports.length, 1); assert.equal(reports[0].intervals.length, 1); assert.equal(reports[0].segment.sessionId, 's1');
  assert.deepEqual(order, ['reported','cleanup','flush']); lifecycle.dispose(); f.lifecycle.dispose();
});

test('failed cleanup after a confirmed call retries cleanup before saving the same open record', async () => {
  const f = fixture(); f.lifecycle.dispose(); const order: string[] = []; let cleanupFails = true;
  const lifecycle = createSessionLifecycle(f.runtime, {
    sessions: f.sessions, progress: { async flush() { order.push('flush'); return { sessionId: 's1', journalRevision: 1 }; } },
    async reconcileClose() { order.push('cleanup'); if (cleanupFails) throw new Error('Cleanup unavailable'); },
    freezeWrites() { order.push('freeze'); }, releasePreparation() { order.push('release'); },
    operationId: () => crypto.randomUUID(), isCurrent: () => true, navigate: target => order.push(`navigate:${target}`),
  });
  await lifecycle.start(); const exit = lifecycle.requestExit('home'); await tick(); lifecycle.decide('confirm'); await exit;
  assert.equal(lifecycle.getSnapshot().canRetryExit, true); assert.equal(lifecycle.getSnapshot().frozen, false);
  assert.deepEqual(order, ['freeze', 'cleanup', 'release']); assert.equal(f.calls.includes('close'), false);
  cleanupFails = false; assert.equal(await lifecycle.retryExit(), 'saved');
  assert.deepEqual(order, ['freeze', 'cleanup', 'release', 'freeze', 'cleanup', 'flush', 'navigate:home']);
  assert.equal(f.calls.filter(call => call === 'stop').length, 1); assert.equal(f.calls.includes('close'), false); lifecycle.dispose();
});

test('unknown and earlier call history cannot close or prompt for a written-only visit', async () => {
  for (const hadConnectedCall of [null, true, false]) {
    const f = fixture(); f.lifecycle.dispose();
    const lifecycle = createSessionLifecycle(f.runtime, { sessions: f.sessions, hadConnectedCall,
      progress: { async flush() { f.calls.push('flush'); return { sessionId: 's1', journalRevision: 2 }; } },
      freezeWrites() { f.calls.push('freeze'); }, releasePreparation() { f.calls.push('release'); },
      async reconcileClose() { throw new Error('Written departure must not finalize history'); },
      operationId: () => 'unused', isCurrent: () => true, navigate: target => f.calls.push(`navigate:${target}`),
    });
    assert.equal(await lifecycle.requestExit('home'), 'saved'); assert.equal(lifecycle.getSnapshot().confirming, false);
    assert.deepEqual(f.calls, ['freeze', 'flush', 'navigate:home']); lifecycle.dispose();
  }
});

test('duplicate written departures share one flush and preserve the first destination', async () => {
  const f = fixture(); let release!: () => void;
  f.setFlush(() => new Promise(resolve => { release = () => resolve({ sessionId: 's1', journalRevision: 3 }); }));
  const first = f.lifecycle.requestExit('home'); const second = f.lifecycle.requestExit('other');
  assert.equal(first, second); await tick(); assert.deepEqual(f.calls, ['freeze', 'flush']);
  release(); assert.equal(await first, 'saved'); assert.equal(await second, 'saved');
  assert.deepEqual(f.calls, ['freeze', 'flush', 'navigate:home']); f.lifecycle.dispose();
});

test('cancelling startup for departure keeps saving busy until queued progress is acknowledged', async () => {
  const f = fixture({}, { prepareConnection: () => new Promise<void>(() => {}) });
  let release!: () => void;
  f.setFlush(() => new Promise(resolve => { release = () => resolve({ sessionId: 's1', journalRevision: 3 }); }));
  const starting = f.lifecycle.start(); await tick(); const leaving = f.lifecycle.requestExit('home'); await tick();
  assert.equal(f.lifecycle.getSnapshot().callStarting, false); assert.equal(f.lifecycle.getSnapshot().busy, true);
  await f.lifecycle.start(); assert.equal(f.connects(), 0);
  release(); assert.equal(await leaving, 'saved'); await starting;
  assert.equal(f.lifecycle.getSnapshot().busy, false); assert.equal(f.calls.includes('close'), false); f.lifecycle.dispose();
});

test('late written flush does not navigate a superseded session', async () => {
  const f = fixture(); let release!: () => void;
  f.setFlush(() => new Promise(resolve => { release = () => resolve({ sessionId: 's1', journalRevision: 3 }); }));
  const exit = f.lifecycle.requestExit('home'); await tick(); f.stale(); release();
  assert.equal(await exit, 'stale'); assert.deepEqual(f.calls, ['freeze', 'flush', 'release']); f.lifecycle.dispose();
});

test('written save retry remains a save and does not close the canonical session', async () => {
  const f = fixture(); let offline = true;
  f.setFlush(async () => { if (offline) throw new Error('Offline'); return { sessionId: 's1', journalRevision: 3 }; });
  await f.lifecycle.requestExit('home'); assert.equal(f.lifecycle.getSnapshot().canRetryExit, true);
  offline = false; assert.equal(await f.lifecycle.retryExit(), 'saved');
  assert.deepEqual(f.calls, ['freeze', 'flush', 'release', 'freeze', 'flush', 'navigate:home']); f.lifecycle.dispose();
});

test('an unrelated or invalid written receipt cannot permit departure', async () => {
  for (const receipt of [{ sessionId: 'other', journalRevision: 3 }, { sessionId: 's1', journalRevision: -1 }]) {
    const f = fixture(); f.setFlush(async () => receipt); await f.lifecycle.requestExit('home');
    assert.deepEqual(f.calls, ['freeze', 'flush', 'release']); assert.equal(f.lifecycle.getSnapshot().frozen, false); f.lifecycle.dispose();
  }
});

test('timing observer survives cleanup/reactivation without duplicate subscriptions or counting disposed time', async t => {
  const f = fixture(); f.lifecycle.dispose();
  let now = Date.parse('2026-10-18T12:00:00Z');
  t.mock.method(Date, 'now', () => now);
  const subscribe = f.runtime.subscribe;
  let observers = 0;
  f.runtime.subscribe = listener => {
    observers++;
    const unsubscribe = subscribe(listener);
    return () => { observers--; unsubscribe(); };
  };
  const reports: (readonly { start: string; end: string }[])[] = [];
  const lifecycle = createSessionLifecycle(f.runtime, {
    sessions: f.sessions, progress: { async flush() { return { sessionId: 's1', journalRevision: 0 }; } },
    async reportCall(_segment, intervals) { reports.push([...intervals]); },
    freezeWrites() {}, releasePreparation() {}, operationId: () => crypto.randomUUID(), isCurrent: () => true, navigate() {},
  });
  try {
    assert.equal(observers, 1);
    lifecycle.dispose(); lifecycle.dispose(); assert.equal(observers, 0);
    lifecycle.activate(); lifecycle.activate(); assert.equal(observers, 1);
    await lifecycle.start(); now += 1000; await lifecycle.stop();
    assert.deepEqual(reports, [[{ start: '2026-10-18T12:00:00.000Z', end: '2026-10-18T12:00:01.000Z' }]]);
    await lifecycle.start(); now += 2000;
    lifecycle.dispose(); assert.equal(observers, 0);
    now += 60000;
    lifecycle.activate(); lifecycle.activate(); assert.equal(observers, 1);
    await lifecycle.stop();
    assert.deepEqual(reports[1], [{ start: '2026-10-18T12:00:01.000Z', end: '2026-10-18T12:00:03.000Z' }]);
  } finally { lifecycle.dispose(); }
  assert.equal(observers, 0);
});
