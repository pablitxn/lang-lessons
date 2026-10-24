import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_SETTINGS, tensesForLanguage, type Difficulty, type LearningLanguage } from '../src/contracts';
import { ALL_SENTENCES, sentencesForLanguage } from '../src/content';
import { createSentenceSession, matchingSentences } from '../src/features/sentences/session';
import { SentenceFixtureVoice } from '../src/features/sentences/__fixtures__/voice';
import { compareWrittenTranslation } from '../src/features/sentences/written-comparison';
import { createSentenceWrittenPractice } from '../src/features/sentences/written-practice';
import { parseWrittenSnapshot } from '../src/features/progress/written-snapshot-store';
import { parseSettings } from '../src/platform/settings-store';

const languages: readonly LearningLanguage[] = ['en', 'fr'];
const levels = [1, 2, 3] as const;

test('expansion preserves every original sentence record and stable progress identifier', () => {
  // SHA-256 of JSON.stringify(sentences) at merged French-parity base b562273.
  const baselines = [
    { path: '../content/en-wp-03/sentences.json', count: 33, hash: '8f4a8739ce8856498dc55cb1c10102e060385155f576c130beee65ebf7977121' },
    { path: '../content/fr/sentences.json', count: 54, hash: '92f0fb9fadb19d4635177a857e2923de8fc14119792a34e7026996fd1d0fe19a' },
  ];
  for (const baseline of baselines) {
    const data = JSON.parse(readFileSync(new URL(baseline.path, import.meta.url), 'utf8'));
    const hash = createHash('sha256').update(JSON.stringify(data.sentences.slice(0, baseline.count))).digest('hex');
    assert.equal(hash, baseline.hash, baseline.path);
  }
  assert.equal(new Set(ALL_SENTENCES.map(sentence => sentence.id)).size, ALL_SENTENCES.length);
  for (const language of languages) {
    const prompts = sentencesForLanguage(language).map(sentence => sentence.spanish.normalize('NFC').trim().toLocaleLowerCase('es'));
    assert.equal(new Set(prompts).size, prompts.length, `${language} has no duplicate Spanish prompts`);
  }
});

for (const language of languages) test(`${language} selection reaches every tense and difficulty cell without crossing language or repeating available alternatives`, () => {
  const sentences = sentencesForLanguage(language);
  for (const tense of tensesForLanguage(language)) for (const grammar of levels) for (const vocabulary of levels) {
    const difficulty: Difficulty = { grammar, vocabulary };
    const pool = matchingSentences(difficulty, sentences, tense);
    assert.ok(pool.length > 0, `${language}/${tense}/${grammar}/${vocabulary}`);
    assert.ok(pool.every(sentence => (sentence.language ?? 'en') === language));
    assert.ok(pool.every(sentence => sentence.difficulty.grammar === grammar && sentence.difficulty.vocabulary === vocabulary));
    assert.ok(pool.every(sentence => sentence.alternatives.some(alternative => alternative.tense === tense)));
    const voice = new SentenceFixtureVoice();
    const session = createSentenceSession({ voice, sessionId: `coverage-${language}`, difficulty, language, tense,
      random: () => 0, onComplete: () => assert.fail('Skipping cannot complete oral practice') });
    try {
      const before = session.getSnapshot().assessment.context;
      assert.equal(before.mode, 'sentence');
      if (before.mode !== 'sentence') throw new Error('Expected sentence context');
      assert.ok(pool.some(sentence => sentence.id === before.sentence.id));
      assert.equal(session.skip(), true);
      const after = session.getSnapshot().assessment.context;
      assert.equal(after.mode, 'sentence');
      if (after.mode !== 'sentence') throw new Error('Expected sentence context');
      assert.ok(pool.some(sentence => sentence.id === after.sentence.id));
      if (pool.length > 1) assert.notEqual(after.sentence.id, before.sentence.id);
      assert.equal(voice.connects, 0);
      assert.equal(voice.inputs.length, 0);
    } finally { session.dispose(); }
  }
});

test('all authored translations identify their own construction and preserve non-reference uncertainty', () => {
  for (const sentence of ALL_SENTENCES) {
    for (const alternative of sentence.alternatives) {
      const result = compareWrittenTranslation(alternative.text, sentence.alternatives, sentence.language ?? 'en');
      assert.equal(result.status, 'matched', `${sentence.id}: ${alternative.text}`);
      assert.equal(result.matchedAlternative?.tense, alternative.tense, `${sentence.id}: the same normalized answer cannot claim two different constructions`);
    }
    assert.notEqual(compareWrittenTranslation('An unlisted paraphrase awaiting semantic review.', sentence.alternatives, sentence.language ?? 'en').status, 'matched');
  }
});

for (const language of languages) test(`${language} expanded filters and recognized written work survive serialization without accepting another language's tense`, () => {
  const otherLanguage = language === 'en' ? 'fr' : 'en';
  for (const tense of tensesForLanguage(language)) {
    const settings = { ...DEFAULT_SETTINGS, learningLanguage: language, sentenceTense: tense, difficulty: { grammar: 3, vocabulary: 2 } };
    assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(settings))), settings);
    assert.equal(parseSettings({ ...settings, sentenceTense: tensesForLanguage(otherLanguage)[0] })?.sentenceTense, 'all');

    const sentence = matchingSentences({ grammar: 3, vocabulary: 2 }, sentencesForLanguage(language), tense)[0]!;
    const alternative = sentence.alternatives.find(item => item.tense === tense)!;
    const identity = { sessionId: `saved-${language}`, exerciseId: `saved-${tense}`, generation: 1 };
    const make = () => createSentenceWrittenPractice({ sentence, identity, userId: 'expansion-student' });
    const practice = make();
    practice.selectTense(tense);
    assert.equal(practice.getSnapshot().selectedTense, null, 'A label alone cannot create written evidence');
    practice.edit(alternative.text); practice.finalize();
    practice.selectTense(tensesForLanguage(otherLanguage)[0]);
    assert.equal(practice.getSnapshot().selectedTense, null);
    practice.selectTense(tense);
    const saved = practice.snapshotWrittenPractice()!;
    const parsed = parseWrittenSnapshot({ userId: 'expansion-student', sessionId: identity.sessionId }, JSON.parse(JSON.stringify(saved)));
    assert.ok(parsed);
    const restored = make();
    assert.equal(restored.restoreWrittenPractice(parsed), true);
    assert.deepEqual(restored.snapshotWrittenPractice(), saved);
    assert.equal(restored.getSnapshot().result?.matchedAlternative?.tense, tense);
    assert.ok(saved.events.every(event => event.source === 'typed' && event.trust === 'client-reported'));
    const last = saved.events.at(-1)!;
    assert.equal(last.kind, 'attempt-result');
    assert.ok(last.kind === 'attempt-result' && last.result === 'accepted');
    restored.edit('A changed draft');
    assert.equal(restored.getSnapshot().selectedTense, null);
    assert.equal(restored.getSnapshot().result, undefined);
  }
});

test('a selected practice filter never overrides the construction of an accepted alternative', () => {
  const alternatives = [
    { text: 'I will call you tonight.', tense: 'future-simple' as const, explanation: 'A future commitment using will + base.' },
    { text: 'I am going to call you tonight.', tense: 'future-going-to' as const, explanation: 'An intention using be going to + infinitive.' },
  ];
  const sentence = { id: 'fixture-future-interpretation', spanish: 'Te llamaré esta noche.', difficulty: { grammar: 1 as const, vocabulary: 1 as const },
    alternatives, hintSeeds: ['Consider the intended future action.'], explanationRubric: { structure: 'Explain the chosen construction.', meaning: 'A future call.', usage: 'Accept a compatible reading.' } };
  assert.equal(matchingSentences(sentence.difficulty, [sentence], 'future-simple')[0], sentence);
  const practice = createSentenceWrittenPractice({ sentence, userId: 'student', identity: { sessionId: 'future', exerciseId: 'future-choice', generation: 1 } });
  practice.edit(alternatives[1]!.text); practice.finalize(); practice.selectTense('future-simple');
  let event = practice.snapshotWrittenPractice()!.events.at(-1)!;
  assert.ok(event.kind === 'attempt-result' && event.result === 'incorrect');
  practice.selectTense('future-going-to');
  event = practice.snapshotWrittenPractice()!.events.at(-1)!;
  assert.ok(event.kind === 'attempt-result' && event.result === 'accepted');
  practice.edit("Tonight, I'll phone you."); practice.finalize();
  event = practice.snapshotWrittenPractice()!.events.at(-1)!;
  assert.ok(event.kind === 'attempt-result' && event.result === 'uncertain', 'An unlisted valid paraphrase needs semantic review, not an incorrect grade');
  assert.equal(practice.getSnapshot().selectedTense, null);
});
