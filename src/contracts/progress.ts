import type { AttemptRef } from './evidence';

/** Independent local written checks; these identifiers never enter the oral evidence ledger. */
export interface WrittenPracticeRef extends Omit<AttemptRef, 'obligation'> {
  readonly obligation: 'written:translation' | 'written:tense';
}

/** Source is claimed by the client, never independently verified acoustic evidence. */
export type PracticeEvent = {
  readonly schemaVersion: 1; readonly eventId: string; readonly ref: AttemptRef | WrittenPracticeRef;
  readonly source: 'typed' | 'audio' | 'mock'; readonly trust: 'client-reported';
} & ({ readonly kind: 'attempt-result'; readonly result: 'accepted' | 'incorrect' | 'uncertain' }
  | { readonly kind: 'attempt-invalidated' });
export interface ProgressFence { readonly sessionId: string; readonly journalRevision: number }
export type PracticeEventAck = { readonly eventId: string; readonly status: 'accepted' | 'duplicate'; readonly committedRevision: number };
export type ProgressBatchResult =
  | { readonly status: 'committed'; readonly acknowledgments: readonly PracticeEventAck[]; readonly current: ProgressFence }
  | { readonly status: 'rejected'; readonly reason: 'invalid-batch' | 'conflicting-replay' | 'stale-attempt'; readonly current: ProgressFence };
/** Rejected transactions have no accepted-event acknowledgments. Q11 totals are absent. */
export interface ProgressSink {
  submit(events: readonly PracticeEvent[]): Promise<ProgressBatchResult>;
  /** Resolve only after all queued events are committed/duplicate; reject on any rejected event. */
  flush(): Promise<ProgressFence>;
}

/** Supplied by an approved day-boundary policy, never inferred from the browser or UTC. */
export interface PracticeDayBoundary {
  readonly localDate: string;
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
}
export interface DailyPracticeProjection {
  readonly studentId: string;
  readonly day: PracticeDayBoundary;
  /** Preserved attempt/results across visits; no totals formula or elapsed time is implied. */
  readonly writtenEvents: readonly (PracticeEvent & { source: 'typed'; ref: WrittenPracticeRef | (AttemptRef & { obligation: 'spelling:base' | 'spelling:past' | 'spelling:participle' }) })[];
  readonly sessions: readonly {
    sessionId: string; startedAt: string; endedAt: string | null;
    feedback: import('./feedback').FeedbackState;
    comment: import('./feedback').ProfessorComment | null;
  }[];
}
export type DailyPracticePage =
  | { readonly status: 'boundary-unselected' }
  | { readonly status: 'available'; readonly items: readonly DailyPracticeProjection[]; readonly nextCursor: string | null };
