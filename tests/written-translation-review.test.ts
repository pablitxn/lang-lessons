import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWrittenTranslationReview } from '../src/contracts';
import { compareWrittenTranslation, reviewedFeedbackSegments } from '../src/features/sentences/written-comparison';

const draft = 'Tomorrow at this time, the kids will be playing in the yard.';
const reference = [{ text: 'The children will be playing in the yard at this time tomorrow.', tense: 'future-continuous' as const, explanation: 'An activity in progress at a future time.' }];
const accepted = { status: 'accepted', tense: 'future-continuous', grammar: 'La acción estará en curso a esa hora de mañana.', hint: '', issues: [] };
const issue = (text: string, hint = 'Revisá cómo se forma la actividad en curso.') => ({ text, hint });
const revision = (issues = [issue('will playing')]) => ({ status: 'needs-revision', tense: null, grammar: '', hint: '', issues });

test('an accepted paraphrase removes reference differences without replacing the learner draft', () => {
  const comparison = compareWrittenTranslation(draft, reference);
  assert.equal(comparison.status, 'different');
  const review = parseWrittenTranslationReview(accepted, draft, 'en');
  assert.ok(review);
  assert.deepEqual(reviewedFeedbackSegments(comparison, review), [{ text: draft, different: false, gap: false }]);
  assert.equal(comparison.status, 'different', 'Presentation review does not rewrite authored progress evidence');
});

test('pending, unavailable and uncertain review leave reference differences neutral', () => {
  const comparison = compareWrittenTranslation(draft, reference);
  for (const review of [undefined, parseWrittenTranslationReview({ status: 'uncertain', tense: null, grammar: '', hint: 'Aclarame a qué momento te referís.', issues: [] }, draft, 'en')!]) {
    const segments = reviewedFeedbackSegments(comparison, review);
    assert.equal(segments.map(part => part.text).join(''), draft);
    assert.ok(segments.every(part => !part.different && !part.gap));
  }
});

test('only the actual reviewed construction is marked, with its own hint', () => {
  const text = 'Tomorrow at this time, the kids will playing in the yard.';
  const review = parseWrittenTranslationReview(revision(), text, 'en'); assert.ok(review);
  const segments = reviewedFeedbackSegments(compareWrittenTranslation(text, reference), review);
  assert.equal(segments.map(part => part.text).join(''), text);
  assert.deepEqual(segments.filter(part => part.different), [{ text: 'will playing', hint: issue('').hint, different: true, gap: false }]);
  assert.ok(segments.every(part => !part.gap));
});

test('an omission points to the incomplete learner phrase instead of inventing missing reference text', () => {
  const text = 'Tomorrow at this time, the kids will be playing in the';
  const review = parseWrittenTranslationReview(revision([issue('in the', 'Falta indicar el lugar que menciona la frase en español.')]), text, 'en');
  assert.ok(review);
  const segments = reviewedFeedbackSegments(compareWrittenTranslation(text, reference), review);
  assert.deepEqual(segments.filter(part => part.different).map(part => part.text), ['in the']);
  assert.ok(segments.every(part => !part.gap));
});

test('review parser rejects contradictory verdicts and cross-language tense answers', () => {
  for (const value of [
    { ...accepted, issues: [issue('kids')] }, { ...accepted, tense: null }, { ...accepted, tense: 'fr-present' },
    { ...accepted, grammar: '' }, { ...accepted, hint: 'Good job' }, { ...accepted, extra: true },
    { ...revision(), issues: [] }, { ...revision(), grammar: 'A rule' }, { ...revision(), tense: 'future-continuous' },
    { status: 'uncertain', tense: null, grammar: '', hint: '', issues: [] },
  ]) assert.equal(parseWrittenTranslationReview(value, 'will playing', 'en'), null);
  assert.ok(parseWrittenTranslationReview({ ...accepted, tense: 'fr-present' }, 'Les enfants jouent.', 'fr'));
});

test('review issues must quote unique, disjoint complete words from the exact draft', () => {
  for (const issues of [[issue('children')], [issue('kid')], [issue('kids'), issue('the kids')], [issue('the')], [issue('')],
    [issue('kids'), issue('kids')], [issue('kids', '')], [issue('kids', '<script>')]]) {
    assert.equal(parseWrittenTranslationReview(revision(issues), draft, 'en'), null);
  }
  const repeated = 'I said no, no.';
  assert.equal(parseWrittenTranslationReview(revision([issue('no')]), repeated, 'en'), null);
  assert.ok(parseWrittenTranslationReview(revision([issue('no, no')]), repeated, 'en'));
  assert.equal(parseWrittenTranslationReview(revision([issue('cafe')]), 'cafe\u0301', 'fr'), null, 'A grapheme cannot be split');
});

test('each disjoint issue retains its own hint and exact original text', () => {
  const text = 'The kids will playing in te yard.';
  const review = parseWrittenTranslationReview(revision([issue('te', 'Revisá la escritura del artículo.'), issue('will playing')]), text, 'en'); assert.ok(review);
  const segments = reviewedFeedbackSegments(compareWrittenTranslation(text, reference), review);
  assert.equal(segments.map(part => part.text).join(''), text);
  assert.deepEqual(segments.filter(part => part.different).map(part => [part.text, part.hint]), [['will playing', issue('').hint], ['te', 'Revisá la escritura del artículo.']]);
});
