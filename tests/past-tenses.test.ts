import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, PAST_TENSES, PRESENT_TENSES, TENSES } from '../src/contracts';
import { VERBS } from '../src/content';
import { matchingSentences, createSentenceSession, TRANSLATION_HINTS } from '../src/features/sentences/session';
import { SentenceFixtureVoice } from '../src/features/sentences/__fixtures__/voice';
import { parseSettings } from '../src/platform/settings-store';
import { FakeClock } from './helpers/assessment-fixtures';

test('old preferences migrate to all eight tenses without losing independent difficulty or theme', () => {
  const { sentenceTense: _new, ...old } = { ...DEFAULT_SETTINGS, theme: 'dark' as const, difficulty: { grammar: 2 as const, vocabulary: 1 as const } };
  assert.deepEqual(parseSettings(old), { ...old, sentenceTense: 'all' });
  for (const sentenceTense of TENSES) assert.equal(parseSettings({ ...old, sentenceTense })?.sentenceTense, sentenceTense);
  for (const sentenceTense of ['', 'future-perfect', ['past-simple'], null, 1]) assert.equal(parseSettings({ ...old, sentenceTense }), null);
  assert.deepEqual(TENSES.slice(0, 4), PRESENT_TENSES);
  assert.deepEqual(TENSES.slice(4), PAST_TENSES);
});

test('tense selection retains contextually valid alternatives and never substitutes another difficulty', () => {
  for (const tense of TENSES) {
    const pool = matchingSentences({ grammar: 1, vocabulary: 1 }, undefined, tense);
    assert.ok(pool.length > 0, tense);
    assert.ok(pool.every(s => s.alternatives.some(a => a.tense === tense)), tense);
    assert.deepEqual(matchingSentences({ grammar: 3, vocabulary: 3 }, undefined, tense), []);
  }
  assert.ok(matchingSentences({ grammar: 2, vocabulary: 1 }, undefined, 'present-perfect-continuous')
    .some(s => s.id === 'sentence-since-2020'));
});

for (const tense of PAST_TENSES) test(`${tense} preserves translation-first evidence, uncertainty, safe hints and manual completion`, () => {
  const voice = new SentenceFixtureVoice(); const clock = new FakeClock(); const completed: string[] = [];
  const session = createSentenceSession({ voice, clock, sessionId: 'past-stages', difficulty: { grammar: 1, vocabulary: 1 },
    tense, random: () => 0, connectionState: 'ready', onComplete: id => completed.push(id) });
  const snapshot = () => session.getSnapshot().assessment;
  try {
    const initial = snapshot(); assert.equal(initial.context.mode, 'sentence');
    if (initial.context.mode !== 'sentence') throw Error('Sentence context required.');
    const example = initial.context.sentence.alternatives[0]!;
    assert.equal(example.tense, tense);
    session.requestHint(); voice.hint(`Use ${tense}: ${example.text}`);
    assert.equal(snapshot().hint?.text, TRANSLATION_HINTS[0]);
    voice.transcript(example.text);
    assert.deepEqual(voice.inputs.at(-1)!.attempts.map(a => a.obligation), ['translation']);
    voice.assess(); assert.equal(snapshot().sentenceStage, 'explanation');
    voice.transcript('Unclear explanation', true);
    assert.equal(snapshot().evidence.translation?.status, 'accepted');
    assert.equal(session.next(), false);
    voice.transcript(example.explanation);
    voice.assess({ tense: 'accepted', structure: 'incorrect', 'meaning-fit': 'accepted' });
    assert.equal(session.next(), false);
    voice.transcript('A corrected construction explanation.'); voice.assess();
    assert.equal(snapshot().sentenceStage, 'complete');
    clock.advance(60000); assert.equal(completed.length, 0);
    session.setPresentationHold('guide', true); assert.equal(session.next(), false);
    session.setPresentationHold('guide', false); assert.equal(session.next(), true);
    assert.deepEqual(completed, [initial.exerciseId]);
    assert.notEqual(snapshot().exerciseId, initial.exerciseId);
    assert.equal(snapshot().evidence.translation, undefined);
    assert.equal(snapshot().sentenceStage, 'translation');
  } finally { session.dispose(); }
});

test('changing tense mid-explanation preserves accepted work, then invalidates old results on the next prompt', () => {
  const voice = new SentenceFixtureVoice();
  const session = createSentenceSession({ voice, sessionId: 'selection', difficulty: { grammar: 1, vocabulary: 1 },
    tense: 'present-simple', random: () => 0, connectionState: 'ready', onComplete() {} });
  try {
    voice.transcript('He buys bread every morning.'); const oldInput = voice.inputs.at(-1)!; voice.assess();
    const before = session.getSnapshot().assessment;
    session.setTense('past-perfect-continuous');
    const during = session.getSnapshot().assessment;
    assert.equal(during.exerciseId, before.exerciseId);
    assert.equal(during.sentenceStage, 'explanation');
    assert.deepEqual(during.evidence, before.evidence);
    assert.equal(session.getSnapshot().nextPoolSize, 1);
    voice.transcript('Habit with subject agreement.'); voice.assess();
    assert.equal(session.next(), true);
    const after = session.getSnapshot().assessment;
    assert.equal(after.context.mode, 'sentence');
    assert.ok(after.context.mode === 'sentence' && after.context.sentence.alternatives.some(a => a.tense === 'past-perfect-continuous'));
    voice.assess('accepted', oldInput);
    assert.equal(session.getSnapshot().assessment.evidence.translation, undefined);
    assert.notEqual(after.exerciseId, before.exerciseId);
  } finally { session.dispose(); }
});

test('manual skip applies the pending tense offline without completing or retaining stale evidence', () => {
  const voice = new SentenceFixtureVoice(); const completed: string[] = [];
  const session = createSentenceSession({ voice, sessionId: 'offline-selection', difficulty: { grammar: 1, vocabulary: 1 },
    tense: 'present-simple', random: () => 0, connectionState: 'ready', onComplete: id => completed.push(id) });
  try {
    voice.transcript('He buys bread every morning.'); const oldInput = voice.inputs.at(-1)!; voice.assess();
    const before = session.getSnapshot().assessment;
    session.setInteraction({ connection: 'offline' });
    session.setTense('past-perfect-continuous');
    assert.equal(session.getSnapshot().assessment.exerciseId, before.exerciseId);
    assert.equal(session.skip(), true);
    const after = session.getSnapshot().assessment;
    assert.notEqual(after.exerciseId, before.exerciseId);
    assert.ok(after.context.mode === 'sentence' && after.context.sentence.alternatives.some(a => a.tense === 'past-perfect-continuous'));
    assert.equal(after.sentenceStage, 'translation');
    voice.assess('accepted', oldInput);
    assert.equal(session.getSnapshot().assessment.evidence.translation, undefined);
    assert.deepEqual(completed, []);
  } finally { session.dispose(); }
});

test('both verb modes receive past constructions without changing spelling families or inventing progressive stative examples', () => {
  for (const verb of VERBS) {
    assert.ok(verb.tenseExamples?.length);
    for (const example of verb.tenseExamples!) {
      assert.ok(PAST_TENSES.includes(example.tense as typeof PAST_TENSES[number]));
      assert.equal(example.family, example.tense === 'past-simple' ? 'past' : example.tense === 'past-perfect' ? 'participle' : 'base');
    }
  }
  const buy = VERBS.find(v => v.id === 'buy')!;
  assert.match(buy.tenseExamples!.find(e => e.tense === 'past-perfect')!.text, /had bought/);
  assert.match(buy.tenseExamples!.find(e => e.tense === 'past-perfect-continuous')!.text, /had been buying/);
  assert.deepEqual(VERBS.find(v => v.id === 'be')!.tenseExamples!.map(e => e.tense), ['past-simple', 'past-perfect']);
});

test('an empty requested tense/difficulty pool cannot skip or erase current completed work', () => {
  const voice = new SentenceFixtureVoice();
  const session = createSentenceSession({ voice, sessionId: 'empty-selection', difficulty: { grammar: 1, vocabulary: 1 },
    tense: 'present-simple', random: () => 0, connectionState: 'ready', onComplete() {} });
  try {
    voice.transcript('He buys bread every morning.'); voice.assess();
    voice.transcript('A present habit with agreement.'); voice.assess();
    const before = session.getSnapshot().assessment;
    session.setDifficulty({ grammar: 2, vocabulary: 2 }); session.setTense('past-simple');
    assert.equal(session.getSnapshot().nextPoolSize, 0);
    assert.equal(session.next(), true, 'Completion is reported once even if no next prompt exists.');
    assert.equal(session.getSnapshot().assessment.exerciseId, before.exerciseId);
    assert.equal(session.next(), false); assert.equal(session.skip(), false);
    assert.deepEqual(session.getSnapshot().assessment.evidence, before.evidence);
    session.setDifficulty({ grammar: 1, vocabulary: 1 }); assert.equal(session.next(), true);
    assert.notEqual(session.getSnapshot().assessment.exerciseId, before.exerciseId);
  } finally { session.dispose(); }
});
