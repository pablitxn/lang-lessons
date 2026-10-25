import type { LearningLanguage, WrittenCoachingFeedback } from '../../contracts';
import { writingCorrection } from './writing-correction';
import './written-coaching-result.css';

/** Shared written feedback; differences explain the correction and never grade oral work. */
export function WrittenCoachingResult({ feedback, draft, language }: {
  feedback: WrittenCoachingFeedback; draft: string; language: LearningLanguage;
}) {
  return <div className="verb-practice-result writing-result" data-status={feedback.status} role="status" aria-live="polite">
    {feedback.correctedSentence && <>
      <p className="writing-correction" lang={language} aria-hidden="true">
        {writingCorrection(draft, feedback.correctedSentence, language).map((part, index) => part.kind === 'unchanged'
          ? <span key={index}>{part.text}</span>
          : <span className="writing-correction-change" key={index}>
            {part.removed && <del>{part.removed}</del>}{part.added && <ins>{part.added}</ins>}
          </span>)}
      </p>
      <span className="writing-result-sr-only">Corrección: <span lang={language}>{feedback.correctedSentence}</span></span>
    </>}
    <p className="writing-result-explanation" lang="es">{feedback.explanation}</p>
  </div>;
}
