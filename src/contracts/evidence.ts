import type { ExerciseIdentity, LessonMode, SentenceStage, VerbForm } from './curriculum';

export type VerbObligation = `spelling:${VerbForm}` | 'meaning'
  | `pronunciation:${VerbForm}` | `sentence:${VerbForm}`;
export type SentenceObligation = 'translation' | 'tense' | 'structure' | 'meaning-fit';
export type Obligation = VerbObligation | SentenceObligation;
export type EvidenceStatus = 'not-attempted' | 'processing' | 'uncertain' | 'incorrect' | 'accepted';
/** No raw audio, credentials or durable transcript storage is part of this contract. */
export type EvidenceSource =
  | { kind: 'typed'; inputId: string }
  | { kind: 'audio'; utteranceId: string; audioAvailable: boolean }
  | { kind: 'mock'; fixtureId: string };
/** Each obligation has its own monotonic revision. Never use one global input revision. */
export interface AttemptRef extends ExerciseIdentity {
  obligation: Obligation;
  attemptId: string;
  revision: number;
}
export interface EvidenceResult {
  ref: AttemptRef;
  status: 'uncertain' | 'incorrect' | 'accepted';
  source: EvidenceSource;
  feedback: string;
  /** Segment submittedText with Intl.Segmenter(granularity: 'grapheme'). */
  spelling?: {
    submittedText: string;
    incorrectGraphemeIndices: readonly number[];
    /** Gaps before grapheme N, or at length for a trailing omission; never expected letters. */
    missingGraphemeIndices: readonly number[];
  };
}
export interface EvidenceRecord {
  ref: AttemptRef;
  status: EvidenceStatus;
  source?: EvidenceSource;
  feedback?: string;
}
export type EvidenceLedger = Readonly<Partial<Record<Obligation, EvidenceRecord>>>;
export interface AssessmentBatch extends ExerciseIdentity {
  eventId: string;
  /** Independently applicable: one stale result must not discard unrelated results. */
  results: readonly EvidenceResult[];
}
export interface InteractionState {
  learnerSpeaking: boolean;
  assistantSpeaking: boolean;
  /** Held until answered/dismissed, even after speech stops. */
  questionPending: boolean;
  processingCount: number;
  inputFocused: boolean;
  compositionActive: boolean;
  questionDraftActive: boolean;
  /** Scoped IDs prevent one helper closing from releasing another helper's hold. */
  presentationHolds: readonly string[];
  connection: 'offline' | 'connecting' | 'ready' | 'reconnecting' | 'error';
  intent: 'practice' | 'pause' | 'stop' | 'change-mode';
  /** Monotonic local clock; updated on every input, speech, result and interruption. */
  lastActivityAt: number;
  /** Increment on activity to invalidate an already scheduled advance callback. */
  activityRevision: number;
}
export interface AdvanceTicket extends ExerciseIdentity {
  activityRevision: number;
  dueAt: number;
}
export interface HintRequest extends ExerciseIdentity {
  requestId: string;
  /** Increment when the attempt or stage changes, cancelling older hints. */
  revision: number;
  level: 1 | 2 | 3;
  target: Obligation;
  stage: SentenceStage | 'verb';
  policy: 'guide-without-answer';
}
export interface HintResult extends HintRequest {
  text: string;
  source: 'model' | 'mock';
}
export interface LearningSnapshot extends ExerciseIdentity {
  mode: LessonMode;
  evidence: EvidenceLedger;
  interaction: InteractionState;
  sentenceStage?: SentenceStage;
}
