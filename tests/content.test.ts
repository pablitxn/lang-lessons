import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { VERB_IDS, PRESENT_TENSES } from '../src/contracts/curriculum';
import { VERBS, SENTENCES, VERB_CUE_BRIEFS, pickNextVerb } from '../src/content/index';

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

test('every image has a unique local SVG, nonvisual cue, context and original provenance', () => {
  assert.equal(VERB_CUE_BRIEFS.length, 25);
  assert.deepEqual(readdirSync(new URL('../public/images/verbs/', import.meta.url)).filter(f => f.endsWith('.svg')).sort(), [...VERB_IDS].map(id => `${id}.svg`).sort());
  const ledger = JSON.parse(readFileSync(new URL('../content/en-wp-03/asset-ledger.json', import.meta.url), 'utf8'));
  for (const verb of VERBS) {
    assert.equal(verb.image.src, `/images/verbs/${verb.id}.svg`);
    const cue = VERB_CUE_BRIEFS.find(c => c.id === verb.id)!;
    const asset = ledger.assets.find((entry: { content_id: string }) => entry.content_id === `verb-${verb.id}`);
    assert.equal(cue.asset_status, 'original-local-svg');
    assert.ok(cue.nonvisual_cue_es && cue.context_es);
    assert.ok(verb.image.alt.includes(cue.context_es));
    assert.ok(verb.image.attribution.includes('Original'));
    const svgPath = fileURLToPath(new URL(`../public${verb.image.src}`, import.meta.url));
    const svg = readFileSync(svgPath, 'utf8');
    assert.match(svg, /viewBox="0 0 320 240"/);
    assert.doesNotMatch(svg, /<(?:text|script|image|foreignObject)\b|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);
    assert.equal(createHash('sha256').update(svg).digest('hex'), asset.sha256);
  }
  assert.equal(new Set(ledger.assets.map((asset: { sha256: string }) => asset.sha256)).size, 25);
});

test('abstract and directional cues retain explicit ambiguity and meaning context', () => {
  for (const id of ['be', 'become', 'begin', 'bet', 'bring', 'come', 'cost', 'deal', 'do', 'dream']) {
    const cue = VERB_CUE_BRIEFS.find(c => c.id === id)!;
    assert.equal(cue.ambiguous, true);
    assert.ok(cue.context_es.length > 20);
  }
});
