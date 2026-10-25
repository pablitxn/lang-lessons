import { useId } from 'react';
import type { SentenceEntry, TranslationAlternative } from '../../contracts';
import { getSentenceExplanationDetails } from '../../content/sentence-explanations';
import { getTenseGuide } from '../../content/tense-guide';
import './sentence-explanation.css';

/** Authored learning feedback; it does not assess or create oral evidence. */
export function SentenceExplanation({ sentence, alternative, reference = false }: {
  sentence: SentenceEntry; alternative: TranslationAlternative; reference?: boolean;
}) {
  const id = useId();
  const explanation = getSentenceExplanationDetails(sentence, alternative);
  const language = sentence.language ?? 'en';
  const tense = getTenseGuide(language).find(item => item.tense === alternative.tense);
  if (!explanation) return null;
  return <section className="sentences-explanation" aria-labelledby={id} lang="es">
    <header className="sentences-explanation-heading">
      <h2 id={id}>La gramática de esta frase</h2>
      {tense && <span className="sentences-explanation-tense" lang={language}>{tense.label}</span>}
    </header>
    {reference && <p className="sentences-explanation-reference">Ejemplo de referencia</p>}
    <blockquote className="sentences-explanation-example" lang={language}>{alternative.text}</blockquote>
    <div className="sentences-explanation-details">
      <div className="sentences-explanation-structure">
        <h3>Estructura</h3>
        <p className="sentences-explanation-formula">{explanation.formula.map((part, index) =>
          <span className="sentences-explanation-formula-part" key={part}>{index > 0 && <span className="sentences-explanation-plus"> + </span>}<span>{part}</span></span>)}</p>
        {explanation.structure && <p>{explanation.structure}</p>}
      </div>
      <div className="sentences-explanation-context">
        <h3>En esta frase</h3>
        {explanation.context.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    </div>
    {explanation.notes.length > 0 && <ul className="sentences-explanation-notes">
      {explanation.notes.map(note => <li key={note}>{note}</li>)}
    </ul>}
  </section>;
}
