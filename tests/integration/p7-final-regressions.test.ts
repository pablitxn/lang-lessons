import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRuntime } from '../../src/app/session-runtime';
import { createSessionLifecycle } from '../../src/app/session-lifecycle';
import { createMockVoiceAdapter } from '../../src/voice/mock';
import type { SessionCommands, VoiceEvent } from '../../src/contracts';
const tick = () => new Promise<void>(r => setImmediate(r));
function fixture() {
  const base = createMockVoiceAdapter(); let deliver: ((e: VoiceEvent) => void) | undefined;
  const originalSubscribe = base.subscribe; base.subscribe = fn => { deliver = fn; return originalSubscribe(fn); };
  let release!: () => void; let delayed = false; let starts = 0; let stops = 0;
  const runtime = createSessionRuntime(base, 's', { prepareConnection: async () => { if (delayed) await new Promise<void>(r => { release = r; }); } });
  const snapshot = () => ({ sessionId: 's', mode: 'verb-image' as const, status: 'open' as const, revision: 0 });
  const sessions: SessionCommands = {
    create: async () => snapshot(), read: async () => snapshot(),
    startCall: async () => ({ session: snapshot(), segment: { sessionId: 's', segmentId: `segment-${++starts}`, connectionEpoch: starts } }),
    stopCall: async () => { stops++; return snapshot(); },
    confirmClose: async req => ({ sessionId: 's', operationId: req.operationId, status: 'closed', revision: 1, feedback: 'not-requested' }), readClose: async () => null,
  };
  const lifecycle = createSessionLifecycle(runtime, { sessions, progress: { flush: async () => ({ sessionId: 's', journalRevision: 0 }) }, freezeWrites() {}, releasePreparation() {}, operationId: () => crypto.randomUUID(), isCurrent: () => true, navigate() {} });
  return { runtime, lifecycle, delay: () => { delayed = true; }, undelay: () => { delayed = false; }, release: () => release(), counts: () => ({ starts, stops }), disconnect: () => deliver!({ sessionId: 's', eventId: 'disconnect', type: 'state', state: 'offline' }) };
}
test('P7 independent remediation: cancelled connection can restart', async () => {
 const f = fixture(); f.delay(); const starting = f.lifecycle.start(); await tick();
 const stopping = f.lifecycle.stop(); f.release(); await Promise.all([starting, stopping]);
 assert.equal(f.counts().stops, 1); assert.equal(f.runtime.getSnapshot().hadConnectedCall, false);
 assert.equal(f.lifecycle.getSnapshot().error, '');
 f.undelay(); await f.lifecycle.start(); assert.equal(f.counts().starts, 2);
 assert.equal(f.runtime.getSnapshot().state, 'ready');
 f.lifecycle.dispose();
});
test('P7 independent remediation: reconnect reconciles disconnected segment', async () => {
 const f = fixture(); await f.lifecycle.start(); assert.equal(f.runtime.getSnapshot().state, 'ready');
 f.disconnect(); assert.equal(f.runtime.getSnapshot().state, 'offline'); await f.lifecycle.start();
 assert.deepEqual(f.counts(), { starts: 2, stops: 1 }); assert.equal(f.runtime.getSnapshot().state, 'ready'); f.lifecycle.dispose();
});
test('P7 independent remediation: written-only Pictures completion opens card', async () => {
 const { createVerbSession } = await import('../../src/features/verbs/session');
 const { createRealtimeVoiceAdapter } = await import('../../src/voice/realtime');
 const session = createVerbSession({ voice: createRealtimeVoiceAdapter(), mode: 'verb-image', sessionId: 's', random: () => 0, onComplete() {} });
 for (const [form, value] of [['base','be'],['past','was'],['participle','been']] as const) { session.edit(form, value); session.finalize(form, value); }
 for (const form of ['base','past','participle'] as const) assert.equal(session.getSnapshot().assessment.evidence[`spelling:${form}`]?.status, 'accepted');
 assert.equal(session.getSnapshot().pictureComplete, true);
 assert.equal(session.getSnapshot().assessment.completed, false);
 const id = session.getSnapshot().assessment.exerciseId;
 assert.equal(session.nextPicture(id), true); assert.equal(session.nextPicture(id), false); session.dispose();
});
