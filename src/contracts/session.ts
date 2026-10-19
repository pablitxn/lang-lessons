import type { LessonMode } from './curriculum';
import type { ProgressFence } from './progress';
import type { FeedbackState } from './feedback';

export interface CallSegmentRef { readonly sessionId: string; readonly segmentId: string; readonly connectionEpoch: number }
export interface SessionSnapshot { readonly sessionId: string; readonly mode: LessonMode; readonly status: 'open' | 'closed'; readonly revision: number }
/** Written practice is restored independently from any outstanding tutor transport. */
export interface ActivePractice { readonly session: SessionSnapshot; readonly callState: 'none' | 'active' | 'uncertain' }
export interface SessionMutation { readonly sessionId: string; readonly operationId: string; readonly expectedRevision: number }
export interface ConfirmCloseRequest extends SessionMutation { readonly finalProgress: ProgressFence }
export interface CloseResult { readonly sessionId: string; readonly operationId: string; readonly status: 'closed'; readonly revision: number; readonly feedback: FeedbackState }
export interface SessionCommands {
  create(input: { mode: LessonMode; operationId: string }): Promise<SessionSnapshot>;
  read(sessionId: string): Promise<SessionSnapshot>;
  startCall(input: SessionMutation): Promise<{ session: SessionSnapshot; segment: CallSegmentRef }>;
  stopCall(input: SessionMutation & { segment: CallSegmentRef }): Promise<SessionSnapshot>;
  confirmClose(input: ConfirmCloseRequest): Promise<CloseResult>;
  readClose(sessionId: string): Promise<CloseResult | null>;
}
/** P4 decides whether confirmation is required; root never invents a qualifying-call rule. */
export interface ExitPreparation {
  readonly sessionId: string;
  requestExit(): Promise<'cancel' | 'confirm'>;
  /** Stop accepting new practice writes before flushing. Must be idempotent. */
  freezeWrites(): void;
  /** Called only if preparation fails before dispatching close. */
  releasePreparation(): void;
}
