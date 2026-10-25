import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_SENTENCES, SENTENCES, FRENCH_SENTENCES } from '../src/content';
import { getSentenceExplanation, getSentenceExplanationDetails } from '../src/content/sentence-explanations';
import { compareWrittenTranslation } from '../src/features/sentences/written-comparison';

test('every authored sentence alternative has completion guidance in Spanish', () => {
  for (const sentence of ALL_SENTENCES) {
    for (const alternative of sentence.alternatives) {
      const explanation = getSentenceExplanation(sentence, alternative);
      assert.ok(explanation && explanation.trim().length > 30, `${sentence.id}: ${alternative.text}`);
      assert.doesNotMatch(explanation, /undefined|\[object Object\]/u);
      const details = getSentenceExplanationDetails(sentence, alternative)!;
      assert.ok(details.formula.length > 0 && details.formula.every(part => part.trim()), `Missing construction: ${sentence.id}`);
      assert.ok(details.context.length > 0 && details.context.every(paragraph => paragraph.trim()), `Missing context: ${sentence.id}`);
      assert.equal(details.text, explanation, 'The structured presentation retains plain-text compatibility');
    }
  }
});

test('completion guidance follows the matched tense instead of the sentence practice filter', () => {
  const sentence = SENTENCES.find(item => item.id === 'sentence-future-simple-guide')!;
  const will = sentence.alternatives.find(item => item.tense === 'future-simple')!;
  const goingTo = sentence.alternatives.find(item => item.tense === 'future-going-to')!;
  assert.match(getSentenceExplanation(sentence, will)!, /will \+ verbo base/u);
  assert.match(getSentenceExplanation(sentence, goingTo)!, /am\/is\/are going to \+ verbo base/u);
  assert.doesNotMatch(getSentenceExplanation(sentence, goingTo)!, /will \+ verbo base/u);
});

test('residence alternatives preserve ongoing meaning and their actual aspect including contractions', () => {
  const sentence = SENTENCES.find(item => item.id === 'sentence-since-2020')!;
  for (const draft of ["We've lived here since 2020.", "We've been living here since 2020."]) {
    const result = compareWrittenTranslation(draft, sentence.alternatives);
    assert.equal(result.status, 'matched');
    const explanation = getSentenceExplanation(sentence, result.matchedAlternative!)!;
    assert.match(explanation, /seguimos viviendo aquí/u);
    if (draft.includes('been')) assert.match(explanation, /Have\/has been \+ verbo en -ing/u);
    else assert.match(explanation, /Have\/has \+ participio/u);
    const details = getSentenceExplanationDetails(sentence, result.matchedAlternative!)!;
    assert.match(details.context.join(' '), /seguimos viviendo aquí/u);
    assert.equal(details.formula.join(' + '), draft.includes('been') ? 'have/has been + verbo en -ing' : 'have/has + participio');
  }
});

test('past residence guidance preserves the accepted continuous reading without contradicting it', () => {
  const sentence = SENTENCES.find(item => item.id === 'sentence-past-simple-question')!;
  const continuous = sentence.alternatives.find(item => item.tense === 'past-continuous')!;
  const simple = sentence.alternatives.find(item => item.tense === 'past-simple')!;
  const continuousExplanation = getSentenceExplanation(sentence, continuous)!;
  assert.match(continuousExplanation, /was\/were \+ verbo en -ing/u);
  assert.match(continuousExplanation, /continuo es una lectura válida/u);
  assert.doesNotMatch(continuousExplanation, /no por una acción temporal en progreso/u);
  assert.match(continuousExplanation, /no afirma dónde viven ahora/u);
  assert.match(getSentenceExplanation(sentence, simple)!, /situación pasada/u);
});

test('mixed-tense contexts explain the selected reading without imposing the primary tense', () => {
  const cases = [
    ['sentence-expand-pp-lost-keys', 'past-simple', /algunos dialectos.*no afirma que las llaves ya se hayan recuperado/u],
    ['sentence-future-simple-guide', 'future-going-to', /se presenta como un plan/u],
    ['sentence-future-going-to-bookshop', 'present-continuous', /plan organizado.*no como una actividad que esté ocurriendo ahora/u],
    ['sentence-future-going-to-shelf', 'future-simple', /Will también permite expresar esta previsión/u],
  ] as const;
  for (const [id, tense, expected] of cases) {
    const sentence = SENTENCES.find(item => item.id === id)!;
    const alternative = sentence.alternatives.find(item => item.tense === tense)!;
    assert.match(getSentenceExplanation(sentence, alternative)!, expected);
    assert.match(getSentenceExplanationDetails(sentence, alternative)!.context.join(' '), expected, 'The selected meaning stays in the context section');
  }
});

test('future questions distinguish main auxiliaries from present-tense time clauses', () => {
  const sentence = SENTENCES.find(item => item.id === 'sentence-future-simple-arrival-call')!;
  const explanation = getSentenceExplanation(sentence, sentence.alternatives[0]!)!;
  assert.match(explanation, /auxiliar va antes del sujeto/u);
  assert.match(explanation, /cláusula.*presente simple/u);
  const subjectQuestion = SENTENCES.find(item => item.id === 'sentence-future-simple-garden')!;
  const subjectExplanation = getSentenceExplanation(subjectQuestion, subjectQuestion.alternatives[0]!)!;
  assert.match(subjectExplanation, /lugar del sujeto/u);
  assert.doesNotMatch(subjectExplanation, /auxiliar va antes del sujeto/u);
  const details = getSentenceExplanationDetails(sentence, sentence.alternatives[0]!)!;
  assert.equal(details.notes.length, 2);
  assert.match(details.notes[0]!, /auxiliar va antes del sujeto/u);
  assert.match(details.notes[1]!, /cláusula.*presente simple/u);
});

test('French completion reuses the specific authored Spanish explanation', () => {
  const sentence = FRENCH_SENTENCES.find(item => item.alternatives.some(alternative => alternative.text === 'Je suis chez moi.'))!;
  const alternative = sentence.alternatives.find(item => item.text === 'Je suis chez moi.')!;
  assert.equal(getSentenceExplanation(sentence, alternative), alternative.explanation);
  assert.match(getSentenceExplanation(sentence, alternative)!, /Chez moi/u);
});

test('French structured guidance preserves every authored sentence without importing English grammar', () => {
  for (const sentence of FRENCH_SENTENCES) for (const alternative of sentence.alternatives) {
    const details = getSentenceExplanationDetails(sentence, alternative)!;
    assert.equal(details.context.join(' '), alternative.explanation.replace(/\s+/gu, ' ').trim(), `${sentence.id}: authored explanation lost`);
    assert.equal(details.text, alternative.explanation);
    assert.doesNotMatch(details.formula.join(' + '), /have\/has|will|verbo en -ing/u);
  }
});

test('structured perfect guidance separates the construction from its contextual relevance', () => {
  const sentence = SENTENCES.find(item => item.id === 'sentence-pp-done')!;
  const details = getSentenceExplanationDetails(sentence, sentence.alternatives[0]!)!;
  assert.deepEqual(details.formula, ['have/has', 'participio']);
  assert.match(details.structure!, /anterior con el presente/u);
  assert.deepEqual(details.context, ['La tarea está lista ahora; no se dice cuándo se terminó.']);
  assert.deepEqual(details.notes, []);
});

test('unrecognized or stale alternatives do not show another construction explanation', () => {
  const sentence = SENTENCES[0]!;
  assert.equal(getSentenceExplanation(sentence, { ...sentence.alternatives[0]!, tense: 'future-perfect' }), undefined);
  assert.equal(getSentenceExplanation(sentence, SENTENCES.find(item => item.id === 'sentence-since-2020')!.alternatives[0]!), undefined);
  assert.equal(getSentenceExplanation({ ...sentence, id: 'unknown-sentence' }, sentence.alternatives[0]!), undefined);
  assert.equal(getSentenceExplanationDetails(sentence, { ...sentence.alternatives[0]!, tense: 'future-perfect' }), undefined);
  assert.equal(getSentenceExplanationDetails({ ...sentence, id: 'unknown-sentence' }, sentence.alternatives[0]!), undefined);
});
