import assert from 'node:assert/strict';
import test from 'node:test';
import { getFormGuidance, getLanguage, requiredObligations } from '../src/contracts';
import { photosForLanguage, sentencesForLanguage, verbsForLanguage } from '../src/content';
import { assessSpelling } from '../src/assessment/spelling';
import { createVerbSession } from '../src/features/verbs/session';
import { VerbFixtureAdapter } from '../src/features/verbs/__fixtures__/adapter';
import { createSentenceSession, matchingSentences } from '../src/features/sentences/session';
import { SentenceFixtureVoice } from '../src/features/sentences/__fixtures__/voice';
import { createSentenceWrittenPractice } from '../src/features/sentences/written-practice';
import { compareWrittenTranslation } from '../src/features/sentences/written-comparison';
import { parseWrittenSnapshot } from '../src/features/progress/written-snapshot-store';
import { progressItems } from '../src/ui/mobile/presentation';

const verbSession = (language: 'en' | 'fr', mode: 'verb-image' | 'verb-visible' = 'verb-image', sessionId = `${language}-practice`) => {
  const voice = new VerbFixtureAdapter(sessionId, true);
  const session = createVerbSession({ voice, language, mode, sessionId, writtenPracticeUserId: 'learner', random: () => 0, onComplete() {} });
  return { voice, session };
};

test('French verb sessions use pedagogical fields and keep English obligations separate', () => {
  for (const mode of ['verb-image', 'verb-visible'] as const) {
    const { voice, session } = verbSession('fr', mode);
    try {
      const context = session.getSnapshot().assessment.context;
      assert.notEqual(context.mode, 'sentence');
      if (context.mode === 'sentence') throw new Error('Expected verb context');
      assert.equal(getLanguage(context), 'fr');
      assert.deepEqual(session.fields, mode === 'verb-image' ? ['infinitive', 'present', 'participle'] : ['present', 'participle']);
      assert.deepEqual(Object.keys(session.getSnapshot().drafts), ['infinitive', 'present', 'participle']);
      const labels = progressItems(mode, context, {}, 'fr');
      assert.equal(labels.length, mode === 'verb-image' ? 10 : 9);
      assert.ok(labels.some(item => item.obligation === 'pronunciation:present'));
      assert.ok(!labels.some(item => item.obligation === 'spelling:past'));
      for (const form of session.fields) {
        const answer = getFormGuidance(context.verb, form)!.accepted[0]!;
        session.edit(form, answer); session.finalize(form, answer);
        assert.equal(session.getSnapshot().assessment.evidence[`spelling:${form}`]?.status, 'accepted');
      }
      assert.equal(session.getSnapshot().pictureComplete, mode === 'verb-image');
      assert.equal(voice.connects, 0);
      assert.equal(session.getSnapshot().assessment.completed, false, 'written work cannot manufacture oral completion');
    } finally { session.dispose(); }
  }
  assert.ok(requiredObligations('verb-image').includes('spelling:past'));
  assert.ok(!requiredObligations('verb-image').includes('spelling:present'));
});

test('French photo history preserves drafts and exact image across repeated navigation and restore', () => {
  const { session } = verbSession('fr');
  const { session: restored } = verbSession('fr');
  const { session: english } = verbSession('en', 'verb-image', 'fr-practice');
  try {
    const first = session.getSnapshot().assessment.context;
    if (first.mode === 'sentence') throw new Error('Expected verb context');
    session.edit('infinitive', 'un brouillon');
    const saved = session.snapshotWrittenPractice()!;
    assert.ok(parseWrittenSnapshot({ userId: 'learner', sessionId: 'fr-practice' }, saved));
    assert.equal(restored.restoreWrittenPractice(saved), true);
    assert.equal(english.restoreWrittenPractice(saved), false);
    assert.deepEqual(restored.getSnapshot().drafts, saved.drafts);
    assert.equal(restored.getSnapshot().assessment.exerciseId, saved.identity.exerciseId);
    const restoredContext = restored.getSnapshot().assessment.context;
    assert.equal(restoredContext.mode !== 'sentence' && restoredContext.verb.image.src, saved.photoSrc);
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const context = session.getSnapshot().assessment.context;
      if (context.mode === 'sentence') throw new Error('Expected verb context');
      assert.ok(context.verb.id.startsWith('fr-'));
      assert.ok(photosForLanguage('fr').some(photo => photo.verbId === context.verb.id && photo.src === context.verb.image.src));
      seen.add(context.verb.id);
      if (i < 24) assert.equal(session.skip(), true);
    }
    assert.equal(seen.size, 25);
    for (let i = 0; i < 24; i++) assert.equal(session.previous(), true);
    const returned = session.getSnapshot().assessment.context;
    assert.equal(returned.mode !== 'sentence' && returned.verb.image.src, first.verb.image.src);
    assert.equal(session.getSnapshot().drafts.infinitive, 'un brouillon');
    assert.equal(session.previous(), false);
    assert.equal(restored.restoreWrittenPractice({ ...saved, drafts: { base: '', past: '', participle: '' } }), false);
  } finally { session.dispose(); restored.dispose(); english.dispose(); }
});

test('French spelling requires accents and accepts canonical Unicode without English form aliases', () => {
  const verb = verbsForLanguage('fr').find(item => item.language === 'fr' && item.lemma === 'être')!;
  assert.ok(verb);
  const context = { sessionId: 'spelling', exerciseId: 'one', generation: 1, mode: 'verb-image' as const, language: 'fr' as const, verb };
  const ref = { sessionId: 'spelling', exerciseId: 'one', generation: 1, obligation: 'spelling:infinitive' as const, attemptId: 'a', revision: 1 };
  assert.equal(assessSpelling(context, ref, 'e\u0302tre', 'typed').status, 'accepted');
  assert.equal(assessSpelling(context, ref, 'etre', 'typed').status, 'incorrect');
  assert.equal(assessSpelling(context, { ...ref, obligation: 'spelling:base' }, 'be', 'typed').status, 'uncertain');
});

test('French sentence comparison, tense recognition and restore remain independent from oral evidence', () => {
  const sentence = sentencesForLanguage('fr').find(item => item.alternatives.some(alternative => /[éèêàîôûç]/u.test(alternative.text)))!;
  assert.ok(sentence);
  const alternative = sentence.alternatives.find(item => /[éèêàîôûç]/u.test(item.text))!;
  assert.equal(compareWrittenTranslation(alternative.text.normalize('NFD').toUpperCase().replace(/'/gu, '’'), sentence.alternatives).status, 'matched');
  assert.equal(compareWrittenTranslation(alternative.text.normalize('NFD').replace(/\p{M}/gu, ''), [alternative]).status, 'different');
  const identity = { sessionId: 'fr-sentence', exerciseId: 'phrase', generation: 1 };
  const written = createSentenceWrittenPractice({ identity, sentence, userId: 'learner' });
  written.edit(alternative.text); written.finalize(); written.selectTense('present-simple');
  assert.equal(written.getSnapshot().selectedTense, null);
  written.selectTense(alternative.tense);
  assert.equal(written.getSnapshot().selectedTense, alternative.tense);
  const saved = written.snapshotWrittenPractice()!;
  const restored = createSentenceWrittenPractice({ identity, sentence, userId: 'learner' });
  assert.equal(restored.restoreWrittenPractice(saved), true);
  assert.equal(restored.getSnapshot().selectedTense, alternative.tense);
  restored.edit('Autre brouillon');
  assert.equal(restored.getSnapshot().selectedTense, null);
  assert.equal(restored.getSnapshot().finalized, false);
});

test('French sentence sessions filter their own curriculum and reject English saved work', () => {
  const french = sentencesForLanguage('fr');
  const first = french[0]!;
  const voice = new SentenceFixtureVoice();
  const session = createSentenceSession({ voice, sessionId: 'phrases', language: 'fr', difficulty: first.difficulty, random: () => 0,
    writtenPracticeUserId: 'learner', onComplete() {} });
  const english = createSentenceSession({ voice: new SentenceFixtureVoice(), sessionId: 'phrases', language: 'en', difficulty: { grammar: 1, vocabulary: 1 },
    writtenPracticeUserId: 'learner', random: () => 0, onComplete() {} });
  try {
    for (let i = 0; i < 12; i++) {
      const context = session.getSnapshot().assessment.context;
      assert.equal(context.mode, 'sentence');
      if (context.mode !== 'sentence') throw new Error('Expected sentence');
      assert.equal(context.sentence.language, 'fr');
      assert.ok(context.sentence.alternatives.every(item => item.tense.startsWith('fr-')));
      assert.equal(session.skip(), true);
    }
    assert.equal(session.restoreWrittenPractice(english.snapshotWrittenPractice()), false);
    assert.ok(matchingSentences(first.difficulty, french, first.alternatives[0]!.tense).length);
    assert.equal(session.getSnapshot().assessment.sentenceStage, 'translation');
    assert.deepEqual(session.getSnapshot().assessment.evidence, {});
    assert.equal(voice.connects, 0);
  } finally { session.dispose(); english.dispose(); }
});
