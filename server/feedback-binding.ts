import type { Pool } from 'pg';
import { transaction } from './data/database';
import { createFeedbackRepository } from './data/feedback-repository';
import { createFeedbackService, type FeedbackGenerationClient } from './feedback/service';
import type { FeedbackEvidenceReader } from './feedback/policy';
import type { FeedbackTelemetry } from './feedback/telemetry';
import { parsePracticeEvent } from '../src/foundation/progress-batch';

/** Internal worker reader. No browser evidence or Phoenix transcripts are accepted here. */
export function createCanonicalFeedbackReader(pool: Pool): FeedbackEvidenceReader {
  return { read: claim => transaction(pool, async client => {
    const session = await client.query<{ revision: number; closed: unknown }>(`SELECT s.revision,c.result AS closed
      FROM learning_sessions s JOIN learning_closes c ON c.session_id=s.id
      JOIN learning_feedback_jobs j ON j.session_id=s.id
      WHERE s.id=$1 AND s.status='closed' AND j.id=$2 AND j.state='running' AND j.claim_token=$3
      FOR SHARE OF s,j`, [claim.sessionId, claim.jobId, claim.claimToken]);
    const row = session.rows[0]; if (!row) return null;
    const closed = row.closed as { sessionId?: unknown; revision?: unknown; status?: unknown };
    if (closed.sessionId !== claim.sessionId || closed.status !== 'closed' || closed.revision !== row.revision) return null;
    const segments = await client.query<{ id: string; epoch: number }>(`SELECT s.id,s.epoch FROM learning_segments s WHERE s.session_id=$1 AND (
      EXISTS (SELECT 1 FROM learning_call_observations o WHERE o.session_id=s.session_id AND o.segment_id=s.id AND o.epoch=s.epoch AND o.kind='connected')
      OR EXISTS (SELECT 1 FROM learning_time_streams t JOIN learning_time_intervals i ON i.stream_id=t.id
        WHERE t.session_id=s.session_id AND t.segment_id=s.id AND t.source='tutor' AND i.source='tutor' AND i.session_id=s.session_id)) ORDER BY s.epoch`, [claim.sessionId]);
    if (!segments.rowCount) return null;
    // Latest state per obligation honors explicit invalidation, not just accepted history.
    const events = await client.query<{ event_payload: unknown }>(`SELECT DISTINCT ON (exercise_id,generation,event_payload->'ref'->>'obligation') event_payload
      FROM learning_events WHERE session_id=$1 AND event_payload IS NOT NULL
      ORDER BY exercise_id,generation,event_payload->'ref'->>'obligation',committed_revision DESC`, [claim.sessionId]);
    const observations = events.rows.flatMap(({ event_payload }) => {
      const event = parsePracticeEvent(event_payload);
      if (!event || event.ref.sessionId !== claim.sessionId || event.kind !== 'attempt-result' || event.source !== 'typed') return [];
      const obligation = event.ref.obligation;
      const activity = obligation.startsWith('spelling:') ? 'written-form'
        : obligation === 'written:translation' ? 'written-translation' : obligation === 'written:tense' ? 'tense-identification' : null;
      // No inferred call attribution: these are whole-session written outcomes.
      return activity ? [{ observationId: event.eventId, sessionId: claim.sessionId, segmentId: null, activity, outcome: event.result }] : [];
    });
    return { claim: { ...claim }, session: { sessionId: claim.sessionId, status: 'closed', revision: row.revision }, closedRevision: row.revision,
      segments: segments.rows.map(segment => ({ sessionId: claim.sessionId, segmentId: segment.id, connectionEpoch: segment.epoch, qualified: true })), observations };
  }) };
}

export function createCanonicalFeedbackService(pool: Pool, options: { client?: FeedbackGenerationClient; telemetry?: FeedbackTelemetry } = {}) {
  const repository = createFeedbackRepository(pool, { acceptComment: comment => comment.provenanceVersion === 'structured-session-feedback-v1'
    && Array.from(comment.text).length > 0 && Array.from(comment.text).length <= 240 });
  return createFeedbackService({ repository, reader: createCanonicalFeedbackReader(pool),
    // Controlled-language selection is deterministic and makes no paid request.
    // P6 still independently validates the chosen wording against the observations.
    client: options.client ?? { generate: async snapshot => ({ text: snapshot.value.allowedComments[0] }) },
    ...(options.telemetry ? { telemetry: options.telemetry } : {}) });
}
