import { useId, useState } from 'react';
import type { ExerciseIdentity, SentenceEntry, Tense } from '../../contracts';
import type { WrittenTranslationReview } from '../../contracts/written-translation-review';
import { getTenseGuide } from '../../content/tense-guide';
import { WrittenTense, type WrittenTenseResult } from './WrittenTense';
import { SentenceRewritePractice } from './SentenceRewritePractice';
import './sentence-explanation.css';

/** A reviewed variant has transient practice, separate from authored and oral evidence. */
export function ReviewedTranslationPractice({ sentence, identity, draft, review, onTenseResult }: {
  sentence: SentenceEntry; identity: ExerciseIdentity; draft: string; review: WrittenTranslationReview;
  onTenseResult(result: WrittenTenseResult): void;
}) {
  const id = useId();
  const [selectedTense, setSelectedTense] = useState<Tense | null>(null);
  const language = sentence.language ?? 'en';
  if (review.status !== 'accepted' || !review.tense) return null;
  const tense = getTenseGuide(language).find(item => item.tense === review.tense);
  return <div className="sentences-reviewed-practice">
    <WrittenTense language={language} expected={review.tense} onResultChange={result => { setSelectedTense(result.selected); onTenseResult(result); }} />
    {selectedTense === review.tense && <section className="sentences-explanation" aria-labelledby={id} lang="es">
      <header className="sentences-explanation-heading">
        <h2 id={id}>La gramática de esta frase</h2>
        {tense && <span className="sentences-explanation-tense" lang={language}>{tense.label}</span>}
      </header>
      <blockquote className="sentences-explanation-example" lang={language}>{draft}</blockquote>
      <div className="sentences-explanation-details">
        <div className="sentences-explanation-context" style={{ gridColumn: '1 / -1' }}><p>{review.grammar}</p></div>
      </div>
    </section>}
    <SentenceRewritePractice sentence={sentence} identity={identity} originalTranslation={draft} />
  </div>;
}
