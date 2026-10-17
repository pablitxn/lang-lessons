import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { VERB_IDS, TENSES } from '../src/contracts/curriculum';
import { VERBS, SENTENCES, VERB_CUE_BRIEFS, VERB_PHOTOS, photosForVerb, pickVerbPhoto, pickNextVerb } from '../src/content/index';

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

test('sentence adapter preserves both residence constructions and contractions with only the sentence as the prompt', () => {
  const sentence = SENTENCES.find(item => item.id === 'sentence-since-2020')!;
  assert.equal(sentence.spanish, 'Vivimos aquí desde 2020.');
  assert.deepEqual(new Set(sentence.alternatives.map(a => a.tense)),
    new Set(['present-perfect', 'present-perfect-continuous']));
  assert.ok(sentence.alternatives.some(a => a.text === 'We have lived here since 2020.'));
  assert.ok(sentence.alternatives.some(a => a.text === 'We have been living here since 2020.'));
  assert.ok(sentence.alternatives.some(a => a.text.startsWith("We've")));
  for (const alternative of sentence.alternatives) assert.ok(alternative.explanation);
  assert.equal(SENTENCES.length, 33);
  const authored = JSON.parse(readFileSync(new URL('../content/en-wp-03/sentences.json', import.meta.url), 'utf8'));
  for (const entry of SENTENCES) {
    assert.equal(entry.spanish, authored.sentences.find((s: { id: string }) => s.id === entry.id).prompt_es);
  }
});

test('all tenses have independent grammar and vocabulary selection cells', () => {
  assert.deepEqual(new Set(SENTENCES.flatMap(s => s.alternatives.map(a => a.tense))), new Set(TENSES));
  for (const tense of TENSES) {
    const entries = SENTENCES.filter(s => s.alternatives.some(a => a.tense === tense));
    assert.ok(entries.some(a => entries.some(b => a.difficulty.grammar === b.difficulty.grammar && a.difficulty.vocabulary !== b.difficulty.vocabulary)));
    assert.ok(entries.some(a => entries.some(b => a.difficulty.grammar !== b.difficulty.grammar && a.difficulty.vocabulary === b.difficulty.vocabulary)));
  }
});

test('every verb has local real photographs with matching provenance and accessible context', () => {
  assert.equal(VERB_CUE_BRIEFS.length, 25);
  assert.deepEqual(readdirSync(new URL('../public/images/verbs/', import.meta.url)).sort(), VERB_PHOTOS.map(photo => photo.file.split('/').at(-1)).sort());
  for (const verb of VERBS) {
    const photos = photosForVerb(verb.id);
    assert.ok(photos.length >= 1);
    assert.equal(verb.image.src, photos[0]!.src);
    for (const photo of photos) {
      assert.equal(photo.media_type, 'photograph');
      assert.equal(photo.review_status, 'source-and-visual-reviewed');
      assert.ok(photo.alt.includes(photo.context_es));
      assert.ok(photo.creator && photo.source_url && photo.license_url);
      const raw = readFileSync(fileURLToPath(new URL(`../public${photo.src}`, import.meta.url)));
      assert.equal(raw.subarray(0, 3).toString('hex'), 'ffd8ff');
      assert.equal(createHash('sha256').update(raw).digest('hex'), photo.sha256);
    }
  }
});

test('photo selection reaches every variant and keeps its matching context and attribution', () => {
  for (const verb of VERBS) {
    const photos = photosForVerb(verb.id);
    for (let i = 0; i < photos.length; i++) {
      const photo = pickVerbPhoto(verb.id, () => (i + 0.5) / photos.length);
      assert.equal(photo.asset_id, photos[i]!.asset_id);
    }
  }
  const first = pickNextVerb(undefined, () => 0, () => 0);
  const alternate = pickNextVerb(undefined, () => 0, () => 1 - Number.EPSILON);
  assert.equal(first.id, alternate.id);
  assert.notEqual(first.image.src, alternate.image.src);
  assert.equal(alternate.image.alt, photosForVerb('be').at(-1)!.alt);
  for (const sample of [-1, 1, Infinity, NaN]) assert.throws(() => pickVerbPhoto('be', () => sample), RangeError);
});

test('abstract and directional cues retain explicit ambiguity and meaning context', () => {
  for (const id of ['be', 'become', 'begin', 'bet', 'bring', 'come', 'cost', 'deal', 'do', 'dream']) {
    const cue = VERB_CUE_BRIEFS.find(c => c.id === id)!;
    assert.equal(cue.ambiguous, true);
    assert.ok(cue.context_es.length > 20);
  }
});
