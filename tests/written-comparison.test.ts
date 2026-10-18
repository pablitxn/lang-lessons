import test from 'node:test';
import assert from 'node:assert/strict';
import type { SentenceEntry } from '../src/contracts';
import { SENTENCES } from '../src/content';
import { compareWrittenTranslation, MAX_WRITTEN_TRANSLATION_LENGTH } from '../src/features/sentences/written-comparison';

const example = (text: string): SentenceEntry['alternatives'][number] => ({ text, tense: 'present-simple', explanation: 'Test example.' });

test('written comparison matches every authored alternative and returns its original reference', () => {
  for (const sentence of SENTENCES) for (const alternative of sentence.alternatives) {
    const result = compareWrittenTranslation(alternative.text, sentence.alternatives);
    assert.equal(result.status, 'matched', `${sentence.id}: ${alternative.text}`);
    assert.ok(sentence.alternatives.includes(result.matchedAlternative!));
    assert.equal(result.closestAlternative, undefined);
  }
  const alternatives = [example('He buys bread every morning.'), example('Every morning, he buys bread.')];
  assert.equal(compareWrittenTranslation('Every morning, he buys bread!', alternatives).matchedAlternative, alternatives[1]);
});

test('written normalization preserves the draft while tolerating case, whitespace, terminal punctuation and curly apostrophes', () => {
  const draft = '  I’M\n drawing   a tree NOW!?  ';
  const result = compareWrittenTranslation(draft, [example('I am drawing a tree now.')]);
  assert.equal(result.status, 'matched');
  assert.equal(result.submittedText, draft);
  assert.equal(result.segments.map(segment => segment.text).join(''), draft);
  assert.ok(result.segments.every(segment => !segment.different && !segment.gap));
  assert.equal(compareWrittenTranslation('He said “yes”.', [example('He said "yes".')]).status, 'matched');
});

test('safe contractions work in both directions without conflating apostrophe-free words', () => {
  for (const [contracted, expanded] of [
    ["We're building a bridge.", 'We are building a bridge.'],
    ["I've done my homework.", 'I have done my homework.'],
    ["She doesn't buy milk.", 'She does not buy milk.'],
    ["They hadn't eaten.", 'They had not eaten.'],
    ["I won't go.", 'I will not go.'],
  ]) {
    assert.equal(compareWrittenTranslation(contracted!, [example(expanded!)]).status, 'matched');
    assert.equal(compareWrittenTranslation(expanded!, [example(contracted!)]).status, 'matched');
  }
  assert.equal(compareWrittenTranslation('Were building a bridge.', [example('We are building a bridge.')]).status, 'different');
  assert.equal(compareWrittenTranslation('Its raining.', [example('It is raining.')]).status, 'different');
  assert.equal(compareWrittenTranslation("It's roof is red.", [example('Its roof is red.')]).status, 'different');
});

test('ambiguous contractions derive only from the authored auxiliary and do not license an invented expansion', () => {
  assert.equal(compareWrittenTranslation("He's coming home.", [example('He is coming home.')]).status, 'matched');
  assert.equal(compareWrittenTranslation("He's bought milk.", [example('He has bought milk.')]).status, 'matched');
  assert.equal(compareWrittenTranslation("I'd finished when you called.", [example('I had finished when you called.')]).status, 'matched');
  assert.equal(compareWrittenTranslation("I'd go home.", [example('I would go home.')]).status, 'matched');
  assert.equal(compareWrittenTranslation('He has coming home.', [example("He's coming home.")]).status, 'different');
  assert.equal(compareWrittenTranslation('He is bought milk.', [example("He's bought milk.")]).status, 'different');
  assert.equal(compareWrittenTranslation('I would finished when you called.', [example("I'd finished when you called.")]).status, 'different');
  assert.equal(compareWrittenTranslation('I had go home.', [example("I'd go home.")]).status, 'different');
});

test('Unicode correction marks refer to original graphemes and gap markers never insert missing letters', () => {
  const draft = '  I draw a cafe\u0301 🌲.  ';
  const result = compareWrittenTranslation(draft, [example('I draw a café 🌳.')]);
  assert.equal(result.status, 'different');
  assert.equal(result.segments.map(segment => segment.text).join(''), draft);
  assert.deepEqual(result.segments.filter(segment => segment.different && !segment.gap).map(segment => segment.text), ['🌲']);
  assert.equal(compareWrittenTranslation('I draw a cafe\u0301.', [example('I draw a café.')]).status, 'matched');
  const omission = compareWrittenTranslation('I daw a tree.', [example('I draw a tree.')]);
  assert.ok(omission.segments.some(segment => segment.gap));
  assert.ok(omission.segments.filter(segment => segment.gap).every(segment => segment.text === ''));
  assert.equal(omission.segments.map(segment => segment.text).join(''), 'I daw a tree.');
  const trailing = compareWrittenTranslation('I draw a tree.  ', [example('I draw a tree now.')]);
  assert.ok(trailing.segments.some(segment => segment.gap));
  assert.equal(trailing.segments.map(segment => segment.text).join(''), 'I draw a tree.  ');
});

test('unlisted valid wording stays a comparison, with no incorrect verdict or oral evidence', () => {
  const alternatives = [example('He buys bread every morning.')];
  const result = compareWrittenTranslation('Every morning he purchases bread.', alternatives);
  assert.equal(result.status, 'different');
  assert.equal(result.closestAlternative, alternatives[0]);
  assert.equal(result.matchedAlternative, undefined);
  assert.equal('source' in result, false);
  assert.equal('ref' in result, false);
  assert.equal(compareWrittenTranslation('Any wording.', []).status, 'different');
});

test('empty and oversized drafts are bounded using native maxLength units', () => {
  assert.equal(compareWrittenTranslation(' \n\t ', [example('Hello.')]).status, 'empty');
  assert.equal(compareWrittenTranslation('...', [example('Hello.')]).status, 'empty');
  const boundary = 'a'.repeat(MAX_WRITTEN_TRANSLATION_LENGTH);
  assert.equal(compareWrittenTranslation(boundary, [example(boundary)]).status, 'matched');
  const long = boundary + 'a';
  const result = compareWrittenTranslation(long, [example('Hello.')]);
  assert.equal(result.status, 'too-long');
  assert.equal(result.submittedText, long);
  assert.equal(result.closestAlternative, undefined);
  assert.equal(compareWrittenTranslation('🌳'.repeat(MAX_WRITTEN_TRANSLATION_LENGTH / 2 + 1), []).status, 'too-long');
});
