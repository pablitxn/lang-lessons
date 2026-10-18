import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VERB_IDS } from '../src/contracts';
import { getPictureDictionaryEntry } from '../src/features/verbs/dictionary';
import snapshot from '../src/features/verbs/dictionary/wiktionary.snapshot.json' with { type: 'json' };

test('reviewed dictionary snapshot covers exactly 25 curriculum verbs with pinned attribution and intact hashes', () => {
  assert.deepEqual(snapshot.entries.map(entry => entry.content.lemma), [...VERB_IDS]);
  for (const entry of snapshot.entries) {
    const c = entry.content;
    assert.match(entry.revision, /^\d+$/);
    assert.equal(entry.sourceUrl, `https://en.wiktionary.org/w/index.php?title=${c.lemma}&oldid=${entry.revision}#English`);
    assert.equal(entry.historyUrl, `https://en.wiktionary.org/w/index.php?title=${c.lemma}&action=history`);
    assert.equal(entry.contentHash, 'sha256:' + createHash('sha256').update(JSON.stringify(c)).digest('hex'));
    assert.equal(c.partOfSpeech, 'Verb'); assert.ok(c.definition.length > 0);
    assert.match(c.pronunciation.ipa, /^\/[^/]+\/(, \/[^/]+\/)*$/);
    const adapted = getPictureDictionaryEntry(c.lemma)!;
    assert.equal(adapted.senses[0]!.definition.text, c.definition);
    assert.equal(adapted.pronunciations[0]!.notation.text, c.pronunciation.ipa);
    for (const value of [adapted.senses[0]!.partOfSpeech, adapted.senses[0]!.definition, ...adapted.senses[0]!.examples, ...adapted.pronunciations.map(p => p.notation)]) {
      assert.equal(value.source.license, 'CC BY-SA 4.0');assert.equal(value.source.url, entry.sourceUrl);
      assert.equal(value.source.contentHash, entry.contentHash);assert.match(value.source.attribution, /^English Wiktionary contributors/);
    }
  }
});
test('photo-relevant dictionary senses remain distinct and absent examples are never generated', () => {
  assert.equal(getPictureDictionaryEntry('beat')!.senses[0]!.definition.text, 'To mix food in a rapid fashion. Compare whip.');
  assert.match(getPictureDictionaryEntry('catch')!.senses[0]!.definition.text, /object moving through the air/);
  assert.match(getPictureDictionaryEntry('draw')!.senses[0]!.definition.text, /picture/);
  assert.match(getPictureDictionaryEntry('deal')!.senses[0]!.definition.text, /cards/);
  assert.equal(getPictureDictionaryEntry('bleed')!.senses[0]!.examples.length, 0);
  assert.equal(snapshot.entries.filter(e => e.content.examples.length).length, 24);
  assert.ok(snapshot.entries.every(e => e.review.exampleKind === 'contributor usage example' || e.review.omissionReason));
  assert.equal(getPictureDictionaryEntry('invented'), null);
  assert.equal(getPictureDictionaryEntry('__proto__'), null);
});
