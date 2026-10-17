import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessSpelling, createAssessmentController } from '../src/assessment';
import { createMockVoiceAdapter } from '../src/voice';
import type { AttemptRef, VoiceEvent } from '../src/contracts';
import { sentenceContext, verbContext } from './helpers/assessment-fixtures';

const ref: AttemptRef = { sessionId: 's1', exerciseId: 'e1', generation: 1, obligation: 'spelling:past', attemptId: 'a1', revision: 1 };
test('mock sentence audio remains scoped to its captured stage through a return to translation', async () => {
  const voice = createMockVoiceAdapter(); const events: VoiceEvent[] = []; const context = sentenceContext();
  assert.equal(context.mode, 'sentence'); if (context.mode !== 'sentence') return;
  voice.setContext(context);
  voice.subscribe(event => {
    events.push(event);
    if (event.type === 'speech' && event.speaker === 'learner' && event.active) {
      voice.setContext({ ...context, stage: 'explanation' }); voice.setContext(context);
    }
  });
  await voice.connect({ sessionId: 's1', signal: new AbortController().signal });
  try {
    const utteranceId = voice.simulateUtterance('Simulated response.');
    assert.deepEqual(events.find(event => event.type === 'transcript')?.sentenceScope, { capturedStage: 'translation', eligible: false });
    await voice.submit({ ...context, inputId: 'old', kind: 'utterance', text: 'Simulated response.', utteranceId,
      attempts: [{ ...context, obligation: 'translation', attemptId: 'new-stage', revision: 2 }] });
    assert.equal(events.find(event => event.type === 'assessment')?.batch.results[0]?.status, 'uncertain');
  } finally { voice.disconnect(); }
});
test('spelling accepts the form without supplying or rewriting the learner answer', () => {
  const accepted = assessSpelling(verbContext(), ref, 'BOUGHT', 'input');
  assert.equal(accepted.status, 'accepted'); assert.equal(accepted.spelling?.submittedText, 'BOUGHT');
  const wrong = assessSpelling(verbContext(), ref, 'buyed', 'input');
  assert.equal(wrong.status, 'incorrect'); assert.ok(wrong.spelling!.incorrectGraphemeIndices.length > 0);
  assert.equal(JSON.stringify(wrong).includes('bought'), false);
});
test('spelling reports gaps and graphemes without revealing missing letters', () => {
  const missing = assessSpelling(verbContext(), ref, 'bough', 'input');
  assert.deepEqual(missing.spelling?.missingGraphemeIndices, [5]);
  const combined = assessSpelling(verbContext(), ref, 'bo\u0301ught', 'input');
  assert.ok(combined.spelling!.incorrectGraphemeIndices.every(index => index < 6));
  assert.equal(assessSpelling(verbContext(), ref, '', 'input').status, 'uncertain');
});
test('mock simulation is explicit, supports simultaneous obligations, and makes no audio claim', async () => {
  const voice = createMockVoiceAdapter(); const events: VoiceEvent[] = [];
  const controller = createAssessmentController({ context: verbContext(), allowMock: true, onContextChange: voice.setContext });
  const unsubscribe = voice.subscribe(event => { events.push(event); controller.handleVoiceEvent(event); });
  const abort = new AbortController(); await voice.connect({ sessionId: 's1', signal: abort.signal });
  const utteranceId = voice.simulateUtterance('A simulated combined response.');
  const attempts = controller.beginAttempt(['meaning', 'pronunciation:base', 'sentence:base']);
  await voice.submit({ ...verbContext(), inputId: 'demo', kind: 'utterance', text: 'A simulated combined response.', utteranceId, attempts });
  assert.ok(attempts.every(ref => controller.getSnapshot().evidence[ref.obligation]?.status === 'accepted'));
  assert.ok(attempts.every(ref => controller.getSnapshot().evidence[ref.obligation]?.source?.kind === 'mock'));
  assert.ok(events.some(event => event.type === 'transcript' && event.utteranceId === utteranceId));
  abort.abort(); assert.equal(controller.getSnapshot().interaction.connection, 'offline');
  unsubscribe(); controller.dispose();
});
test('mock default cannot silently accept an unregistered or stale utterance', async () => {
  const voice = createMockVoiceAdapter(); const events: VoiceEvent[] = [];
  voice.setContext(verbContext()); voice.subscribe(event => events.push(event));
  await voice.connect({ sessionId: 's1', signal: new AbortController().signal });
  await voice.submit({ ...verbContext(), inputId: 'unknown', kind: 'utterance', text: 'Hello', attempts: [{ ...ref, obligation: 'meaning' }] });
  const event = events.find(event => event.type === 'assessment');
  assert.equal(event?.type === 'assessment' && event.batch.results[0]?.status, 'uncertain');
  const before = events.length;
  await voice.submit({ ...verbContext(), generation: 0, inputId: 'old', kind: 'utterance', text: 'Hello', attempts: [] });
  assert.equal(events.length, before); voice.disconnect();
});
test('mock disconnect cancels an in-flight result and repeated abort cleanup is safe', async () => {
  const voice = createMockVoiceAdapter(); const events: VoiceEvent[] = []; voice.subscribe(event => events.push(event));
  voice.setContext(verbContext()); const abort = new AbortController(); await voice.connect({ sessionId: 's1', signal: abort.signal });
  const pending = voice.submit({ ...verbContext(), inputId: 'typed', kind: 'typed', text: 'bought', attempts: [ref] });
  voice.disconnect(); abort.abort(); voice.disconnect(); await pending;
  assert.equal(events.filter(event => event.type === 'assessment').length, 0);
});
