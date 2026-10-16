import type { ExerciseContext, ExerciseIdentity } from './curriculum';
import type { AssessmentBatch, AttemptRef, HintRequest, HintResult } from './evidence';

export type ProviderMode = 'mock' | 'openai-realtime';
export type VoiceState = 'offline' | 'connecting' | 'ready' | 'reconnecting' | 'error';
export interface VoiceConnectOptions {
  sessionId: string;
  /** Abort on unmount, stop, mode change or session replacement. */
  signal: AbortSignal;
}
export interface LearnerInput extends ExerciseIdentity {
  inputId: string;
  kind: 'typed' | 'utterance';
  text: string;
  attempts: readonly AttemptRef[];
  /** Only real audio transport may supply this reference; text is not pronunciation. */
  utteranceId?: string;
}
interface VoiceEventBase { eventId: string; sessionId: string }
export type VoiceEvent = VoiceEventBase & (
  | { type: 'state'; state: VoiceState }
  | { type: 'microphone'; muted: boolean }
  | { type: 'speech'; speaker: 'learner' | 'assistant'; active: boolean }
  | { type: 'intent'; intent: 'question' | 'question-resolved' | 'pause' | 'stop' | 'change-mode' }
  | { type: 'transcript'; identity: ExerciseIdentity; utteranceId: string; text: string; final: boolean; uncertain: boolean }
  | { type: 'assessment'; batch: AssessmentBatch }
  | { type: 'hint'; hint: HintResult }
  | { type: 'feedback'; identity: ExerciseIdentity; text: string }
  | { type: 'error'; code: 'permission' | 'connection' | 'configuration' | 'provider' | 'invalid-event'; retryable: boolean; message: string }
  | { type: 'usage'; elapsedMs: number; inputTokens?: number; outputTokens?: number }
);
/** Provider messages are untrusted input. Validate JSON before emitting these events. */
export interface VoiceAdapter {
  readonly mode: ProviderMode;
  connect(options: VoiceConnectOptions): Promise<void>;
  setContext(context: ExerciseContext): void;
  submit(input: LearnerInput): Promise<void>;
  requestHint(request: HintRequest): Promise<void>;
  interrupt(): void;
  setMuted(muted: boolean): void;
  /** Idempotent; stop tracks, output audio, timers, fetches and data channels. */
  disconnect(): void;
  subscribe(listener: (event: VoiceEvent) => void): () => void;
}
/** A server exchanges SDP for the browser. Permanent API keys never enter client JS. */
export interface RealtimeSessionRequest { sdp: string }
export interface RealtimeSessionResponse { sdp: string; maxDurationSeconds: number }
