import type { PracticeEvent } from './progress';
import type { LessonMode } from './curriculum';
import type { FeedbackState, ProfessorComment } from './feedback';

export interface ResultPage<T> { readonly items: readonly T[]; readonly nextCursor: string | null }
export interface DailyResult { readonly event: PracticeEvent; readonly receivedAt: string; readonly committedRevision: number }
export interface DailySession {
  readonly sessionId: string; readonly mode: LessonMode; readonly startedAt: string | null; readonly closedAt: string | null;
  readonly feedback: FeedbackState | null; readonly comment: ProfessorComment | null;
}
export interface DailyProgressPage {
  readonly studentId: string; readonly day: string; readonly timeZone: string; readonly eventAttribution: 'server-received';
  readonly writtenEvents: ResultPage<DailyResult>; readonly sessions: ResultPage<DailySession>;
  readonly totals: null;
  readonly usageTime: { readonly writtenMs: number; readonly tutorConnectedMs: number; readonly totalMs: number;
    readonly writtenTrust: 'client-reported-interaction'; readonly tutorTrust: 'server-observed-connection' };
  readonly hasUnattributedLegacyRecords: boolean;
}
export interface DailyPageRequest { readonly day: string; readonly eventCursor?: string | null; readonly sessionCursor?: string | null }
