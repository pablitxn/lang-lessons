import type { FeedbackJobRef } from '../../src/contracts/feedback';
import type { CallSegmentRef } from '../../src/contracts/session';
import type { FeedbackPolicy, SessionEvidence } from './coordinator';

export type FeedbackActivity = 'written-form' | 'written-translation' | 'tense-identification' | 'oral-meaning' | 'oral-sentence';
export type FeedbackOutcome = 'accepted' | 'incorrect' | 'uncertain';
/** Ephemeral projection, not a migration or Phoenix transcript DTO. */
export interface FeedbackObservation {
  readonly observationId: string;
  readonly sessionId: string;
  /** Null only for session-scoped written activity; never infer call attribution. */
  readonly segmentId: string | null;
  readonly activity: FeedbackActivity;
  readonly outcome: FeedbackOutcome;
}
export interface ClosedFeedbackEvidence {
  readonly claim: FeedbackJobRef;
  readonly session: { readonly sessionId: string; readonly status: 'closed'; readonly revision: number };
  readonly closedRevision: number;
  /** Qualification must come from canonical verified connection evidence, never browser ready or SDP creation. */
  readonly segments: readonly (CallSegmentRef & { readonly qualified: true })[];
  readonly observations: readonly FeedbackObservation[];
}
export interface QualitativeEvidence {
  readonly observations: readonly FeedbackObservation[];
  readonly allowedComments: readonly string[];
}
export interface FeedbackEvidenceReader {
  /** Atomically read the current claim, canonical close revision and its evidence.
   * Missing/stale/unavailable evidence returns null. No raw traces or audio. */
  read(claim: FeedbackJobRef): Promise<unknown>;
}
const labels: Record<FeedbackActivity, string> = {
  'written-form': 'written verb forms', 'written-translation': 'written translations',
  'tense-identification': 'tense identification', 'oral-meaning': 'spoken meanings',
  'oral-sentence': 'spoken sentences',
};
const outcomes = new Set<FeedbackOutcome>(['accepted', 'incorrect', 'uncertain']);
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
function id(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function revision(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }

/** Copy an allowlisted structural projection; reject extra fields such as transcript/audio. */
function project(raw: unknown, claim: FeedbackJobRef): ClosedFeedbackEvidence | null {
  if (!object(raw) || !keys(raw, ['claim', 'session', 'closedRevision', 'segments', 'observations'])) return null;
  if (!object(raw.claim) || !keys(raw.claim, ['sessionId', 'jobId', 'claimToken']) ||
      raw.claim.sessionId !== claim.sessionId || raw.claim.jobId !== claim.jobId || raw.claim.claimToken !== claim.claimToken) return null;
  if (!object(raw.session) || !keys(raw.session, ['sessionId', 'status', 'revision']) ||
      raw.session.sessionId !== claim.sessionId || raw.session.status !== 'closed' || !revision(raw.session.revision) ||
      raw.closedRevision !== raw.session.revision) return null;
  if (!Array.isArray(raw.segments) || !raw.segments.length || !Array.isArray(raw.observations) || !raw.observations.length) return null;
  const segments: (CallSegmentRef & { qualified: true })[] = [];
  const segmentIds = new Set<string>();
  for (const segment of raw.segments) {
    if (!object(segment) || !keys(segment, ['sessionId', 'segmentId', 'connectionEpoch', 'qualified']) ||
        segment.sessionId !== claim.sessionId || !id(segment.segmentId) || segmentIds.has(segment.segmentId) ||
        !revision(segment.connectionEpoch) || segment.qualified !== true) return null;
    segmentIds.add(segment.segmentId);
    segments.push({ sessionId: claim.sessionId, segmentId: segment.segmentId, connectionEpoch: segment.connectionEpoch, qualified: true });
  }
  const observations: FeedbackObservation[] = [];
  const observationIds = new Set<string>();
  for (const observation of raw.observations) {
    if (!object(observation) || !keys(observation, ['observationId', 'sessionId', 'segmentId', 'activity', 'outcome']) ||
        !id(observation.observationId) || observationIds.has(observation.observationId) || observation.sessionId !== claim.sessionId ||
        typeof observation.activity !== 'string' || !Object.hasOwn(labels, observation.activity) ||
        typeof observation.outcome !== 'string' || !outcomes.has(observation.outcome as FeedbackOutcome)) return null;
    const written = observation.activity === 'written-form' || observation.activity === 'written-translation' || observation.activity === 'tense-identification';
    if (observation.segmentId === null) {
      if (!written) return null;
    } else if (!id(observation.segmentId) || !segmentIds.has(observation.segmentId)) return null;
    observationIds.add(observation.observationId);
    observations.push({ observationId: observation.observationId, sessionId: claim.sessionId,
      segmentId: observation.segmentId, activity: observation.activity as FeedbackActivity, outcome: observation.outcome as FeedbackOutcome });
  }
  return { claim: { ...claim }, session: { sessionId: claim.sessionId, status: 'closed', revision: raw.session.revision },
    closedRevision: raw.session.revision, segments, observations };
}

/** Controlled language intentionally avoids unverifiable free-text semantic checks.
 * Accepted outcomes describe recorded responses, never objective acoustic quality. */
function comments(observations: readonly FeedbackObservation[], maximum: number): string[] {
  const suggestions = new Set<string>();
  for (const { activity, outcome } of observations) {
    const label = labels[activity];
    const text = outcome === 'accepted' ? `Your practice in ${label} includes accepted responses. Keep building on this work.`
      : outcome === 'incorrect' ? `Some responses in your ${label} practice needed correction. Review this area in your next practice.`
      : `Some responses in your ${label} practice remain uncertain. Revisit this area with your tutor.`;
    if (Array.from(text).length <= maximum) suggestions.add(text);
  }
  return [...suggestions];
}

export function createFeedbackPolicy(reader: FeedbackEvidenceReader, options: { maxCommentCharacters?: number } = {}): FeedbackPolicy<QualitativeEvidence> {
  // Reversible technical output bound, not a retention duration or a learner grade.
  const maximum = options.maxCommentCharacters ?? 240;
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error('Invalid comment length bound');
  return {
    provenanceVersion: 'structured-session-feedback-v1', maxCommentCharacters: maximum,
    async evidence(claim) {
      const evidence = project(await reader.read(claim), claim);
      if (!evidence) return { status: 'insufficient-evidence' };
      const allowedComments = comments(evidence.observations, maximum);
      if (!allowedComments.length) return { status: 'insufficient-evidence' };
      // Freeze owned copies; the model cannot rewrite the grounding or reference set.
      const snapshot: SessionEvidence<QualitativeEvidence> = Object.freeze({
        sessionId: claim.sessionId,
        segments: Object.freeze(evidence.segments.map(({ sessionId, segmentId, connectionEpoch }) => Object.freeze({ sessionId, segmentId, connectionEpoch }))),
        value: Object.freeze({ observations: Object.freeze(evidence.observations.map(item => Object.freeze(item))), allowedComments: Object.freeze(allowedComments) }),
      });
      return { status: 'sufficient', snapshot };
    },
    accepts(text, snapshot) {
      return Array.from(text).length <= maximum && comments(snapshot.value.observations, maximum).includes(text);
    },
  };
}
