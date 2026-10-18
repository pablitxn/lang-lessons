import type { DictionaryEntry, DictionarySource, SourcedDictionaryText, VerbId } from '../../../contracts';
import snapshot from './wiktionary.snapshot.json';

export const WIKTIONARY_NOTICE = {
  snapshotId: snapshot.snapshotId,
  licenseUrl: snapshot.licenseUrl,
  modifications: snapshot.modifications,
} as const;

const entries = new Map<string, DictionaryEntry>(snapshot.entries.map(entry => {
  const source: DictionarySource = Object.freeze({ url: entry.sourceUrl, snapshotId: snapshot.snapshotId,
    retrievedOn: snapshot.retrievedOn, contentHash: entry.contentHash, license: snapshot.license,
    attribution: `${snapshot.attribution} — ${entry.content.lemma}` });
  const sourced = (text: string): SourcedDictionaryText => Object.freeze({ text, source });
  const content = entry.content;
  return [content.lemma, Object.freeze({ lemma: content.lemma,
    pronunciations: Object.freeze([{ dialect: content.pronunciation.label, notation: sourced(content.pronunciation.ipa) }]),
    senses: Object.freeze([Object.freeze({ id: `${content.lemma}:selected-verb-sense`,
      partOfSpeech: sourced(content.partOfSpeech), definition: sourced(content.definition),
      examples: Object.freeze(content.examples.map(sourced)) })]),
  })];
}));

/** Local reviewed excerpt only. Never fetch, generate, or guess missing dictionary fields. */
export function getPictureDictionaryEntry(verbId: VerbId | string): DictionaryEntry | null {
  return entries.get(verbId) ?? null;
}
