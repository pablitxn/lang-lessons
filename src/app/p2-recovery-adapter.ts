import type { CallSegmentRef, FeedbackState, ProgressFence, SessionSnapshot } from '../contracts';
import type { RecoveryIdentity, RecoveryRecord } from './session-recovery';

/** Mirrors P2 PR17 cc7e6c1 producer DTOs until the integrator promotes shared interfaces. */
export interface P2RecoverySnapshot {
  readonly session: SessionSnapshot;
  readonly progress: ProgressFence;
  readonly activeSegments: readonly CallSegmentRef[];
  readonly feedback: { jobId: string; state: FeedbackState; retryRevision: number } | null;
}
export interface P2RetryFeedbackRequest {
  sessionId: string; jobId: string; operationId: string; expectedRetryRevision: number;
}
export interface P2RetryFeedbackResult { sessionId: string; jobId: string; state: 'pending'; retryRevision: number }
export interface P2RecoveryClient {
  read(sessionId: string, signal: AbortSignal): Promise<P2RecoverySnapshot>;
  retryFailedFeedback(request: P2RetryFeedbackRequest, signal: AbortSignal): Promise<P2RetryFeedbackResult>;
}

/** Root binds this client to authenticated P2 transport; no URLs or credentials are selected here. */
export function createP2RecoveryAdapter(ports: {
  identity: RecoveryIdentity;
  isCurrent(): boolean;
  client: P2RecoveryClient;
  /** Required: P2's activeSegments alone cannot prove that an earlier call never connected. */
  readCallHistory(sessionId: string, signal: AbortSignal): Promise<boolean | null>;
}) {
  const identity = { ...ports.identity };
  let saved: RecoveryRecord | null = null;
  let prepared: P2RetryFeedbackRequest | null = null;
  let disposed = false;
  const signals = new Set<AbortSignal>();
  function dispose() {
    disposed = true; saved = null; prepared = null;
    for (const signal of signals) signal.removeEventListener('abort', dispose);
    signals.clear();
  }
  function guard(request: RecoveryIdentity, signal: AbortSignal) {
    if (signal.aborted || !ports.isCurrent()) dispose();
    if (disposed || request.accountId !== identity.accountId || request.sessionId !== identity.sessionId) throw new Error('Recovery account/session is no longer current.');
    if (!signals.has(signal)) { signals.add(signal); signal.addEventListener('abort', dispose, { once: true }); }
  }
  function decode(snapshot: P2RecoverySnapshot, hadConnectedCall: boolean | null): RecoveryRecord {
    if (snapshot.session.sessionId !== identity.sessionId || snapshot.progress.sessionId !== identity.sessionId
      || snapshot.activeSegments.some(segment => segment.sessionId !== identity.sessionId)
      || (hadConnectedCall !== null && typeof hadConnectedCall !== 'boolean')) throw new Error('Recovery response scope mismatch.');
    return { ...identity, session: { ...snapshot.session }, hadConnectedCall,
      progress: { ...snapshot.progress }, activeSegments: snapshot.activeSegments.map(segment => ({ ...segment })),
      feedback: snapshot.feedback?.state ?? 'not-requested', feedbackJob: snapshot.feedback ? { ...snapshot.feedback } : null };
  }
  return {
    async read(request: RecoveryIdentity, signal: AbortSignal): Promise<RecoveryRecord> {
      guard(request, signal);
      const snapshot = await ports.client.read(identity.sessionId, signal);
      guard(request, signal);
      const history = await ports.readCallHistory(identity.sessionId, signal);
      guard(request, signal);
      saved = decode(snapshot, history);
      return saved;
    },
    async retryFeedback(request: RecoveryIdentity & { operationId: string }, signal: AbortSignal): Promise<RecoveryRecord> {
      guard(request, signal);
      if (!prepared || prepared.operationId !== request.operationId) {
        const job = saved?.feedbackJob;
        if (!saved || saved.session.status !== 'closed' || !saved.hadConnectedCall || !job || job.state !== 'failed') {
          throw new Error('Read the failed feedback job before retrying.');
        }
        prepared = { sessionId: identity.sessionId, jobId: job.jobId, operationId: request.operationId, expectedRetryRevision: job.retryRevision };
      }
      const payload = prepared;
      // Copy the exact four P2 fields; account ID is a local guard, never request authority.
      const result = await ports.client.retryFailedFeedback({ ...payload }, signal);
      guard(request, signal);
      if (!saved || result.sessionId !== payload.sessionId || result.jobId !== payload.jobId
        || result.state !== 'pending' || result.retryRevision !== payload.expectedRetryRevision + 1) throw new Error('Feedback retry response mismatch.');
      saved = { ...saved, feedback: 'pending', feedbackJob: { jobId: result.jobId, state: result.state, retryRevision: result.retryRevision } };
      return saved;
    },
    dispose,
  };
}
