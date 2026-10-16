import type { ExerciseIdentity, LessonMode, VerbMode } from './curriculum';
import type { AdvanceTicket, AttemptRef, EvidenceLedger, EvidenceResult, InteractionState, Obligation } from './evidence';
import { TIMING } from './settings';

export function sameExercise(a: ExerciseIdentity, b: ExerciseIdentity): boolean {
  return a.sessionId === b.sessionId && a.exerciseId === b.exerciseId && a.generation === b.generation;
}
export function isCurrentAttempt(current: AttemptRef, candidate: AttemptRef): boolean {
  return sameExercise(current, candidate) && current.obligation === candidate.obligation
    && current.attemptId === candidate.attemptId && current.revision === candidate.revision;
}
export function requiredObligations(mode: LessonMode): readonly Obligation[] {
  if (mode === 'sentence') return ['translation', 'tense', 'structure', 'meaning-fit'];
  return [
    ...(mode === 'verb-image' ? ['spelling:base' as const] : []),
    'spelling:past', 'spelling:participle', 'meaning',
    'pronunciation:base', 'pronunciation:past', 'pronunciation:participle',
    'sentence:base', 'sentence:past', 'sentence:participle',
  ];
}
/** Mock acceptances can exercise the UI but must never count as real audio validation. */
export function hasValidEvidenceSource(result: Pick<EvidenceResult, 'source' | 'ref'>, allowMock: boolean): boolean {
  if (result.source.kind === 'mock') return allowMock;
  if (result.ref.obligation.startsWith('spelling:')) return result.source.kind === 'typed';
  return result.source.kind === 'audio' && result.source.audioAvailable;
}
export function hasAllEvidence(mode: LessonMode, identity: ExerciseIdentity, ledger: EvidenceLedger, allowMock = false): boolean {
  return requiredObligations(mode).every(key => {
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
  interaction: InteractionState, ticket: AdvanceTicket, now: number, allowMock = false,
): boolean {
  return sameExercise(identity, ticket) && ticket.activityRevision === interaction.activityRevision
    && hasAllEvidence(mode, identity, ledger, allowMock) && isQuiet(interaction)
    && now >= ticket.dueAt && now - interaction.lastActivityAt >= TIMING.verbQuietPeriodMs;
}
