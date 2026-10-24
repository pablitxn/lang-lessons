import { isCurrentAttempt, requiredObligations, sameExercise } from '../../contracts';
import type { AttemptRef, EvidenceLedger, EvidenceResult, EvidenceStatus, ExerciseIdentity, LessonMode, LearningLanguage, Obligation } from '../../contracts';

/** Presentation filtering supplements the controller; it does not accept evidence. */
export function currentSpellingResult(attempt: AttemptRef | undefined, result: EvidenceResult | undefined, value: string): EvidenceResult | undefined {
  return attempt && result && attempt.obligation.startsWith('spelling:')
    && isCurrentAttempt(attempt, result.ref)
    && (result.spelling?.submittedText.normalize('NFC') === value.normalize('NFC') || (result.status === 'uncertain' && !result.spelling))
    ? result : undefined;
}

export interface SpellingSegment { text: string; incorrect: boolean; gap: boolean }
/** Indices are controller-supplied grapheme coordinates, never character guesses. */
export function spellingSegments(result: EvidenceResult): readonly SpellingSegment[] {
  if (!result.spelling) return [];
  const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(result.spelling.submittedText), part => part.segment);
  const incorrect = new Set(result.spelling.incorrectGraphemeIndices);
  const missing = new Set(result.spelling.missingGraphemeIndices);
  const segments: SpellingSegment[] = [];
  for (let index = 0; index <= graphemes.length; index++) {
    if (missing.has(index)) segments.push({ text: '▴', incorrect: true, gap: true });
    if (index < graphemes.length) segments.push({ text: graphemes[index]!, incorrect: incorrect.has(index), gap: false });
  }
  return segments;
}

export const STATUS_TEXT: Readonly<Record<EvidenceStatus, string>> = {
  'not-attempted': 'To do', processing: 'Checking', uncertain: 'Needs clarification', incorrect: 'Try again', accepted: 'Done',
};
export const OBLIGATION_TEXT: Readonly<Record<Obligation, string>> = {
  'spelling:infinitive': 'Escritura del infinitivo', 'spelling:present': 'Escritura del presente (je)',
  'pronunciation:infinitive': 'Pronunciación del infinitivo', 'pronunciation:present': 'Pronunciación del presente (je)',
  'sentence:infinitive': 'Oración con infinitivo', 'sentence:present': 'Oración en presente',
  'spelling:base': 'Base spelling', 'spelling:past': 'Past spelling', 'spelling:participle': 'Past participle spelling',
  meaning: 'Spanish meaning', 'pronunciation:base': 'Base pronunciation', 'pronunciation:past': 'Past pronunciation',
  'pronunciation:participle': 'Past participle pronunciation', 'sentence:base': 'Original base sentence',
  'sentence:past': 'Original past sentence', 'sentence:participle': 'Original past participle sentence',
  translation: 'Oral translation', tense: 'Tense identification', structure: 'Structure explanation', 'meaning-fit': 'Meaning and why it fits',
};

export function progressItems(mode: LessonMode, identity: ExerciseIdentity, ledger: EvidenceLedger, language: LearningLanguage = 'en') {
  const spanish: Partial<Record<Obligation, string>> = { meaning: 'Significado en español', 'spelling:participle': 'Escritura del participio', 'pronunciation:participle': 'Pronunciación del participio', 'sentence:participle': 'Oración con participio', translation: 'Traducción oral', tense: 'Identificar el tiempo', structure: 'Explicar la estructura', 'meaning-fit': 'Significado y uso' };
  return requiredObligations(mode, language).map(obligation => {
    const record = ledger[obligation];
    const status = record && record.ref.obligation === obligation && sameExercise(identity, record.ref) ? record.status : 'not-attempted';
    return { obligation, label: language === 'fr' ? spanish[obligation] ?? OBLIGATION_TEXT[obligation] : OBLIGATION_TEXT[obligation], status, feedback: status === 'not-attempted' ? undefined : record?.feedback };
  });
}

export function attemptKey(attempt: AttemptRef | undefined): string {
  return attempt ? JSON.stringify([attempt.sessionId, attempt.exerciseId, attempt.generation, attempt.obligation, attempt.attemptId, attempt.revision]) : '';
}
