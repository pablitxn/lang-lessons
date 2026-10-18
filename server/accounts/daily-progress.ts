import type { Pool } from 'pg';
import type { PracticeEvent } from '../../src/contracts/progress';
import type { FeedbackState, ProfessorComment } from '../../src/contracts/feedback';
import type { LessonMode } from '../../src/contracts/curriculum';
import { parsePracticeEvent } from '../../src/foundation/progress-batch';
import { authorize } from './authorization';
import type { AuthenticatedIdentity } from './authorization';
import { approvedAccountAccess } from './approved-policy';
import type { DisclosurePolicy, Page } from './repository';
import { readUsageForWindow } from '../data/usage';
import type { UsageSummary } from '../data/usage';
import { RepositoryError, requireId, transaction } from '../data/database';

/** Q11 timezone and time attribution must be selected outside this adapter. No browser clock is trusted. */
export interface DailyGroupingPolicy { readonly timeZone: string; readonly eventAttribution: 'server-received' }
export interface DailyResult { readonly event: PracticeEvent; readonly receivedAt: string; readonly committedRevision: number }
export interface DailySession {
  readonly sessionId: string; readonly mode: LessonMode; readonly startedAt: string | null; readonly closedAt: string | null;
  readonly feedback: FeedbackState | null; readonly comment: ProfessorComment | null;
}
export interface DailyProgressPage {
  readonly studentId: string; readonly day: string; readonly timeZone: string; readonly eventAttribution: 'server-received';
  readonly writtenEvents: Page<DailyResult>; readonly sessions: Page<DailySession>;
  /** No solved/mistake/performance denominator or time definition is inferred from raw outcomes. */
  readonly totals: null; readonly usageTime: UsageSummary; readonly hasUnattributedLegacyRecords: boolean;
}
export interface DailyPageRequest { readonly day: string; readonly eventCursor?: string | null; readonly sessionCursor?: string | null; readonly limit?: number }
function cursor(input: string | null | undefined): string {
  if (input == null) return '';
  if (typeof input !== 'string' || input.length > 1024) throw new RepositoryError('invalid-input');
  const decoded = Buffer.from(input, 'base64url').toString('utf8');
  if (!decoded || Buffer.from(decoded).toString('base64url') !== input) throw new RepositoryError('invalid-input');
  return decoded;
}
function page<T>(items: T[], limit: number, key: (item: T) => string): Page<T> {
  const shown = items.slice(0, limit);
  return { items: shown, nextCursor: items.length > limit ? Buffer.from(key(shown.at(-1)!)).toString('base64url') : null };
}

/** Professor daily grouping spans all visits/calls; closing one session cannot reset another's results. */
export function createDailyProgressRepository(pool: Pool, grouping?: DailyGroupingPolicy, disclosure?: DisclosurePolicy) {
  return {
    read(identity: AuthenticatedIdentity, studentId: string, input: DailyPageRequest): Promise<DailyProgressPage> {
      return transaction(pool, async client => {
        await authorize(client, identity, approvedAccountAccess, 'students:daily-progress:read');
        if (!grouping || typeof grouping.timeZone !== 'string' || !grouping.timeZone || grouping.eventAttribution !== 'server-received') throw new RepositoryError('policy-unresolved');
        let zone: string;
        try { zone = new Intl.DateTimeFormat('en', { timeZone: grouping.timeZone }).resolvedOptions().timeZone; }
        catch { throw new RepositoryError('invalid-input'); }
        requireId(studentId);
        if (typeof input?.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(input.day)
          || !Number.isFinite(Date.parse(input.day)) || new Date(input.day).toISOString().slice(0, 10) !== input.day) throw new RepositoryError('invalid-input');
        const limit = input.limit ?? 50;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RepositoryError('invalid-input');
        const eventAfter = cursor(input.eventCursor); const sessionAfter = cursor(input.sessionCursor);
        // Event cursor is a tuple, so identical event IDs from different sessions stay independent.
        let eventSession = ''; let eventId = '';
        if (eventAfter) {
          try { const pair: unknown = JSON.parse(eventAfter);
            if (!Array.isArray(pair) || pair.length !== 2) throw new Error();
            requireId(pair[0]); requireId(pair[1]); [eventSession, eventId] = pair;
          } catch { throw new RepositoryError('invalid-input'); }
        }
        if (sessionAfter) requireId(sessionAfter);
        const student = await client.query("SELECT id FROM learning_users WHERE id=$1 AND role='student'", [studentId]);
        if (!student.rowCount) throw new RepositoryError('not-found');
        const bounds = await client.query<{ start: Date; end: Date }>(
          'SELECT $1::date::timestamp AT TIME ZONE $2 AS start, ($1::date + 1)::timestamp AT TIME ZONE $2 AS end', [input.day, zone]);
        const { start, end } = bounds.rows[0]!;
        const events = await client.query<{ event_payload: unknown; received_at: Date; committed_revision: number }>(
          `SELECT e.event_payload,e.received_at,e.committed_revision FROM learning_events e JOIN learning_sessions s ON s.id=e.session_id
           WHERE s.user_id=$1 AND e.received_at >= $2 AND e.received_at < $3 AND e.event_payload->>'source'='typed'
           AND (e.session_id,e.event_id)>($4,$5) ORDER BY e.session_id,e.event_id LIMIT $6`, [studentId, start, end, eventSession, eventId, limit + 1]);
        const written = events.rows.map(row => {
          const event = parsePracticeEvent(row.event_payload);
          if (!event || event.source !== 'typed') throw new RepositoryError('invalid-input');
          return { event, receivedAt: row.received_at.toISOString(), committedRevision: row.committed_revision };
        });
        const sessions = await client.query<{ id: string; mode: LessonMode; started_at: Date | null; closed_at: Date | null; state: FeedbackState | null; text: string | null; provenance_version: string | null }>(
          `SELECT s.id,s.mode,s.started_at,s.closed_at,j.state,c.text,c.provenance_version FROM learning_sessions s
           LEFT JOIN learning_feedback_jobs j ON j.session_id=s.id LEFT JOIN learning_comments c ON c.session_id=s.id
           WHERE s.user_id=$1 AND ((s.started_at < $3 AND (s.status='open' OR s.closed_at >= $2))
             OR EXISTS (SELECT 1 FROM learning_events e WHERE e.session_id=s.id AND e.received_at >= $2 AND e.received_at < $3))
           AND s.id>$4 ORDER BY s.id LIMIT $5`, [studentId, start, end, sessionAfter, limit + 1]);
        const sessionViews: DailySession[] = sessions.rows.map(row => ({ sessionId: row.id, mode: row.mode,
          startedAt: row.started_at?.toISOString() ?? null, closedAt: row.closed_at?.toISOString() ?? null,
          feedback: disclosure?.allowStudentFeedback ? row.state ?? 'not-requested' : null,
          comment: disclosure?.allowStudentFeedback && row.state === 'succeeded' && row.text !== null && row.provenance_version !== null
            ? { sessionId: row.id, text: row.text, provenanceVersion: row.provenance_version } : null }));
        const legacy = await client.query<{ missing: boolean }>(`SELECT EXISTS (
          SELECT 1 FROM learning_sessions s LEFT JOIN learning_events e ON e.session_id=s.id
          WHERE s.user_id=$1 AND (s.started_at IS NULL OR e.received_at IS NULL AND e.event_id IS NOT NULL OR e.event_payload IS NULL AND e.event_id IS NOT NULL)
        ) AS missing`, [studentId]);
        return { studentId, day: input.day, timeZone: zone, eventAttribution: 'server-received',
          writtenEvents: page(written, limit, result => JSON.stringify([result.event.ref.sessionId, result.event.eventId])),
          sessions: page(sessionViews, limit, session => session.sessionId), totals: null, usageTime: await readUsageForWindow(client, studentId, start, end),
          hasUnattributedLegacyRecords: legacy.rows[0]!.missing };
      });
    },
  };
}
