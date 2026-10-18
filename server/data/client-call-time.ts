import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedIdentity, AccessPolicy } from '../accounts/authorization';
import { authorize } from '../accounts/authorization';
import { exactKeys, requireId, requireRevision, RepositoryError, transaction } from './database';

export function createClientCallTime(pool: Pool, access: AccessPolicy) {
  return async (identity: AuthenticatedIdentity, value: unknown) => {
    exactKeys(value, ['segment','intervals']); const segment = value.segment;
    exactKeys(segment, ['sessionId','segmentId','connectionEpoch']);
    requireId(segment.sessionId); requireId(segment.segmentId); requireRevision(segment.connectionEpoch);
    if (!Array.isArray(value.intervals) || value.intervals.length > 100) throw new RepositoryError('invalid-input');
    const intervals = value.intervals.map(row => {
      exactKeys(row, ['start','end']);
      if (typeof row.start !== 'string' || typeof row.end !== 'string') throw new RepositoryError('invalid-input');
      const start = new Date(row.start); const end = new Date(row.end);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start || end.getTime()-start.getTime()>8*3600000) throw new RepositoryError('invalid-input');
      return { start: start.toISOString(), end: end.toISOString() };
    });
    return transaction(pool, async client => {
      await authorize(client, identity, access, 'practice:own');
      const { rows } = await client.query<{ status: string; started_at: Date; now: Date }>('SELECT status,started_at,clock_timestamp() AS now FROM learning_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE', [segment.sessionId, identity.userId]);
      if (!rows[0]) throw new RepositoryError('not-found');
      const found = await client.query('SELECT 1 FROM learning_segments WHERE id=$1 AND session_id=$2 AND epoch=$3', [segment.segmentId,segment.sessionId,segment.connectionEpoch]);
      if (!found.rowCount) throw new RepositoryError('not-found');
      const prior = await client.query('SELECT intervals FROM learning_client_call_time WHERE segment_id=$1', [segment.segmentId]);
      if (prior.rows[0]) {
        if (JSON.stringify(prior.rows[0].intervals.map((r: any) => [r.start,r.end])) !== JSON.stringify(intervals.map(r => [r.start,r.end]))) throw new RepositoryError('conflict');
        return { status: 'duplicate' as const };
      }
      if (rows[0].status !== 'open') throw new RepositoryError('conflict');
      // Reject out-of-session or future claims; client clock skew yields unavailable, not invented time.
      if (intervals.some(r => new Date(r.start) < rows[0]!.started_at || new Date(r.end) > rows[0]!.now)) throw new RepositoryError('invalid-input');
      await client.query('INSERT INTO learning_client_call_time(segment_id,session_id,epoch,intervals) VALUES ($1,$2,$3,$4)', [segment.segmentId,segment.sessionId,segment.connectionEpoch,JSON.stringify(intervals)]);
      return { status: 'recorded' as const };
    });
  };
}

/** Missing any segment observation makes daily tutor/combined estimates unavailable. */
export async function clientCallTimeForWindows(client: PoolClient, userId: string, windows: readonly { start: Date | string; end: Date | string }[]) {
  const spans = JSON.stringify(windows);
  const missing = await client.query(`WITH windows AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS w(start timestamptz,"end" timestamptz))
    SELECT 1 FROM learning_sessions s JOIN learning_segments g ON g.session_id=s.id LEFT JOIN learning_client_call_time c ON c.segment_id=g.id
    WHERE s.user_id=$1 AND c.segment_id IS NULL AND EXISTS (SELECT 1 FROM windows w WHERE s.started_at < w."end" AND (s.closed_at IS NULL OR s.closed_at >= w.start)) LIMIT 1`, [userId, spans]);
  if (missing.rowCount) return { orientativeTutorMs: null, orientativeTotalMs: null };
  const { rows } = await client.query<{ source: string; ms: number }>(`WITH windows AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS w(start timestamptz,"end" timestamptz)), raw AS (
    SELECT 'tutor' AS source, r.start AS lo,r."end" AS hi FROM learning_client_call_time c JOIN learning_sessions s ON s.id=c.session_id
    CROSS JOIN LATERAL jsonb_to_recordset(c.intervals) AS r(start timestamptz,"end" timestamptz) WHERE s.user_id=$1
    UNION ALL SELECT 'written',i.started_at,LEAST(COALESCE(i.ended_at,clock_timestamp()),clock_timestamp()) FROM learning_time_intervals i JOIN learning_sessions s ON s.id=i.session_id WHERE s.user_id=$1 AND i.source='written'
    ), clipped AS (SELECT source,GREATEST(lo,w.start) lo,LEAST(hi,w."end") hi FROM raw CROSS JOIN windows w), unions AS (
    SELECT source,range_agg(tstzrange(lo,hi,'[)')) spans FROM clipped WHERE hi>lo GROUP BY source
    UNION ALL SELECT 'total',range_agg(tstzrange(lo,hi,'[)')) FROM clipped WHERE hi>lo)
    SELECT source,COALESCE(sum(extract(epoch FROM(upper(span)-lower(span)))*1000),0)::float8 ms FROM unions LEFT JOIN LATERAL unnest(spans) span ON true GROUP BY source`, [userId,spans]);
  const values = new Map(rows.map(r => [r.source,r.ms]));
  return { orientativeTutorMs: values.get('tutor') ?? 0, orientativeTotalMs: values.get('total') ?? 0 };
}
