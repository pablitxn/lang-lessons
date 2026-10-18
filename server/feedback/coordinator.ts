import type { FeedbackJobRef, FeedbackRepository, ProfessorComment } from '../../src/contracts/feedback';
import type { CallSegmentRef } from '../../src/contracts/session';
import { traceFeedback, type FeedbackTelemetry } from './telemetry';

/** Ephemeral envelope only; Evidence DTO remains undefined; approved Phoenix transcripts are not app rows. */
export interface SessionEvidence<Evidence> {
  readonly sessionId: string;
  readonly segments: readonly CallSegmentRef[];
  readonly value: Evidence;
}

export interface FeedbackPolicy<Evidence> {
  readonly provenanceVersion: string;
  readonly maxCommentCharacters: number;
  /** Must load the approved closed-session snapshot across qualifying segments. */
  evidence(claim: FeedbackJobRef): Promise<
    | { readonly status: 'sufficient'; readonly snapshot: SessionEvidence<Evidence> }
    | { readonly status: 'insufficient-evidence' }
  >;
  /** Semantic gate: grounded in this evidence, short qualitative feedback, no grade.
   * Structural validation alone cannot establish these properties. */
  accepts(text: string, snapshot: SessionEvidence<Evidence>): boolean;
}

export interface FeedbackDependencies<Evidence> {
  readonly repository: FeedbackRepository;
  readonly telemetry?: FeedbackTelemetry;
  readonly policy: FeedbackPolicy<Evidence> | null;
  /** P2 adapter request: same atomic claim fence as complete/fail, distinct terminal state.
   * Null keeps the worker blocked until the adapter is provided. */
  readonly recordInsufficient: ((claim: FeedbackJobRef) => Promise<'recorded' | 'stale'>) | null;
  readonly client: { generate(snapshot: SessionEvidence<Evidence>): Promise<unknown> };
}

export type FeedbackRunResult =
  | { readonly status: 'blocked'; readonly reason: 'policy-unselected' | 'insufficient-state-adapter-missing' }
  | { readonly status: 'not-claimed' }
  | { readonly status: 'stored' | 'failed' | 'insufficient-evidence' | 'stale'; readonly sessionId: string };

function commentText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'text' || !('text' in value) || typeof value.text !== 'string') return null;
  const text = value.text.trim();
  return text.length > 0 && Array.from(text).length <= maximum ? text : null;
}

/** Consume only P2's durable jobs, never call-stop, exit-intent, or browser payloads.
 * P2 must atomically enqueue once after confirmed close with a qualifying call,
 * claim only pending jobs, and fence all terminal writes by session/job/token.
 * No timer, requeue, lease expiry, or automatic retry policy is selected here. */
export function createFeedbackCoordinator<Evidence>(dependencies: FeedbackDependencies<Evidence>) {
  const { repository, policy, recordInsufficient, client } = dependencies;
  const run = async (jobId: string): Promise<FeedbackRunResult> => {
    if (!policy) return { status: 'blocked', reason: 'policy-unselected' };
    if (!recordInsufficient) return { status: 'blocked', reason: 'insufficient-state-adapter-missing' };
    if (!Number.isSafeInteger(policy.maxCommentCharacters) || policy.maxCommentCharacters < 1 || !policy.provenanceVersion.trim()) {
      throw new Error('Invalid feedback policy configuration');
    }
    const claimed = await repository.claim(jobId);
    if (!claimed) return { status: 'not-claimed' };
    // Copy the fence so an adapter cannot mutate it during asynchronous work.
    const claim = Object.freeze({ ...claimed });
    if (claim.jobId !== jobId || !claim.sessionId || !claim.claimToken) {
      throw new Error('Invalid feedback repository claim');
    }
    let outcome: { status: 'failed' | 'insufficient-evidence' } | { status: 'comment'; comment: ProfessorComment };
    try {
      const evidence = await policy.evidence(claim);
      if (evidence.status === 'insufficient-evidence') {
        outcome = { status: 'insufficient-evidence' };
      } else {
        const snapshot = evidence.snapshot;
        if (snapshot.sessionId !== claim.sessionId || snapshot.segments.length === 0 ||
            snapshot.segments.some(segment => segment.sessionId !== claim.sessionId) ||
            new Set(snapshot.segments.map(segment => segment.segmentId)).size !== snapshot.segments.length) {
          throw new Error('Invalid feedback evidence scope');
        }
        const text = commentText(await client.generate(snapshot), policy.maxCommentCharacters);
        if (text === null || !policy.accepts(text, snapshot)) throw new Error('Invalid qualitative comment');
        outcome = { status: 'comment', comment: {
          sessionId: claim.sessionId, text, provenanceVersion: policy.provenanceVersion,
        } };
      }
    } catch {
      // Never log or persist evidence, provider payloads or exception messages.
      outcome = { status: 'failed' };
    }
    // Keep persistence errors outside the inference catch: a lost commit reply
    // must not cause a second mutation, a failure overwrite, or another model call.
    if (outcome.status === 'comment') {
      const status = await repository.complete(claim, outcome.comment);
      return { status, sessionId: claim.sessionId };
    }
    const result = outcome.status === 'insufficient-evidence'
      ? await recordInsufficient(claim) : await repository.fail(claim);
    return { status: result === 'stale' ? 'stale' : outcome.status, sessionId: claim.sessionId };
  };
  return {
    async run(jobId: string): Promise<FeedbackRunResult> {
      let result: FeedbackRunResult;
      try {
        result = await run(jobId);
      } catch (error) {
        await traceFeedback(dependencies.telemetry, { operation: 'session-feedback', jobId, outcome: 'repository-error' });
        throw error;
      }
      await traceFeedback(dependencies.telemetry, {
        operation: 'session-feedback', jobId, outcome: result.status,
        ...('sessionId' in result ? { sessionId: result.sessionId } : {}),
      });
      return result;
    },
  };
}
