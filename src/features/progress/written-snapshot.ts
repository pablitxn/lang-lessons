import type { ExerciseIdentity, PracticeEvent, Tense, VerbForm, VerbMode } from '../../contracts';
export interface SentenceWrittenSnapshot {
  schemaVersion: 1; kind: 'sentence'; userId: string; identity: ExerciseIdentity; sentenceId: string;
  draft: string; finalized: boolean; selectedTense: Tense | null; events: readonly PracticeEvent[];
}
export interface VerbWrittenSnapshot {
  schemaVersion: 1; kind: VerbMode; userId: string; identity: ExerciseIdentity; verbId: string; photoSrc: string;
  drafts: Record<VerbForm, string>;
  records: readonly { form: VerbForm; revision: number; attemptId: string; finalized: boolean }[];
}
export type WrittenPracticeSnapshot = SentenceWrittenSnapshot | VerbWrittenSnapshot;
export interface WrittenPracticePort {
  snapshotWrittenPractice(): WrittenPracticeSnapshot | null;
  restoreWrittenPractice(snapshot: unknown): boolean;
}
export interface WrittenPracticeBinding {
  userId: string;
  initialSnapshot?: unknown;
  register(port: WrittenPracticePort): () => void;
  onRestoreRejected?(): void;
  onSnapshot?(snapshot: WrittenPracticeSnapshot): void;
}
export const snapshotObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const snapshotId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
export function snapshotIdentity(value: unknown, sessionId: string): value is ExerciseIdentity {
  return snapshotObject(value) && Object.keys(value).length === 3 && value.sessionId === sessionId && snapshotId(value.exerciseId)
    && Number.isSafeInteger(value.generation) && (value.generation as number) >= 1;
}
