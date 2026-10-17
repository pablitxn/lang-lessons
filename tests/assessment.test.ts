import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssessmentController } from '../src/assessment';
import { TIMING, requiredObligations, type VoiceEvent } from '../src/contracts';
import { FakeClock, batch, result, sentenceContext, verbContext } from './helpers/assessment-fixtures';

function setup(sentence = false) {
  const clock = new FakeClock(); let advances = 0;
  const controller = createAssessmentController({ context: sentence ? sentenceContext() : verbContext(), allowMock: true,
    clock, onAdvance: () => { advances++; } });
  controller.setInteraction({ connection: 'ready' });
  return { clock, controller, advances: () => advances };
}
test('independent concurrent attempts apply out of order without discarding oral work', () => {
  const { controller } = setup();
  const oral = controller.beginAttempt(['meaning', 'pronunciation:base', 'sentence:base']);
  const oldSpelling = controller.beginAttempt(['spelling:past']);
  controller.invalidate('spelling:past');
  const newSpelling = controller.beginAttempt(['spelling:past']);
  assert.equal(controller.applyBatch(batch(oral)), 3);
  const mixed = batch(newSpelling);
  mixed.results = [result(oldSpelling[0]!), result(newSpelling[0]!)];
  assert.equal(controller.applyBatch(mixed), 1);
  assert.equal(controller.getSnapshot().evidence.meaning?.status, 'accepted');
  assert.equal(controller.getSnapshot().evidence['spelling:past']?.ref.revision, newSpelling[0]?.revision);
  assert.equal(controller.getSnapshot().interaction.processingCount, 0);
});
test('duplicates and terminal attempts cannot overwrite accepted feedback', () => {
  const { controller } = setup();
  const refs = controller.beginAttempt(['meaning']); const accepted = batch(refs);
  assert.equal(controller.applyBatch(accepted), 1);
  assert.equal(controller.applyBatch(accepted), 0);
  assert.equal(controller.applyBatch(batch(refs, 'incorrect')), 0);
  for (let index = 0; index < 1030; index++) controller.applyBatch({ ...accepted, eventId: `unrelated-${index}`, results: [] });
  assert.equal(controller.applyBatch({ ...accepted, results: [result(refs[0]!, 'incorrect')] }), 0);
  assert.equal(controller.getSnapshot().evidence.meaning?.status, 'accepted');
});
test('exercise replacement rejects previous generation results and clears old holds', () => {
  const { controller } = setup(); const refs = controller.beginAttempt(['meaning']);
  controller.setPresentationHold('table', true);
  controller.startExercise({ ...verbContext(), generation: 2 });
  assert.equal(controller.applyBatch(batch(refs)), 0);
  assert.deepEqual(controller.getSnapshot().evidence, {});
  assert.deepEqual(controller.getSnapshot().interaction.presentationHolds, []);
});
test('invalid oral sources become uncertainty and never satisfy pronunciation', () => {
  const controller = createAssessmentController({ context: verbContext() });
  const refs = controller.beginAttempt(['pronunciation:base']);
  const event = batch(refs); event.results = [{ ...result(refs[0]!), source: { kind: 'typed', inputId: 'typed' } }];
  controller.applyBatch(event);
  assert.equal(controller.getSnapshot().evidence['pronunciation:base']?.status, 'uncertain');
  assert.equal(controller.getSnapshot().advancePending, false);
});
test('a missing obligation cannot schedule automatic advancement', () => {
  const { controller, clock, advances } = setup();
  const keys = requiredObligations('verb-image');
  controller.applyBatch(batch(controller.beginAttempt(keys.slice(0, -1))));
  clock.advance(TIMING.verbQuietPeriodMs * 2);
  assert.equal(advances(), 0); assert.equal(controller.getSnapshot().advancePending, false);
});
test('questions cancel old quiet callbacks and renew the whole pause after resolution', () => {
  const { controller, clock, advances } = setup();
  controller.applyBatch(batch(controller.beginAttempt(requiredObligations('verb-image'))));
  assert.equal(controller.getSnapshot().advancePending, true);
  const oldCallback = clock.callbacks[0]!;
  clock.advance(1000); controller.setInteraction({ questionPending: true, learnerSpeaking: true });
  clock.advance(10000); oldCallback(); assert.equal(advances(), 0);
  controller.setInteraction({ learnerSpeaking: false }); clock.advance(10000); assert.equal(advances(), 0);
  controller.setInteraction({ questionPending: false }); clock.advance(TIMING.verbQuietPeriodMs - 1);
  assert.equal(advances(), 0); clock.advance(1); assert.equal(advances(), 1);
  oldCallback(); clock.advance(10000); assert.equal(advances(), 1);
});
test('scoped helper holds and focused input preserve progress and postpone advancement', () => {
  const { controller, clock, advances } = setup();
  controller.setPresentationHold('table', true); controller.setPresentationHold('guide', true);
  controller.applyBatch(batch(controller.beginAttempt(requiredObligations('verb-image'))));
  controller.setPresentationHold('table', false); clock.advance(5000); assert.equal(advances(), 0);
  assert.equal(controller.getSnapshot().evidence.meaning?.status, 'accepted');
  controller.setInteraction({ inputFocused: true }); controller.setPresentationHold('guide', false);
  clock.advance(5000); assert.equal(advances(), 0);
  controller.setInteraction({ inputFocused: false }); clock.advance(TIMING.verbQuietPeriodMs); assert.equal(advances(), 1);
});
test('disconnect marks only pending work uncertain and retains accepted independent evidence', () => {
  const { controller } = setup();
  controller.applyBatch(batch(controller.beginAttempt(['meaning'])));
  controller.beginAttempt(['pronunciation:past']);
  controller.handleVoiceEvent({ type: 'state', eventId: 'offline', sessionId: 's1', state: 'offline' });
  assert.equal(controller.getSnapshot().evidence.meaning?.status, 'accepted');
  assert.equal(controller.getSnapshot().evidence['pronunciation:past']?.status, 'uncertain');
  assert.equal(controller.getSnapshot().interaction.processingCount, 0);
});
test('sentence explanation cannot precede translation or trigger automatic advancement', () => {
  const { controller, clock, advances } = setup(true);
  assert.deepEqual(controller.getOpenObligations(), ['translation']);
  assert.deepEqual(controller.beginAttempt(['tense']), []);
  assert.deepEqual(controller.beginAttempt(['translation', 'tense']), []);
  controller.applyBatch(batch(controller.beginAttempt(['translation'])));
  assert.equal(controller.getSnapshot().sentenceStage, 'explanation');
  assert.equal(controller.manualContinue(), false);
  controller.applyBatch(batch(controller.beginAttempt(['tense', 'structure', 'meaning-fit'])));
  clock.advance(10000); assert.equal(advances(), 0); assert.equal(controller.getSnapshot().canContinue, true);
  controller.setInteraction({ assistantSpeaking: true }); assert.equal(controller.manualContinue(), false);
  controller.setInteraction({ assistantSpeaking: false }); assert.equal(controller.manualContinue(), true);
  assert.equal(controller.manualContinue(), false); assert.equal(advances(), 1);
});
test('revising translation invalidates dependent explanation and late responses', () => {
  const { controller } = setup(true);
  controller.applyBatch(batch(controller.beginAttempt(['translation'])));
  const explanation = controller.beginAttempt(['tense', 'structure', 'meaning-fit']);
  controller.invalidate('translation');
  assert.equal(controller.getSnapshot().sentenceStage, 'translation');
  assert.equal(controller.applyBatch(batch(explanation)), 0);
  controller.applyBatch(batch(controller.beginAttempt(['translation'])));
  const next = controller.beginAttempt(['tense', 'structure', 'meaning-fit']);
  assert.ok(next[0]!.revision > explanation[0]!.revision);
});
test('hints cannot arrive after an attempt or stage changes', () => {
  const { controller } = setup(true);
  const request = controller.beginHint('translation', 1);
  controller.beginAttempt(['translation']);
  assert.equal(controller.applyHint({ ...request, text: 'Old hint.', source: 'mock' }), false);
  const current = controller.beginHint('translation', 2);
  assert.equal(controller.applyHint({ ...current, text: 'Consider the timeline.', source: 'mock' }), true);
  assert.equal(controller.getSnapshot().hintPending, false);
});
test('stage change cancels pending hints without leaving processing stuck', () => {
  const { controller } = setup(true); const refs = controller.beginAttempt(['translation']);
  controller.beginHint('translation', 1);
  controller.applyBatch(batch(refs));
  assert.equal(controller.getSnapshot().hintPending, false);
  assert.equal(controller.getSnapshot().interaction.processingCount, 0);
});
test('foreign sessions and stale transcripts do not disturb a current quiet timer', () => {
  const { controller } = setup();
  controller.applyBatch(batch(controller.beginAttempt(requiredObligations('verb-image'))));
  const before = controller.getSnapshot();
  const event: VoiceEvent = { type: 'speech', eventId: 'foreign', sessionId: 'other', speaker: 'learner', active: true };
  controller.handleVoiceEvent(event);
  assert.equal(controller.getSnapshot(), before);
});
test('dispose prevents callbacks and late writes after feature unmount', () => {
  const { controller, clock, advances } = setup();
  controller.applyBatch(batch(controller.beginAttempt(requiredObligations('verb-image'))));
  controller.dispose(); clock.advance(10000); clock.callbacks.forEach(callback => callback());
  assert.equal(advances(), 0); assert.deepEqual(controller.beginAttempt(['meaning']), []);
});
