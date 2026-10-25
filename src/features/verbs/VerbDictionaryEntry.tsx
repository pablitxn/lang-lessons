import type { DictionaryEntry, VerbEntry } from '../../contracts';
import { DictionaryEntryCard } from '../../ui/dictionary/DictionaryEntryCard';
import { VerbFormSummary } from './VerbFormSummary';

export function VerbDictionaryEntry({ entry, verb }: { entry: DictionaryEntry | null; verb: VerbEntry }) {
  return <DictionaryEntryCard entry={entry} language={verb.language ?? 'en'} definitionLanguage={verb.language === 'fr' ? 'es' : 'en'}
    lemma={entry?.lemma ?? (verb.language === 'fr' ? verb.lemma : verb.forms.base.accepted[0] ?? verb.id)}
    meaning={verb.spanishMeanings.join(' · ')} forms={<VerbFormSummary verb={verb} />} title="Para recordar" />;
}
