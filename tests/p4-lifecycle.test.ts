import test from 'node:test';
import assert from 'node:assert/strict';
import type { CloseResult, SessionCommands, VoiceEvent } from '../src/contracts';
import { createSessionRuntime } from '../src/app/session-runtime';
import { createSessionLifecycle } from '../src/app/session-lifecycle';
import { createMockVoiceAdapter } from '../src/voice/mock';
import { verbContext } from './helpers/assessment-fixtures';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  const base = createMockVoiceAdapter();
  let connects = 0; const connect = base.connect;
  base.connect = async options => { connects++; return connect(options); };
  const runtime = createSessionRuntime(base, 's1'); runtime.voice.setContext(verbContext());
  const calls: string[] = []; let revision = 0; let sequence = 0; let current = true; let rejectFlush = false;
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
    sessions, progress: { async flush() { calls.push('flush'); if (rejectFlush) throw new Error('Rejected final event'); return { sessionId: 's1', journalRevision: 7 }; } },
    freezeWrites() { calls.push('freeze'); }, releasePreparation() { calls.push('release'); },
    operationId: () => `operation-${++sequence}`, isCurrent: () => current, navigate: target => calls.push(`navigate:${target}`),
  });
  return { runtime, lifecycle, calls, sessions, connects: () => connects, rejectFlush: () => { rejectFlush = true; }, stale: () => { current = false; },
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
test('cancel exit preserves live call and sends no progress or close operation', async () => {
  const f = fixture(); await f.lifecycle.start(); f.calls.length = 0;
  const exit = f.lifecycle.requestExit('home'); await tick();
  assert.equal(f.lifecycle.getSnapshot().confirming, true); f.lifecycle.decide('cancel');
  assert.equal(await exit, 'cancelled'); assert.equal(f.runtime.getSnapshot().state, 'ready'); assert.deepEqual(f.calls, []);
  f.lifecycle.dispose();
});
test('confirmed connected session flushes before one close and retains the first destination', async () => {
  const f = fixture(); await f.lifecycle.start(); await f.lifecycle.stop(); await f.lifecycle.start(); f.calls.length = 0;
  const first = f.lifecycle.requestExit('home'); const second = f.lifecycle.requestExit('other'); await tick();
  f.lifecycle.decide('confirm'); await Promise.all([first, second]);
  assert.deepEqual(f.calls, ['freeze', 'read', 'stop', 'flush', 'read', 'close', 'navigate:home']);
  f.lifecycle.dispose();
});
test('no-call exit does not confirm or create a call or directly request feedback', async () => {
  const f = fixture(); await f.lifecycle.requestExit('home');
  assert.equal(f.lifecycle.getSnapshot().confirming, false); assert.equal(f.connects(), 0);
  assert.deepEqual(f.calls, ['freeze', 'flush', 'read', 'close', 'navigate:home']); f.lifecycle.dispose();
});
test('rejected final progress releases preparation and never closes or navigates', async () => {
  const f = fixture(); f.rejectFlush(); await f.lifecycle.requestExit('home');
  assert.deepEqual(f.calls, ['freeze', 'flush', 'release']); assert.equal(f.lifecycle.getSnapshot().frozen, false);
  assert.match(f.lifecycle.getSnapshot().error, /Progress could not be saved/); f.lifecycle.dispose();
});
test('ambiguous close stays frozen without an automatic or UI retry policy', async () => {
  const f = fixture(); f.setClose(async () => { throw new Error('Lost reply'); });
  await f.lifecycle.requestExit('home'); await f.lifecycle.requestExit('other');
  assert.equal(f.calls.filter(x => x === 'close').length, 1); assert.equal(f.lifecycle.getSnapshot().frozen, true);
  assert.equal(f.lifecycle.getSnapshot().uncertainClose, true); assert.ok(!f.calls.some(x => x.startsWith('navigate:'))); f.lifecycle.dispose();
});
test('late close cannot navigate a superseded session', async () => {
  const f = fixture(); let finish!: (result: CloseResult) => void;
  f.setClose(request => new Promise(resolve => { finish = result => resolve({ ...result, sessionId: request.sessionId, operationId: request.operationId }); }));
  const exit = f.lifecycle.requestExit('home'); await tick(); f.stale();
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
  await f.lifecycle.requestExit('home'); await f.lifecycle.requestExit('other');
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
