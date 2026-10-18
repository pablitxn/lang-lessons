import type { AttemptRef } from './evidence';

/** Source is claimed by the client, never independently verified acoustic evidence. */
export type PracticeEvent = {
  readonly schemaVersion: 1; readonly eventId: string; readonly ref: AttemptRef;
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
