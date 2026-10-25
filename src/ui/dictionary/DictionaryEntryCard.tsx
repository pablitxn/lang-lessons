import type { ReactNode } from 'react';
import type { DictionaryEntry, DictionarySense, LearningLanguage } from '../../contracts';
import './dictionary-entry.css';

/** Shared dictionary presentation; supplied source wording is never generated here. */
export function DictionaryEntryCard({ entry, language, definitionLanguage = language, lemma = entry?.lemma ?? '', meaning, forms, title = 'Diccionario' }: {
  entry: DictionaryEntry | null; language: LearningLanguage; definitionLanguage?: LearningLanguage | 'es';
  lemma?: string; meaning?: string; forms?: ReactNode; title?: string;
}) {
  return <article className="dictionary-entry">
    <div className="dictionary-eyebrow" lang="es">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M10 4v12M3 3.5c3-.7 5 .1 7 1.3 2-1.2 4-2 7-1.3v12c-3-.7-5 .1-7 1.3-2-1.2-4-2-7-1.3z" /></svg>
      {title}
    </div>
    <header className="dictionary-heading">
      <div className="dictionary-word">
        <div className="dictionary-word-line">
          <h2 lang={language}>{lemma}</h2>
          {entry && <div className="dictionary-pronunciations">{entry.pronunciations.map((item, index) => <div key={index} className="dictionary-pronunciation">
            <span className="dictionary-ipa">{item.notation.text}</span>
            {!item.dialect.includes('not specified') && <span className="dictionary-dialect">{item.dialect}</span>}
          </div>)}</div>}
        </div>
        {meaning && <p className="dictionary-meaning" lang="es">{meaning}</p>}
      </div>
      {entry?.senses[0] && <span className="dictionary-part-of-speech" lang={definitionLanguage}>{entry.senses[0].partOfSpeech.text}</span>}
    </header>
    {forms}
    {entry ? <div className="dictionary-senses">{entry.senses.map((sense, index) => <DictionarySenseContent key={sense.id} sense={sense} language={language} definitionLanguage={definitionLanguage}
      showPartOfSpeech={index > 0 && sense.partOfSpeech.text !== entry.senses[index - 1]?.partOfSpeech.text} />)}</div>
      : <p className="dictionary-unavailable" lang="es">La definición del diccionario no está disponible.</p>}
  </article>;
}

function DictionarySenseContent({ sense, language, definitionLanguage, showPartOfSpeech }: { sense: DictionarySense; language: LearningLanguage; definitionLanguage: LearningLanguage | 'es'; showPartOfSpeech: boolean }) {
  return <section className="dictionary-sense">
    {showPartOfSpeech && <span className="dictionary-sense-label" lang={definitionLanguage}>{sense.partOfSpeech.text}</span>}
    <p className="dictionary-definition" lang={definitionLanguage}>{sense.definition.text}</p>
    {sense.examples.length > 0 && <div className="dictionary-examples">
      <span className="dictionary-example-label" lang="es">En contexto</span>
      {sense.examples.map((example, index) => <blockquote key={index} lang={language}><p>{example.text}</p></blockquote>)}
    </div>}
  </section>;
}
