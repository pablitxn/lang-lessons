import { VERB_FORMS, FRENCH_VERB_FORMS, type LearningLanguage, type ExerciseIdentity, type LessonMode, type VerbMode } from './curriculum';
import type { AdvanceTicket, AttemptRef, EvidenceLedger, EvidenceResult, InteractionState, Obligation } from './evidence';
import { TIMING } from './settings';

export function sameExercise(a: ExerciseIdentity, b: ExerciseIdentity): boolean {
  return a.sessionId === b.sessionId && a.exerciseId === b.exerciseId && a.generation === b.generation;
}
export function isCurrentAttempt(current: AttemptRef, candidate: AttemptRef): boolean {
  return sameExercise(current, candidate) && current.obligation === candidate.obligation
    && current.attemptId === candidate.attemptId && current.revision === candidate.revision;
}
export function requiredObligations(mode: LessonMode, language: LearningLanguage = 'en'): readonly Obligation[] {
  if (mode === 'sentence') return ['translation', 'tense', 'structure', 'meaning-fit'];
  const forms = language === 'fr' ? FRENCH_VERB_FORMS : VERB_FORMS;
  return [
    ...(mode === 'verb-image' ? forms : forms.slice(1)).map(form => `spelling:${form}` as Obligation),
    'meaning', ...forms.map(form => `pronunciation:${form}` as Obligation),
    ...forms.map(form => `sentence:${form}` as Obligation),
  ];
}
/** Mock acceptances can exercise the UI but must never count as real audio validation. */
export function hasValidEvidenceSource(result: Pick<EvidenceResult, 'source' | 'ref'>, allowMock: boolean): boolean {
  if (result.source.kind === 'mock') return allowMock;
  if (result.ref.obligation.startsWith('spelling:')) return result.source.kind === 'typed';
  return result.source.kind === 'audio' && result.source.audioAvailable;
}
export function hasAllEvidence(mode: LessonMode, identity: ExerciseIdentity, ledger: EvidenceLedger, allowMock = false, language: LearningLanguage = 'en'): boolean {
  return requiredObligations(mode, language).every(key => {
    const record = ledger[key];
    return record?.status === 'accepted' && record.ref.obligation === key && sameExercise(identity, record.ref)
      && record.source !== undefined && hasValidEvidenceSource({ ref: record.ref, source: record.source }, allowMock);
  });
}
export function isQuiet(interaction: InteractionState): boolean {
  return interaction.connection === 'ready' && interaction.intent === 'practice'
    && !interaction.learnerSpeaking && !interaction.assistantSpeaking && !interaction.questionPending
    && !interaction.inputFocused && !interaction.compositionActive && !interaction.questionDraftActive
    && interaction.presentationHolds.length === 0 && interaction.processingCount === 0;
}
/** Sentence mode deliberately has no automatic advance contract. */
export function canAdvanceVerb(
  mode: VerbMode, identity: ExerciseIdentity, ledger: EvidenceLedger,
  interaction: InteractionState, ticket: AdvanceTicket, now: number, allowMock = false, language: LearningLanguage = 'en',
): boolean {
  return sameExercise(identity, ticket) && ticket.activityRevision === interaction.activityRevision
    && hasAllEvidence(mode, identity, ledger, allowMock, language) && isQuiet(interaction)
    && now >= ticket.dueAt && now - interaction.lastActivityAt >= TIMING.verbQuietPeriodMs;
}
