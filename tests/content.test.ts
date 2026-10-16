import assert from 'node:assert/strict';
import test from 'node:test';
import { VERB_IDS, PRESENT_TENSES } from '../src/contracts/curriculum.ts';
import { VERBS, SENTENCES, VERB_CUE_BRIEFS, pickNextVerb } from '../src/content/index.ts';

test('content exports exactly the contract inventory with guidance and three complete example families', () => {
  assert.deepEqual(VERBS.map(verb => verb.id), [...VERB_IDS]);
  assert.equal(new Set(VERBS.map(verb => verb.id)).size, 25);
  for (const verb of VERBS) {
    assert.ok(verb.spanishMeanings.length > 0);
    for (const family of ['base', 'past', 'participle'] as const) {
      assert.ok(verb.forms[family].accepted.length > 0);
      assert.ok(verb.forms[family].ipa);
      assert.ok(verb.forms[family].spanishSoundGuide);
      assert.equal(verb.examples[family].length, 1);
    }
  }
});

test('adapter preserves both burn and dream variants in both slots', () => {
  for (const [id, variants] of [['burn', ['burned', 'burnt']], ['dream', ['dreamed', 'dreamt']]] as const) {
    const verb = VERBS.find(item => item.id === id)!;
    assert.deepEqual(verb.forms.past.accepted, [...variants]);
    assert.deepEqual(verb.forms.participle.accepted, [...variants]);
  }
  assert.match(VERBS.find(v => v.id === 'buy')!.examples.base[0]!, /He buys/);
  assert.match(VERBS.find(v => v.id === 'buy')!.examples.participle[0]!, /has bought/);
});

test('every selectable bin stays inside exact25 and excludes the previous verb', () => {
  for (const previous of VERB_IDS) {
    const picked = new Set<string>();
    for (let bin = 0; bin < 24; bin++) {
      const verb = pickNextVerb(previous, () => (bin + 0.5) / 24);
      assert.notEqual(verb.id, previous);
      assert.ok(VERB_IDS.includes(verb.id));
      picked.add(verb.id);
    }
    assert.equal(picked.size, 24);
  }
  assert.equal(pickNextVerb(undefined, () => 0).id, 'be');
  assert.equal(pickNextVerb(undefined, () => 1 - Number.EPSILON).id, 'dream');
});

test('invalid injected randomness cannot escape the inventory', () => {
  for (const sample of [-0.1, 1, Infinity, -Infinity, NaN]) {
    assert.throws(() => pickNextVerb('be', () => sample), RangeError);
  }
});

test('sentence adapter preserves both residence constructions, contractions and visible context', () => {
  const sentence = SENTENCES.find(item => item.id === 'sentence-since-2020')!;
  assert.match(sentence.spanish, /Todavía vivimos aquí/);
  assert.deepEqual(new Set(sentence.alternatives.map(a => a.tense)),
    new Set(['present-perfect', 'present-perfect-continuous']));
  assert.ok(sentence.alternatives.some(a => a.text === 'We have lived here since 2020.'));
  assert.ok(sentence.alternatives.some(a => a.text === 'We have been living here since 2020.'));
  assert.ok(sentence.alternatives.some(a => a.text.startsWith("We've")));
  for (const alternative of sentence.alternatives) assert.ok(alternative.explanation);
  assert.equal(SENTENCES.length, 17);
});

test('all tenses have independent grammar and vocabulary selection cells', () => {
  assert.deepEqual(new Set(SENTENCES.flatMap(s => s.alternatives.map(a => a.tense))), new Set(PRESENT_TENSES));
  for (const tense of PRESENT_TENSES) {
    const entries = SENTENCES.filter(s => s.alternatives.some(a => a.tense === tense));
    assert.ok(entries.some(a => entries.some(b => a.difficulty.grammar === b.difficulty.grammar && a.difficulty.vocabulary !== b.difficulty.vocabulary)));
    assert.ok(entries.some(a => entries.some(b => a.difficulty.grammar !== b.difficulty.grammar && a.difficulty.vocabulary === b.difficulty.vocabulary)));
  }
});

test('image metadata honestly preserves the brief-only asset gap', () => {
  assert.equal(VERB_CUE_BRIEFS.length, 25);
  assert.ok(VERBS.every(v => v.image.src === '' && v.image.attribution.includes('pending')));
  assert.ok(VERB_CUE_BRIEFS.every(cue => cue.file === null && cue.asset_status === 'brief-only'));
});
