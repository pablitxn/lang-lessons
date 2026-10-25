import type { ExerciseIdentity, LearningLanguage } from './curriculum';
import type { DictionaryEntry, DictionarySource } from './dictionary';

export interface WordDictionaryRequest { identity: ExerciseIdentity; sentenceId: string; word: string }
export interface WordDictionaryResponse {
  status: 'found' | 'not-found'; word: string; language: LearningLanguage;
  entry: DictionaryEntry | null; definitionLanguage: 'en';
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
function source(value: unknown): value is DictionarySource {
  if (!record(value) || !text(value.url, 1000) || !text(value.snapshotId, 200) || !text(value.retrievedOn, 40)
    || !text(value.contentHash, 100) || !text(value.license, 200) || !text(value.attribution, 500)) return false;
  try { const url = new URL(value.url); return url.origin === 'https://en.wiktionary.org' && url.pathname.startsWith('/wiki/') && !url.username && !url.password; }
  catch { return false; }
}
function sourced(value: unknown, limit: number) { return record(value) && text(value.text, limit) && source(value.source); }

/** Validate remote dictionary data before rendering text or source links. */
export function parseWordDictionaryResponse(value: unknown): WordDictionaryResponse | null {
  if (!record(value) || !text(value.word, 80) || !['en', 'fr'].includes(value.language as string)
    || value.definitionLanguage !== 'en') return null;
  if (value.status === 'not-found' && value.entry === null) return value as unknown as WordDictionaryResponse;
  const entry = value.entry;
  if (value.status !== 'found' || !record(entry) || !text(entry.lemma, 100)
    || !Array.isArray(entry.senses) || !entry.senses.length || entry.senses.length > 6
    || !Array.isArray(entry.pronunciations) || entry.pronunciations.length > 8) return null;
  if (!entry.senses.every(sense => record(sense) && text(sense.id, 200)
    && sourced(sense.definition, 2000) && sourced(sense.partOfSpeech, 80)
    && Array.isArray(sense.examples) && sense.examples.length <= 2 && sense.examples.every(example => sourced(example, 1000)))) return null;
  if (!entry.pronunciations.every(item => record(item) && text(item.dialect, 200) && sourced(item.notation, 200))) return null;
  return value as unknown as WordDictionaryResponse;
}
