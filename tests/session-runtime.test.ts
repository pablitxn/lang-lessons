import test from 'node:test';
import assert from 'node:assert/strict';
import { checkVoiceAvailability, createSessionRuntime } from '../src/app/session-runtime';
import { createMockVoiceAdapter } from '../src/voice';
import { createAssessmentController } from '../src/assessment';
import { FakeClock, batch, verbContext } from './helpers/assessment-fixtures';
import { createVerbSession } from '../src/features/verbs/session';
import { VerbFixtureAdapter } from '../src/features/verbs/__fixtures__/adapter';

test('late feature subscriptions receive the current connection and independent root holds', async () => {
  const runtime = createSessionRuntime(createMockVoiceAdapter(), 's1');
  runtime.voice.setContext(verbContext()); await runtime.start(); runtime.hold('preferences', true);
  const controller = createAssessmentController({ context: verbContext(), allowMock: true });
  const unsubscribe = runtime.voice.subscribe(controller.handleVoiceEvent);
  assert.equal(controller.getSnapshot().interaction.connection, 'ready');
  assert.deepEqual(controller.getSnapshot().interaction.presentationHolds, ['preferences']);
  controller.setPresentationHold('reference', true); runtime.hold('preferences', false);
  assert.deepEqual(controller.getSnapshot().interaction.presentationHolds, ['reference']);
  unsubscribe(); controller.dispose(); runtime.stop();
});
test('root preferences cancel advancement without discarding completed independent evidence', async () => {
  const clock = new FakeClock(); let advanced = 0;
  const runtime = createSessionRuntime(createMockVoiceAdapter(), 's1');
  const controller = createAssessmentController({ context: verbContext(), allowMock: true, clock, onAdvance: () => { advanced++; } });
  runtime.voice.setContext(verbContext()); runtime.voice.subscribe(controller.handleVoiceEvent); await runtime.start();
  const refs = controller.beginAttempt(controller.getOpenObligations()); controller.applyBatch(batch(refs));
  runtime.hold('preferences', true); clock.advance(10000); assert.equal(advanced, 0);
  assert.equal(Object.values(controller.getSnapshot().evidence).filter(record => record.status === 'accepted').length, 10);
  runtime.hold('preferences', false); clock.advance(1799); assert.equal(advanced, 0); clock.advance(1); assert.equal(advanced, 1);
  controller.dispose(); runtime.stop();
});
test('stop intent disconnects the owned session and explicit restart clears pause intent', async () => {
  const base = createMockVoiceAdapter(); const runtime = createSessionRuntime(base, 's1');
  const controller = createAssessmentController({ context: verbContext(), allowMock: true });
  runtime.voice.setContext(verbContext()); runtime.voice.subscribe(controller.handleVoiceEvent); await runtime.start();
  base.simulateIntent('stop'); assert.equal(runtime.getSnapshot().state, 'offline');
  assert.equal(controller.getSnapshot().interaction.intent, 'stop');
  await runtime.start(); assert.equal(controller.getSnapshot().interaction.intent, 'practice');
  assert.equal(runtime.getSnapshot().state, 'ready'); runtime.stop(); controller.dispose();
});
test('pending generation alone blocks completion even before assistant audio starts', () => {
  const clock = new FakeClock(); let advanced = 0;
  const controller = createAssessmentController({ context: verbContext(), allowMock: true, clock, onAdvance: () => { advanced++; } });
  controller.setInteraction({ connection: 'ready' });
  controller.applyBatch(batch(controller.beginAttempt(controller.getOpenObligations())));
  controller.handleVoiceEvent({ sessionId: 's1', eventId: 'pending', type: 'response-pending', count: 1 });
  clock.advance(5000); assert.equal(advanced, 0);
  controller.handleVoiceEvent({ sessionId: 's1', eventId: 'done', type: 'response-pending', count: 0 });
  clock.advance(1800); assert.equal(advanced, 1); controller.dispose();
});
test('disconnect clears obsolete speaking signals so explicit restart can become quiet', async () => {
  const base = createMockVoiceAdapter(); const runtime = createSessionRuntime(base, 's1');
  const controller = createAssessmentController({ context: verbContext(), allowMock: true });
  runtime.voice.setContext(verbContext()); runtime.voice.subscribe(controller.handleVoiceEvent); await runtime.start();
  base.simulateSpeech('learner', true); base.simulateSpeech('assistant', true);
  runtime.stop();
  assert.equal(controller.getSnapshot().interaction.learnerSpeaking, false);
  assert.equal(controller.getSnapshot().interaction.assistantSpeaking, false);
  await runtime.start(); assert.equal(controller.getSnapshot().interaction.connection, 'ready');
  runtime.stop(); controller.dispose();
});
test('initial offline replay and a deliberate idle stop do not show a transport failure', async () => {
  const runtime = createSessionRuntime(createMockVoiceAdapter(), 's1');
  const controller = createAssessmentController({ context: verbContext(), allowMock: true });
  runtime.voice.setContext(verbContext()); runtime.voice.subscribe(controller.handleVoiceEvent);
  assert.equal(controller.getSnapshot().systemError, null);
  await runtime.start(); runtime.stop(); assert.equal(controller.getSnapshot().systemError, null);
  controller.dispose();
});
test('claimed queued verb audio is assessed once and never dispatched as competing conversation', async () => {
  // This real-mode contract fixture has no media, fetch or provider implementation.
  const base = new VerbFixtureAdapter('s1', false, 'openai-realtime');
  const runtime = createSessionRuntime(base, 's1'); await runtime.start();
  const session = createVerbSession({ voice: runtime.voice, sessionId: 's1', mode: 'verb-visible',
    claimUtterance: runtime.claimUtterance, random: () => 0, onComplete() {} });
  base.utterance('First recorded fixture.', false, 'audio-1');
  base.utterance('Queued recorded fixture.', false, 'audio-2');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(base.inputs.length, 1); assert.equal(base.inputs[0]?.attempts.length, 7);
  const first = base.inputs[0]!;
  base.emit({ type: 'assessment', batch: { ...first, eventId: 'partial', results: first.attempts.map((ref, index) => ({
    ref, status: index === 0 ? 'accepted' : 'uncertain',
    source: { kind: 'audio', utteranceId: 'audio-1', audioAvailable: true }, feedback: 'Injected acoustic fixture, not real evaluation.',
  })) } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(base.inputs.length, 2); assert.equal(base.inputs[1]?.utteranceId, 'audio-2');
  assert.equal(base.inputs[1]?.attempts.length, 6);
  assert.equal(base.inputs[1]?.attempts.some(ref => ref.obligation === first.attempts[0]?.obligation), false);
  base.settle(base.inputs[1]!, 'accepted', { kind: 'audio', utteranceId: 'audio-2', audioAvailable: true });
  base.utterance('A question after the oral checklist.', false, 'audio-3');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(base.inputs.length, 3); assert.equal(base.inputs[2]?.attempts.length, 0);
  base.utterance('Duplicate final event.', false, 'audio-3');
  await Promise.resolve(); assert.equal(base.inputs.length, 3);
  session.dispose(); runtime.stop();
});
test('claimed uncertain audio stays uncertainty without a fallback model request', async () => {
  const base = new VerbFixtureAdapter('s1', false, 'openai-realtime');
  const runtime = createSessionRuntime(base, 's1'); await runtime.start();
  const session = createVerbSession({ voice: runtime.voice, sessionId: 's1', mode: 'verb-image',
    claimUtterance: runtime.claimUtterance, random: () => 0, onComplete() {} });
  base.utterance('', true, 'uncertain-audio');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(base.inputs.length, 0);
  assert.equal(Object.values(session.getSnapshot().assessment.evidence).filter(record => record.status === 'uncertain').length, 7);
  session.dispose(); runtime.stop();
});
test('stop and immediate restart cancel an unclaimed conversation microtask', async () => {
  const base = new VerbFixtureAdapter('s1', false, 'openai-realtime');
  const runtime = createSessionRuntime(base, 's1'); runtime.voice.setContext(verbContext()); await runtime.start();
  base.utterance('Queued before stop.', false, 'old-audio');
  runtime.stop(); await runtime.start(); await Promise.resolve();
  assert.equal(base.inputs.length, 0); runtime.stop();
});
test('stop cancels a claimed queued assessment without replaying it after reconnect', async () => {
  const base = new VerbFixtureAdapter('s1', false, 'openai-realtime');
  const runtime = createSessionRuntime(base, 's1'); await runtime.start();
  const session = createVerbSession({ voice: runtime.voice, sessionId: 's1', mode: 'verb-image',
    claimUtterance: runtime.claimUtterance, random: () => 0, onComplete() {} });
  base.utterance('Unsubmitted queued audio.', false, 'old-audio');
  runtime.stop(); await runtime.start(); await Promise.resolve();
  assert.equal(base.inputs.length, 0);
  assert.equal(session.getSnapshot().assessment.interaction.presentationHolds.length, 0);
  session.dispose(); runtime.stop();
});
test('a claimed second utterance becomes conversation if the first finishes every oral obligation', async () => {
  const base = new VerbFixtureAdapter('s1', false, 'openai-realtime');
  const runtime = createSessionRuntime(base, 's1'); await runtime.start();
  const session = createVerbSession({ voice: runtime.voice, sessionId: 's1', mode: 'verb-image',
    claimUtterance: runtime.claimUtterance, random: () => 0, onComplete() {} });
  try {
    base.utterance('All oral work.', false, 'first'); base.utterance('A queued question.', false, 'second');
    await Promise.resolve(); await Promise.resolve();
    base.settle(base.inputs[0]!, 'accepted', { kind: 'audio', utteranceId: 'first', audioAvailable: true });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(base.inputs.length, 2);
    assert.equal(base.inputs[1]?.utteranceId, 'second'); assert.deepEqual(base.inputs[1]?.attempts, []);
  } finally { session.dispose(); runtime.stop(); }
});
test('a claimed unclear turn after oral completion asks for clarification instead of disappearing', async () => {
  const base = new VerbFixtureAdapter('s1', false, 'openai-realtime');
  const runtime = createSessionRuntime(base, 's1'); await runtime.start();
  const session = createVerbSession({ voice: runtime.voice, sessionId: 's1', mode: 'verb-image',
    claimUtterance: runtime.claimUtterance, random: () => 0, onComplete() {} });
  base.utterance('All oral work.', false, 'first'); base.utterance('', true, 'unclear-second');
  await Promise.resolve(); await Promise.resolve();
  base.settle(base.inputs[0]!, 'accepted', { kind: 'audio', utteranceId: 'first', audioAvailable: true });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(base.inputs.length, 1);
  assert.equal(session.getSnapshot().assessment.interaction.questionPending, true);
  assert.match(session.getSnapshot().coachText, /clarify/);
  session.dispose(); runtime.stop();
});

test('voice readiness accepts only an enabled service before starting the adapter', async () => {
  for (const payload of [{ enabled: false }, { enabled: false, reason: 'disabled' }, { enabled: false, reason: 'missing-credentials' }]) {
    const base = createMockVoiceAdapter(); let connections = 0;
    const connect = base.connect; base.connect = async options => { connections++; await connect(options); };
    const runtime = createSessionRuntime(base, 's1', { prepareConnection: signal => checkVoiceAvailability(signal,
      async () => new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })) });
    await assert.rejects(runtime.start(), /Voice/);
    assert.equal(connections, 0); assert.equal(runtime.getSnapshot().state, 'error');
    assert.match(runtime.getSnapshot().error, /Voice/); runtime.stop();
  }
  await checkVoiceAvailability(new AbortController().signal, async () => new Response('{"enabled":true}'));
});

test('unavailable or malformed readiness responses never become a connected call', async () => {
  for (const request of [async () => new Response('', { status: 503 }), async () => new Response('<html>'),
    async () => { throw new Error('Network fixture'); },
    ...[{ enabled: 'true' }, {}, null].map(payload => async () => new Response(JSON.stringify(payload)))]) {
    await assert.rejects(checkVoiceAvailability(new AbortController().signal, request), /unavailable/);
  }
});

test('immediate effect cleanup cancels startup before readiness or microphone activity', async () => {
  const base = createMockVoiceAdapter(); let preparations = 0; let connections = 0;
  const connect = base.connect; base.connect = async options => { connections++; await connect(options); };
  const runtime = createSessionRuntime(base, 's1', { prepareConnection: async () => { preparations++; } });
  const first = runtime.start(); const cancelled = assert.rejects(first, { name: 'AbortError' });
  runtime.stop();
  const second = runtime.start();
  await Promise.all([cancelled, second]);
  assert.equal(preparations, 1); assert.equal(connections, 1); assert.equal(runtime.getSnapshot().state, 'ready');
  runtime.stop();
});

test('overlapping start actions share one readiness check and one connection', async () => {
  const base = createMockVoiceAdapter(); let preparations = 0; let connections = 0;
  const connect = base.connect; base.connect = async options => { connections++; await connect(options); };
  const runtime = createSessionRuntime(base, 's1', { prepareConnection: async () => { preparations++; } });
  const first = runtime.start(); const second = runtime.start();
  assert.equal(first, second); await Promise.all([first, second]); await runtime.start();
  assert.equal(preparations, 1); assert.equal(connections, 1); runtime.stop();
});

test('pause during readiness cancels the call and a late failure cannot overwrite a resumed call', async () => {
  const base = createMockVoiceAdapter(); let rejectFirst!: (error: Error) => void; let preparations = 0; let connections = 0;
  const connect = base.connect; base.connect = async options => { connections++; await connect(options); };
  const runtime = createSessionRuntime(base, 's1', { prepareConnection: () => ++preparations === 1
    ? new Promise<void>((_resolve, reject) => { rejectFirst = reject; }) : Promise.resolve() });
  const first = runtime.start(); const failed = assert.rejects(first, /Old readiness fixture/);
  await Promise.resolve(); runtime.pause();
  assert.equal(runtime.getSnapshot().state, 'offline'); assert.equal(runtime.getSnapshot().paused, true);
  await runtime.resume(); rejectFirst(new Error('Old readiness fixture')); await failed;
  assert.equal(connections, 1); assert.equal(runtime.getSnapshot().state, 'ready');
  assert.equal(runtime.getSnapshot().error, ''); assert.equal(runtime.getSnapshot().paused, false); runtime.stop();
});

test('pause releases the call while preserving the exercise and accepted evidence for explicit resume', async () => {
  const base = createMockVoiceAdapter(); const runtime = createSessionRuntime(base, 's1');
  const context = verbContext(); const controller = createAssessmentController({ context, allowMock: true });
  runtime.voice.setContext(context); runtime.voice.subscribe(controller.handleVoiceEvent); await runtime.start();
  const refs = controller.beginAttempt(['meaning']); controller.applyBatch(batch(refs));
  runtime.pause();
  assert.equal(runtime.getSnapshot().state, 'offline'); assert.equal(runtime.getSnapshot().muted, true);
  assert.equal(controller.getSnapshot().interaction.intent, 'pause');
  assert.equal(controller.getSnapshot().evidence.meaning?.status, 'accepted');
  assert.equal(runtime.getContext(), context);
  await runtime.resume();
  assert.equal(runtime.getSnapshot().state, 'ready'); assert.equal(controller.getSnapshot().interaction.intent, 'practice');
  assert.equal(controller.getSnapshot().evidence.meaning?.status, 'accepted');
  runtime.stop(); controller.dispose();
});

test('a spoken pause intent disconnects rather than leaving the microphone active', async () => {
  const base = createMockVoiceAdapter(); const runtime = createSessionRuntime(base, 's1');
  runtime.voice.setContext(verbContext()); await runtime.start(); base.simulateIntent('pause');
  assert.equal(runtime.getSnapshot().state, 'offline'); assert.equal(runtime.getSnapshot().muted, true);
  assert.equal(runtime.getSnapshot().paused, true); runtime.stop();
});


test('voice readiness distinguishes disabled calls from missing server credentials without exposing provider details', async () => {
  const signal = new AbortController().signal;
  for (const [reason, expected] of [
    ['disabled', /turned off/], ['missing-credentials', /API key/], ['unknown', /not ready/],
  ] as const) {
    await assert.rejects(checkVoiceAvailability(signal, async () => new Response(JSON.stringify({
      enabled: false, reason, error: 'Untrusted provider detail that must never be shown',
    }))), expected);
  }
});
