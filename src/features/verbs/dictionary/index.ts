import type { DictionaryEntry, DictionarySource, SourcedDictionaryText, VerbId } from '../../../contracts';
import snapshot from './wiktionary.snapshot.json';
import frenchSnapshot from './french.snapshot.json';

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
  return entries.get(verbId) ?? frenchEntries.get(verbId) ?? null;
}

export const FRENCH_DICTIONARY_NOTICE = {
  snapshotId: frenchSnapshot.snapshotId, licenseUrl: frenchSnapshot.licenseUrl,
  modifications: frenchSnapshot.modifications,
} as const;
const frenchEntries = new Map<string, DictionaryEntry>(frenchSnapshot.entries.map(entry => {
  const source: DictionarySource = Object.freeze({ url: entry.sourceUrl, snapshotId: frenchSnapshot.snapshotId,
    retrievedOn: frenchSnapshot.retrievedOn, contentHash: entry.contentHash, license: frenchSnapshot.license,
    attribution: `${frenchSnapshot.attribution} — ${entry.content.lemma}` });
  const originalExampleSource: DictionarySource = Object.freeze({ ...source,
    url: 'https://github.com/pablitxn/lang-lessons/blob/main/content/fr/verbs.json',
    snapshotId: 'lang-lessons-fr-curriculum-2026-10-24', license: 'Original Lang Lessons curriculum',
    attribution: 'Lang Lessons · ejemplo didáctico original; no es una cita del diccionario',
  });
  const sourced = (text: string): SourcedDictionaryText => Object.freeze({ text, source });
  const content = entry.content;
  return [entry.id, Object.freeze({ lemma: content.lemma,
    pronunciations: Object.freeze([{ dialect: content.pronunciation.label, notation: sourced(content.pronunciation.ipa) }]),
    senses: Object.freeze([Object.freeze({ id: `${entry.id}:everyday-sense`,
      partOfSpeech: sourced(content.partOfSpeech), definition: sourced(content.definition),
      examples: Object.freeze(content.examples.map(text => Object.freeze({ text, source: originalExampleSource }))),
    })]),
  })];
}));
