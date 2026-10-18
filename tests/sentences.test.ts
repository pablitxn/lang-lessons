import assert from 'node:assert/strict';
import test from 'node:test';
import { SENTENCES } from '../src/content';
import { createSentenceSession, guardTranslationHint, matchingSentences, TRANSLATION_HINTS } from '../src/features/sentences/session';
import { SentenceFixtureVoice } from '../src/features/sentences/__fixtures__/voice';
import { FakeClock } from './helpers/assessment-fixtures';
import authored from '../content/en-wp-03/evaluation-fixtures.json' with { type: 'json' };
import { createMockVoiceAdapter } from '../src/voice/mock';
import { createSessionRuntime } from '../src/app/session-runtime';

const residence = SENTENCES.find(s => s.id === 'sentence-since-2020')!;
function setup(real = false) {
  const voice = new SentenceFixtureVoice(real ? 'openai-realtime' : 'mock');
  const clock = new FakeClock(); const completed: string[] = [];
  const session = createSentenceSession({ voice, sessionId: 'sentence-test', difficulty: { grammar: 2, vocabulary: 1 },
    sentences: [residence], clock, random: () => 0, connectionState: 'ready', onComplete: id => completed.push(id) });
  return { voice, clock, session, completed, snapshot: () => session.getSnapshot().assessment };
}
function translated(fixture: ReturnType<typeof setup>, text = 'We have lived here since 2020.') {
  fixture.voice.transcript(text); fixture.voice.assess();
  assert.equal(fixture.snapshot().sentenceStage, 'explanation');
}
function explained(fixture: ReturnType<typeof setup>) {
  fixture.voice.transcript('It is a present perfect construction with have and a participle, linking residence from 2020 to now.');
  fixture.voice.assess(); assert.equal(fixture.snapshot().sentenceStage, 'complete');
}

test('manual sentence navigation discards pending work offline while preserving pause without completion', () => {
  const f = setup();
  f.session.requestHint(); const hint = f.voice.hints.at(-1)!;
  f.voice.transcript('We have lived here since 2020.');
  const pending = f.voice.inputs.at(-1)!;
  const old = f.snapshot();
  f.session.setInteraction({ connection: 'offline', intent: 'pause', questionPending: true });
  assert.equal(f.session.skip(), true);
  assert.notEqual(f.snapshot().exerciseId, old.exerciseId);
  assert.equal(f.snapshot().generation, old.generation + 1);
  assert.equal(f.snapshot().interaction.connection, 'offline');
  assert.equal(f.snapshot().interaction.intent, 'pause');
  assert.equal(f.snapshot().interaction.questionPending, false);
  f.voice.assess('accepted', pending); f.voice.hint('Stale hint', hint);
  assert.deepEqual(f.snapshot().evidence, {});
  assert.equal(f.snapshot().sentenceStage, 'translation');
  assert.equal(f.snapshot().hint, null);
  assert.equal(f.session.getSnapshot().lastResponse, '');
  assert.deepEqual(f.completed, []);
  assert.equal(f.voice.interrupts, 1);
  assert.equal(f.voice.connects, 0);
  f.session.setDifficulty({ grammar: 3, vocabulary: 3 });
  const current = f.snapshot().exerciseId;
  assert.equal(f.session.skip(), false);
  assert.equal(f.snapshot().exerciseId, current);
  assert.equal(f.voice.interrupts, 1);
  f.session.dispose(); assert.equal(f.session.skip(), false);
});

test('sentence selection keeps grammar and vocabulary independent without a silent fallback', () => {
  assert.ok(matchingSentences({ grammar: 1, vocabulary: 1 }).length >= 4);
  const demandingVocabulary = matchingSentences({ grammar: 1, vocabulary: 3 });
  assert.ok(demandingVocabulary.length >= 4);
  assert.ok(demandingVocabulary.every(s => s.difficulty.grammar === 1 && s.difficulty.vocabulary === 3));
  assert.deepEqual(matchingSentences({ grammar: 3, vocabulary: 3 }), []);
  assert.throws(() => createSentenceSession({ voice: new SentenceFixtureVoice(), sessionId: 'none', difficulty: { grammar: 3, vocabulary: 3 }, onComplete() {} }), /No authored sentence/);
});
test('final current utterances allocate translation only; partial, duplicate and stale transcripts do not resubmit', () => {
  const f = setup(); const initial = f.voice.context;
  f.voice.transcript('We have', false, 'u1', false); assert.equal(f.voice.inputs.length, 0);
  f.voice.transcript('We have lived here since 2020.', false, 'u1');
  assert.deepEqual(f.voice.inputs[0]!.attempts.map(ref => ref.obligation), ['translation']);
  f.voice.transcript('duplicate', false, 'u1'); assert.equal(f.voice.inputs.length, 1);
  f.voice.emit({ type: 'transcript', eventId: 'stale', sessionId: initial.sessionId,
    identity: { ...initial, generation: 0 }, utteranceId: 'old', text: 'old', final: true, uncertain: false });
  assert.equal(f.voice.inputs.length, 1); f.session.dispose();
});
test('sentence transcripts without a capture receipt cannot create learning evidence or be replayed later', () => {
  const f = setup(true);
  try {
    f.voice.emit({ type: 'transcript', eventId: 'unscoped', sessionId: f.voice.context.sessionId,
      identity: f.voice.context, utteranceId: 'unscoped', text: 'An unscoped response.', final: true, uncertain: false });
    assert.equal(f.voice.inputs.length, 0); assert.equal(f.snapshot().evidence.translation, undefined);
    assert.match(f.session.getSnapshot().notice, /fresh response/);
    f.voice.transcript('A replay with a receipt.', false, 'unscoped');
    assert.equal(f.voice.inputs.length, 0);
  } finally { f.session.dispose(); }
});
test('both residence alternatives and contractions are sent unchanged and follow the provider verdict', () => {
  for (const alternative of residence.alternatives) {
    const f = setup(); translated(f, alternative.text);
    assert.equal(f.voice.inputs[0]!.text, alternative.text);
    assert.equal(f.snapshot().evidence.translation?.status, 'accepted');
    assert.equal(f.voice.context.mode === 'sentence' && f.voice.context.stage, 'explanation');
    assert.equal(f.session.next(), false); f.session.dispose();
  }
});
test('all explanation obligations are independent; completion is manual and never timer-driven', () => {
  const f = setup(); translated(f);
  f.voice.transcript('A partial explanation.');
  assert.deepEqual(f.voice.inputs.at(-1)!.attempts.map(ref => ref.obligation), ['tense', 'structure', 'meaning-fit']);
  f.voice.assess({ tense: 'accepted', structure: 'accepted', 'meaning-fit': 'incorrect' });
  assert.equal(f.session.next(), false);
  f.voice.transcript('It fits a continuing residence from the stated year to now.');
  assert.deepEqual(f.voice.inputs.at(-1)!.attempts.map(ref => ref.obligation), ['meaning-fit']);
  f.voice.assess(); const oldId = f.snapshot().exerciseId;
  f.clock.advance(60000); assert.equal(f.completed.length, 0); assert.equal(f.snapshot().exerciseId, oldId);
  assert.equal(f.session.next(), true); assert.deepEqual(f.completed, [oldId]);
  assert.notEqual(f.snapshot().exerciseId, oldId); assert.equal(f.snapshot().sentenceStage, 'translation'); f.session.dispose();
});
test('uncertain speech requests clarification without submitting guessed text or penalizing accepted work', () => {
  const f = setup(); translated(f);
  f.voice.transcript('A tense explanation.');
  f.voice.assess({ tense: 'accepted', structure: 'uncertain', 'meaning-fit': 'uncertain' });
  const before = f.voice.inputs.length;
  f.voice.transcript('I might have heard an auxiliary', true);
  assert.equal(f.voice.inputs.length, before);
  assert.equal(f.snapshot().evidence.translation?.status, 'accepted');
  assert.equal(f.snapshot().evidence.tense?.status, 'accepted');
  assert.equal(f.snapshot().evidence.structure?.status, 'uncertain');
  assert.equal(f.snapshot().evidence['meaning-fit']?.status, 'uncertain');
  assert.match(f.session.getSnapshot().notice, /not a learner error/); f.session.dispose();
});
test('progressive model requests are correlated and unsafe output is replaced with a labelled reviewed fallback', () => {
  const f = setup();
  for (let level = 1; level <= 3; level++) {
    assert.equal(f.session.requestHint(), true);
    assert.equal(f.voice.hints.at(-1)?.level, level);
    assert.equal(f.voice.hints.at(-1)?.stage, 'translation');
    f.voice.hint('Use the present perfect: We have lived here since 2020.');
    assert.equal(f.snapshot().hint?.text, TRANSLATION_HINTS[level - 1]);
    assert.equal(f.session.getSnapshot().hintOrigin, 'authored-fallback');
    assert.equal(f.snapshot().hintPending, false);
  }
  assert.equal(f.session.requestHint(), true); f.voice.hint(TRANSLATION_HINTS[2]);
  assert.equal(f.session.getSnapshot().hintOrigin, 'mock'); f.session.dispose();
});
test('authored direct, encoded, tense-name, cloze and structural spoilers cannot pass the display envelope', () => {
  const blocked = authored.cases.filter(c => c.area === 'hint' && c.expected.decision === 'block');
  assert.ok(blocked.length >= 11);
  for (const fixture of blocked) for (const level of [1, 2, 3] as const) {
    const guarded = guardTranslationHint((fixture.input as { text: string }).text, level);
    assert.equal(guarded.fallback, true, fixture.id);
    assert.equal(guarded.text, TRANSLATION_HINTS[level - 1]);
  }
});
test('new attempts and stage transitions reject late hints; no raw feedback bypasses the envelope', () => {
  const f = setup(); f.session.requestHint(); const old = f.voice.hints[0]!;
  f.voice.transcript('We have lived here since 2020.');
  f.voice.hint('We have lived here since 2020.', old); assert.equal(f.snapshot().hint, null);
  f.voice.assess('incorrect', f.voice.inputs[0], undefined, 'Answer: We have lived here since 2020. Use present perfect.');
  assert.doesNotMatch(f.snapshot().results.translation!.feedback, /We have lived|present perfect/);
  f.voice.emit({ type: 'feedback', eventId: 'reply', sessionId: f.voice.context.sessionId, identity: f.voice.context,
    text: 'Start with We have been...' });
  assert.equal(f.session.getSnapshot().coachText, TRANSLATION_HINTS[0]);
  assert.equal(f.session.getSnapshot().hintOrigin, 'authored-fallback');
  translated(f); f.voice.hint('late', old); assert.equal(f.snapshot().hint, null); f.session.dispose();
});
test('helper tables preserve stage and ongoing oral work while holding manual advancement', () => {
  const f = setup(); translated(f); const before = f.snapshot();
  f.session.setPresentationHold('reference', true); explained(f);
  assert.equal(f.snapshot().exerciseId, before.exerciseId);
  assert.equal(f.snapshot().evidence.translation?.status, 'accepted');
  assert.equal(f.session.next(), false); f.session.setPresentationHold('reference', false);
  assert.equal(f.session.next(), true); f.session.dispose();
});
test('questions, question drafts and assistant speech preserve completion and block Next', () => {
  const f = setup(); translated(f); explained(f);
  f.session.askQuestion('Why do both forms fit?');
  assert.equal(f.snapshot().interaction.questionPending, true);
  assert.deepEqual(f.voice.inputs.at(-1)?.attempts, []);
  assert.equal(f.session.next(), false); f.session.resolveQuestion();
  f.session.setInteraction({ questionDraftActive: true }); assert.equal(f.session.next(), false);
  f.session.setInteraction({ questionDraftActive: false }); f.voice.speech(true); assert.equal(f.session.next(), false);
  f.voice.speech(false); assert.equal(f.session.next(), true); f.session.dispose();
});
test('revising the accepted translation invalidates explanations and late results without an alternate reducer', () => {
  const f = setup(); translated(f); f.voice.transcript('Explanation in flight.'); const prior = f.voice.inputs.at(-1)!;
  f.session.reviseTranslation();
  assert.equal(f.snapshot().sentenceStage, 'translation'); assert.equal(f.snapshot().evidence.tense, undefined);
  f.voice.assess('accepted', prior); assert.equal(f.snapshot().evidence.tense, undefined);
  assert.equal(f.snapshot().evidence.translation?.status, 'not-attempted'); f.session.dispose();
});
test('difficulty changes preserve current work; absent combinations wait rather than changing another dimension', () => {
  const f = setup(); translated(f); const id = f.snapshot().exerciseId;
  f.session.setDifficulty({ grammar: 3, vocabulary: 3 });
  assert.equal(f.snapshot().exerciseId, id); assert.equal(f.snapshot().sentenceStage, 'explanation');
  assert.deepEqual(f.session.getSnapshot().requestedDifficulty, { grammar: 3, vocabulary: 3 });
  assert.equal(f.session.getSnapshot().nextPoolSize, 0); explained(f); assert.equal(f.session.next(), true);
  assert.equal(f.snapshot().completed, true); assert.equal(f.completed.length, 1);
  f.session.setDifficulty({ grammar: 2, vocabulary: 1 }); assert.equal(f.session.next(), true);
  assert.equal(f.completed.length, 1); assert.notEqual(f.snapshot().exerciseId, id); f.session.dispose();
});
test('real mode rejects text-only evidence as oral success', () => {
  const f = setup(true);
  assert.equal(f.voice.inputs.length, 0); f.voice.transcript('We have lived here since 2020.');
  f.voice.assess('accepted', f.voice.inputs[0], { kind: 'typed', inputId: 'typed' });
  assert.equal(f.snapshot().evidence.translation?.status, 'uncertain');
  assert.equal(f.snapshot().sentenceStage, 'translation'); f.session.dispose();
});
test('transport failure becomes uncertainty and preserves unrelated accepted translation', async () => {
  const f = setup(); translated(f);
  f.voice.submitError = Promise.reject(new Error('Private provider body containing a solution.'));
  f.voice.transcript('An explanation.'); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.snapshot().evidence.translation?.status, 'accepted');
  assert.equal(f.snapshot().evidence.tense?.status, 'uncertain');
  assert.doesNotMatch(f.snapshot().systemError!, /Private|solution/); f.session.dispose();
});
test('cleanup removes the listener and controller work but never owns root connection lifecycle', () => {
  const f = setup(); assert.equal(f.voice.listeners.size, 1);
  f.session.dispose(); f.session.dispose(); assert.equal(f.voice.listeners.size, 0);
  f.voice.transcript('late'); assert.equal(f.voice.inputs.length, 0);
  assert.equal(f.voice.connects, 0); assert.equal(f.voice.disconnects, 0); assert.equal(f.clock.tasks.size, 0);
});
test('question-directed or paused final speech cannot be replayed later as practice evidence', () => {
  const f = setup();
  f.session.askQuestion('What does the context mean?');
  assert.equal(f.session.requestHint(), false);
  const before = f.voice.inputs.length;
  f.voice.transcript('A question-directed response.', false, 'held-utterance');
  f.session.resolveQuestion();
  f.voice.transcript('A question-directed response.', false, 'held-utterance');
  assert.equal(f.voice.inputs.length, before);
  f.session.pause(true); f.voice.transcript('Paused speech.', false, 'paused-utterance');
  f.session.pause(false); f.voice.transcript('Paused speech.', false, 'paused-utterance');
  assert.equal(f.voice.inputs.length, before);
  f.voice.transcript('We have lived here since 2020.');
  assert.equal(f.voice.inputs.length, before + 1); f.session.dispose();
});
test('current root runtime replays connection and holds; the actual mock adapter registers oral fixtures and questions', async () => {
  const base = createMockVoiceAdapter();
  const runtime = createSessionRuntime(base, 'root-sentence-session');
  await runtime.start();
  runtime.hold('root-preferences', true);
  const session = createSentenceSession({ voice: runtime.voice, sessionId: runtime.sessionId,
    difficulty: { grammar: 2, vocabulary: 1 }, sentences: [residence], random: () => 0, onComplete() {} });
  assert.equal(session.getSnapshot().assessment.interaction.connection, 'ready');
  assert.deepEqual(session.getSnapshot().assessment.interaction.presentationHolds, ['root-preferences']);
  base.simulateUtterance('We have lived here since 2020.', 'accepted');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(session.getSnapshot().assessment.evidence.translation?.status, 'accepted');
  runtime.hold('root-preferences', false);
  session.askQuestion('Why do both residence constructions work?');
  await Promise.resolve();
  assert.equal(session.getSnapshot().assessment.interaction.questionPending, true);
  session.resolveQuestion(); session.dispose(); runtime.stop();
});
