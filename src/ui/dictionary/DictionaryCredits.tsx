import type { LearningLanguage } from '../../contracts';
import { useDictionarySources } from './dictionary-credits';

export function DictionaryCredits({ language }: { language: LearningLanguage }) {
  const sources = useDictionarySources(language);
  if (!sources.length) return null;
  return <section aria-label="Consulted dictionary entries">
    <h4>Consulted dictionary entries</h4>
    <p>Excerpts by English Wiktionary contributors, under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>. Formatting adapted; internal references and duplicate excerpts omitted. No definitions or examples generated.</p>
    <ul className="learning-credit-entries">{sources.map(({ lemma, source }) => <li key={source.url}>
      <a href={source.url} target="_blank" rel="noreferrer" aria-label={source.attribution}>{lemma}</a>
    </li>)}</ul>
  </section>;
}
