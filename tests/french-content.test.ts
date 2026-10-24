import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ENGLISH_TENSES, FRENCH_TENSES, FRENCH_VERB_FORMS, VERB_IDS } from '../src/contracts';
import { ALL_VERBS, ALL_SENTENCES, FRENCH_VERBS, FRENCH_SENTENCES, FRENCH_VERB_PHOTOS, VERBS, SENTENCES, verbsForLanguage, sentencesForLanguage, photosForLanguage, pickNextVerb } from '../src/content';
import { getTenseGuide, getVerbTenseGuide } from '../src/content/tense-guide';
import { getPictureDictionaryEntry } from '../src/features/verbs/dictionary';
import frenchDictionary from '../src/features/verbs/dictionary/french.snapshot.json';
import englishLedger from '../content/en-wp-03/asset-ledger.json';

test('French curriculum has 25 separate irregular verbs and real French paradigms', () => {
  assert.equal(FRENCH_VERBS.length, 25);
  assert.equal(new Set(FRENCH_VERBS.map(verb => verb.id)).size, 25);
  assert.equal(ALL_VERBS.length, 50);
  assert.deepEqual(VERBS.map(verb => verb.id), [...VERB_IDS]);
  assert.equal(verbsForLanguage(), VERBS);
  assert.equal(verbsForLanguage('fr'), FRENCH_VERBS);
  for (const verb of FRENCH_VERBS) {
    assert.match(verb.id, /^fr-[a-z]+$/u);
    assert.equal(verb.language, 'fr');
    assert.deepEqual(Object.keys(verb.forms), [...FRENCH_VERB_FORMS]);
    assert.equal(verb.presentConjugation.length, 6);
    assert.equal(verb.forms.present.accepted[0], verb.presentConjugation[0]!.form);
    assert.ok(verb.spanishMeanings.length);
    assert.equal(verb.tenseExamples?.length, 6);
    for (const form of FRENCH_VERB_FORMS) {
      assert.ok(verb.forms[form].accepted.length);
      assert.match(verb.forms[form].ipa, /^\/.+\/$/u);
      assert.ok(verb.forms[form].spanishSoundGuide.length > 5);
      assert.ok(verb.examples[form][0]);
    }
    assert.match(verb.examples.participle[0]!, /^(?:J’ai|Je suis) /u);
  }
  assert.deepEqual(FRENCH_VERBS.find(verb => verb.id === 'fr-etre')!.forms.participle.accepted, ['été']);
  assert.match(FRENCH_VERBS.find(verb => verb.id === 'fr-etre')!.examples.participle[0]!, /^J’ai été/u);
  assert.equal(FRENCH_VERBS.find(verb => verb.id === 'fr-sortir')!.auxiliary, 'avoir / être');
  assert.ok(FRENCH_VERBS.find(verb => verb.id === 'fr-connaitre')!.forms.infinitive.accepted.includes('connaitre'));
});

test('French tenses cover every independent difficulty pair without leaking into English', () => {
  assert.equal(sentencesForLanguage(), SENTENCES);
  assert.equal(sentencesForLanguage('fr'), FRENCH_SENTENCES);
  assert.equal(FRENCH_SENTENCES.length, 135);
  assert.equal(ALL_SENTENCES.length, SENTENCES.length + FRENCH_SENTENCES.length);
  assert.equal(new Set(ALL_SENTENCES.map(sentence => sentence.id)).size, ALL_SENTENCES.length);
  for (const tense of FRENCH_TENSES) for (const grammar of [1, 2, 3]) for (const vocabulary of [1, 2, 3]) {
    const candidates = FRENCH_SENTENCES.filter(sentence => sentence.difficulty.grammar === grammar && sentence.difficulty.vocabulary === vocabulary && sentence.alternatives.some(alternative => alternative.tense === tense));
    assert.ok(candidates.length, `${tense} grammar ${grammar} vocabulary ${vocabulary}`);
    for (const sentence of candidates) {
      assert.equal(sentence.language, 'fr');
      assert.match(sentence.id, /^fr-/u);
      assert.ok(sentence.spanish && sentence.hintSeeds.length && sentence.explanationRubric.usage);
      assert.ok(sentence.alternatives.every(alternative => alternative.explanation.length > 30));
    }
  }
  assert.deepEqual(getTenseGuide('fr').map(item => item.tense), [...FRENCH_TENSES]);
  assert.deepEqual(getTenseGuide().map(item => item.tense), [...ENGLISH_TENSES]);
  assert.deepEqual(getVerbTenseGuide('fr').map(item => item.tense), [...FRENCH_TENSES]);
});

test('French image collection preserves source provenance, local bytes and contextual mapping', () => {
  assert.equal(photosForLanguage('fr'), FRENCH_VERB_PHOTOS);
  assert.equal(FRENCH_VERB_PHOTOS.length, 75);
  for (const verb of FRENCH_VERBS) assert.equal(FRENCH_VERB_PHOTOS.filter(photo => photo.verbId === verb.id).length, 3);
  for (const photo of FRENCH_VERB_PHOTOS) {
    const source = englishLedger.assets.find(asset => asset.asset_id === photo.source_asset_id)!;
    assert.ok(source);
    for (const key of ['src', 'source_url', 'license_url', 'creator', 'sha256', 'attribution', 'transformations'] as const) assert.equal(photo[key], source[key]);
    const bytes = readFileSync(new URL(`../public${photo.src}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), photo.sha256);
    assert.ok(photo.context_es.length > 20 && photo.tooltip_es.length > 10);
  }
  for (const verb of FRENCH_VERBS) assert.equal(verb.image.alt, FRENCH_VERB_PHOTOS.find(photo => photo.verbId === verb.id)!.alt);
  for (let n = 0; n < 25; n++) {
    const picked = pickNextVerb(undefined, () => (n + 0.5) / 25, () => 0, 'fr');
    assert.match(picked.id, /^fr-/u);
    assert.ok(picked.image.src.startsWith('/images/verbs/'));
  }
});

test('French dictionary is local, attributed, revision pinned and distinguishes original examples', () => {
  assert.equal(frenchDictionary.entries.length, 25);
  for (const entry of frenchDictionary.entries) {
    const resolved = getPictureDictionaryEntry(entry.id)!;
    assert.ok(resolved);
    assert.equal(resolved.lemma, entry.content.lemma);
    assert.equal(entry.contentHash, `sha256:${createHash('sha256').update(JSON.stringify(entry.content)).digest('hex')}`);
    assert.ok(entry.sourceUrl.includes(`oldid=${entry.revision}`));
    assert.equal(resolved.senses[0]!.definition.source.license, 'CC BY-SA 4.0');
    assert.match(resolved.senses[0]!.examples[0]!.source.attribution, /original/u);
    assert.notEqual(resolved.senses[0]!.examples[0]!.source.url, resolved.senses[0]!.definition.source.url);
    assert.equal(resolved.pronunciations.length, 1);
  }
  assert.equal(getPictureDictionaryEntry('fr-not-in-curriculum'), null);
  assert.equal(getPictureDictionaryEntry('be')!.lemma, 'be');
});
