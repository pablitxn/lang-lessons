import type { FeedbackJobRef, FeedbackRepository } from '../../src/contracts/feedback';
import { createFeedbackCoordinator, type SessionEvidence } from './coordinator';
import { createFeedbackPolicy, type FeedbackEvidenceReader, type QualitativeEvidence } from './policy';
import type { FeedbackTelemetry } from './telemetry';

export interface FeedbackGenerationClient {
  generate(snapshot: SessionEvidence<QualitativeEvidence>): Promise<unknown>;
}
/** The generation implementation is injected; no SDK, credentials or network default.
 * The whole session's qualifying segments and structural observations are supplied.
 * Output must select one grounded qualitative comment, never a grade/pronunciation verdict. */
export function createFeedbackGenerationClient(generate: (request: {
  readonly instruction: string;
  readonly snapshot: SessionEvidence<QualitativeEvidence>;
}) => Promise<unknown>): FeedbackGenerationClient {
  return { generate: snapshot => generate({
    instruction: 'Return only {"text": one exact allowedComments entry}. Select the most useful short comment grounded in the supplied session observations across segments. Do not add a grade, pronunciation claim, transcript or other fields.',
    snapshot,
  }) };
}

export interface FeedbackServiceDependencies {
  readonly repository: FeedbackRepository & { recordInsufficient(claim: FeedbackJobRef): Promise<'recorded' | 'stale'> };
  readonly reader: FeedbackEvidenceReader;
  readonly client: FeedbackGenerationClient;
  readonly telemetry?: FeedbackTelemetry;
  readonly maxCommentCharacters?: number;
}
/** Internal root entry, never a public browser command or a retry scheduler.
 * Root authenticates/authorizes and resolves the canonical job after durable close,
 * or after P2 atomically requeues a failed job on an explicit manual retry.
 * The repository claim and evidence reader recheck canonical eligibility/fences. */
export function createFeedbackService(dependencies: FeedbackServiceDependencies) {
  const policy = createFeedbackPolicy(dependencies.reader,
    dependencies.maxCommentCharacters === undefined ? {} : { maxCommentCharacters: dependencies.maxCommentCharacters });
  const coordinator = createFeedbackCoordinator({
    repository: dependencies.repository, policy, client: dependencies.client,
    recordInsufficient: claim => dependencies.repository.recordInsufficient(claim),
    ...(dependencies.telemetry ? { telemetry: dependencies.telemetry } : {}),
  });
  return {
    afterConfirmedClose: (jobId: string) => coordinator.run(jobId),
    afterManualRetry: (jobId: string) => coordinator.run(jobId),
  };
}
