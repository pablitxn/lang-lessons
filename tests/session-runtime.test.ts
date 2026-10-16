import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRuntime } from '../src/app/session-runtime';
import { createMockVoiceAdapter } from '../src/voice';
import { createAssessmentController } from '../src/assessment';
import { FakeClock, batch, verbContext } from './helpers/assessment-fixtures';

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
