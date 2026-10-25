import type { DictionaryEntry, ExerciseIdentity, VerbEntry, VerbMode } from '../../contracts';
import { VerbDictionaryEntry } from './VerbDictionaryEntry';
import { VerbSentencePractice } from './VerbSentencePractice';
import './picture-dictionary.css';

export interface VerbCompletionCardProps {
  identity: ExerciseIdentity;
  verb: VerbEntry;
  entry: DictionaryEntry | null;
  mode: VerbMode;
  onNext: () => void;
}

/** Shared completion presentation for both verb modes, mounted only after written acceptance. */
export function VerbCompletionCard({ identity, verb, entry, mode, onNext }: VerbCompletionCardProps) {
  const text = (english: string, spanish: string) => verb.language === 'fr' ? spanish : english;
  return <section className="picture-dictionary verb-completion" aria-label={mode === 'verb-image'
    ? text('Completed picture dictionary', 'Diccionario de la imagen completada') : text('Completed verb dictionary', 'Diccionario del verbo completado')}>
    <VerbDictionaryEntry entry={entry} verb={verb} />
    <VerbSentencePractice identity={identity} verb={verb} />
    <footer className="dictionary-footer">
      <button type="button" className="ll-button dictionary-next" onClick={onNext}>{mode === 'verb-image' ? text('Next picture', 'Siguiente imagen') : text('Next verb', 'Siguiente verbo')}
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </button>
    </footer>
  </section>;
}
