import type { ExerciseIdentity } from './curriculum';
export interface DictionarySource {
  readonly url: string; readonly snapshotId: string; readonly retrievedOn: string;
  readonly contentHash: string; readonly license: string; readonly attribution: string;
}
export interface SourcedDictionaryText { readonly text: string; readonly source: DictionarySource }
export interface DictionarySense { readonly id: string; readonly definition: SourcedDictionaryText; readonly partOfSpeech: SourcedDictionaryText; readonly examples: readonly SourcedDictionaryText[] }
export interface DictionaryEntry { readonly lemma: string; readonly senses: readonly DictionarySense[]; readonly pronunciations: readonly { notation: SourcedDictionaryText; dialect: string }[] }
/** Missing content stays unavailable; only accepted completion can expose this presentation. */
export interface PictureCompletion { readonly identity: ExerciseIdentity; readonly dictionary: DictionaryEntry | null }
/** Selected by the existing deck; peeking consumes no randomness or evidence. */
export interface NextPicture { readonly key: string; readonly src: string }
