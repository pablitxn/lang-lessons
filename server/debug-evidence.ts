import { createHash } from 'node:crypto';
import { ROOT_CONTEXT, type Context, type Tracer } from '@opentelemetry/api';
import type { CallSegmentRef } from '../src/contracts/session';

/** Separate Phoenix channel. Never insert these values into application progress/comment tables. */
export interface DebugEvidence {
  readonly eventId: string;
  readonly kind: 'transcript' | 'interaction';
  readonly speaker: 'learner' | 'tutor';
  readonly text: string;
}
export interface DebugEvidencePolicy {
  readonly version: string;
  readonly maxTextCharacters: number;
  /** Explicitly selected trace routing; this does not grant professor access. */
  readonly route: 'phoenix';
  /** Explicit server policy; not accepted from browser input. */
  readonly evidence: 'synthetic-only' | 'authorized-transcripts';
}
export interface DebugEvidenceSink {
  record(input: { event: DebugEvidence; segment: CallSegmentRef; policyVersion: string; synthetic: boolean; source?: 'browser-reported' | 'provider-observed' }): Promise<void>;
}
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_:.-]{1,256}$/.test(value);
export function redactDebugText(text: string) {
  return text
    // Quoted JSON/config fields may contain spaces, escaped quotes and separators.
    .replace(/(["']?(?:api[_ -]?key|password|secret|authorization|cookie)["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/giu, '$1"[REDACTED]"')
    // Authorization values contain a scheme and can have multiple parameters.
    .replace(/(\bauthorization\s*[:=]\s*)[^\r\n}\]]+/giu, '$1[REDACTED]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/giu, '[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[REDACTED]')
    .replace(/\b(api[_ -]?key|password|secret|cookie)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]');
}
/** Server binds the canonical segment; input may never override session, epoch, routing or trust.
 * Default callers remain synthetic-only; approved provider capture requires explicit server policy. */
export function createDebugEvidenceRecorder(policy: DebugEvidencePolicy | null, sink: DebugEvidenceSink) {
  const accepted = new Map<string, string>();
  const pending = new Map<string, { fingerprint: string; work: Promise<'recorded'> }>();
  return {
    async record(segment: CallSegmentRef, value: unknown, synthetic: boolean, source: 'browser-reported' | 'provider-observed' = 'browser-reported'): Promise<'blocked' | 'invalid' | 'duplicate' | 'conflict' | 'recorded'> {
      if (!policy || !synthetic && (policy.evidence !== 'authorized-transcripts' || source !== 'provider-observed')) return 'blocked';
      if (policy.route !== 'phoenix' || !['synthetic-only', 'authorized-transcripts'].includes(policy.evidence) || !validId(policy.version)
        || !Number.isSafeInteger(policy.maxTextCharacters) || policy.maxTextCharacters < 1 || policy.maxTextCharacters > 16000) return 'invalid';
      if (!validId(segment.sessionId) || !validId(segment.segmentId) || !Number.isSafeInteger(segment.connectionEpoch) || segment.connectionEpoch < 1) return 'invalid';
      if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid';
      const event = value as Record<string, unknown>;
      if (Object.keys(event).length !== 4 || !['eventId', 'kind', 'speaker', 'text'].every(key => Object.hasOwn(event, key))
        || !validId(event.eventId) || !['transcript', 'interaction'].includes(String(event.kind))
        || !['learner', 'tutor'].includes(String(event.speaker)) || typeof event.text !== 'string'
        || !event.text.length || event.text.length > policy.maxTextCharacters || /data:audio\/|^[A-Za-z0-9+/]{512,}={0,2}$/u.test(event.text)) return 'invalid';
      const redacted: DebugEvidence = { eventId: event.eventId, kind: event.kind as DebugEvidence['kind'], speaker: event.speaker as DebugEvidence['speaker'], text: redactDebugText(event.text) };
      const key = JSON.stringify([segment.sessionId, segment.segmentId, segment.connectionEpoch, redacted.eventId]);
      const fingerprint = createHash('sha256').update(JSON.stringify(redacted)).digest('hex');
      const prior = accepted.get(key); if (prior) return prior === fingerprint ? 'duplicate' : 'conflict';
      const inFlight = pending.get(key);
      if (inFlight) { if (inFlight.fingerprint !== fingerprint) return 'conflict'; await inFlight.work; return 'duplicate'; }
      // Bound retained IDs and reject overflow rather than evicting replay protection.
      if (accepted.size + pending.size >= 2048) return 'blocked';
      const work = Promise.resolve().then(async () => {
        await sink.record({ event: redacted, segment: { ...segment }, policyVersion: policy.version, synthetic, source });
        accepted.set(key, fingerprint); return 'recorded' as const;
      }).finally(() => { pending.delete(key); });
      pending.set(key, { fingerprint, work }); return work;
    },
  };
}

/** Inject the already configured Phoenix tracer/context; never create a collector or credentials here. */
export function createPhoenixDebugSink(tracer: Tracer, parentForSession: (sessionId: string) => Context = () => ROOT_CONTEXT): DebugEvidenceSink {
  return { async record({ event, segment, policyVersion, synthetic, source }) {
    const span = tracer.startSpan(`learning.debug.${event.kind}`, { attributes: {
      'openinference.span.kind': 'CHAIN', 'app.exercise_session.id': segment.sessionId,
      'app.call_segment.id': segment.segmentId, 'app.connection.epoch': segment.connectionEpoch,
      'app.debug.event_id': event.eventId, 'app.debug.policy_version': policyVersion,
      'app.debug.speaker': event.speaker, 'app.evidence.source': source ?? 'browser-reported',
      'app.telemetry.synthetic': synthetic, 'app.telemetry.content_capture': true,
      'app.telemetry.audio_capture': false,
      [event.speaker === 'learner' ? 'input.value' : 'output.value']: event.text,
    } }, parentForSession(segment.sessionId));
    span.end();
  } };
}
