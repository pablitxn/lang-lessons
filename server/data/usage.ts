import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { CallSegmentRef } from '../../src/contracts/session';
import { authorize, denyUnresolvedGrants } from '../accounts/authorization';
import type { AuthenticatedIdentity } from '../accounts/authorization';
import type { DataPolicy } from './repository';
import { exactKeys, requireId, requireRevision, RepositoryError, transaction } from './database';

export const WRITTEN_IDLE_MS = 120_000;
/** Producer-local seam pending integrator promotion. No browser timestamps or totals. */
export interface WrittenObservation { schemaVersion: 1; sessionId: string; streamId: string; eventId: string; sequence: number; kind: 'visible' | 'hidden' | 'input' | 'tap' }
export interface TutorObservation { schemaVersion: 1; segment: CallSegmentRef; eventId: string; sequence: number; kind: 'connected' | 'disconnected' }
export interface UsageReceipt { eventId: string; sequence: number; intervalId: string | null; observedAt: string; status: 'recorded' | 'duplicate' }
export interface UsageSummary {
  writtenMs: number; tutorConnectedMs: number; totalMs: number;
  writtenTrust: 'client-reported-interaction'; tutorTrust: 'server-observed-connection';
}
export interface UsagePorts {
  /** Test-only clock injection; production uses the database clock after acquiring the session lock. */
  now?: () => Date;
  /** Internal transport authority. Never bind this to a browser assertion/SDP-created response. */
  verifyTutorTransition?: (observation: TutorObservation) => Promise<boolean>;
}
interface StreamRow { id: string; visible: boolean; sequence: number; active_interval_id: string | null; last_observed_at: Date | null }

/** Called inside the existing session transaction, so time cannot extend beyond explicit stop/close. */
export async function finishUsage(client: PoolClient, sessionId: string, segmentId?: string) {
  await client.query(`UPDATE learning_time_intervals i SET ended_at=GREATEST(i.started_at,LEAST(COALESCE(i.ended_at,clock_timestamp()),clock_timestamp()))
    FROM learning_time_streams t WHERE i.stream_id=t.id AND t.session_id=$1 AND ($2::text IS NULL OR t.segment_id=$2) AND i.id=t.active_interval_id`, [sessionId, segmentId ?? null]);
  await client.query('UPDATE learning_time_streams SET active_interval_id=NULL,visible=false WHERE session_id=$1 AND ($2::text IS NULL OR segment_id=$2)', [sessionId, segmentId ?? null]);
}
export async function readUsageForWindow(client: PoolClient, userId: string, start: Date, end: Date, now?: Date): Promise<UsageSummary> {
  return readUsageForWindows(client,userId,[{start,end}],now);
}
export async function readUsageForWindows(client: PoolClient, userId: string, windows: readonly {start:Date|string;end:Date|string}[], now?: Date): Promise<UsageSummary> {
  // Union across disjoint historical timezone windows as well as sources/tabs/visits.
  const { rows } = await client.query<{ source: string; milliseconds: number }>(`WITH windows AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS w(start timestamptz,"end" timestamptz)), clipped AS (
    SELECT i.source,GREATEST(i.started_at,w.start) AS lo,
      LEAST(COALESCE(i.ended_at,$3::timestamptz,clock_timestamp()),w."end",COALESCE($3::timestamptz,clock_timestamp()),COALESCE(s.closed_at,w."end")) AS hi
    FROM learning_time_intervals i JOIN learning_sessions s ON s.id=i.session_id CROSS JOIN windows w WHERE s.user_id=$1
  ), unions AS (
    SELECT source,range_agg(tstzrange(lo,hi,'[)')) AS spans FROM clipped WHERE hi>lo GROUP BY source
    UNION ALL SELECT 'total',range_agg(tstzrange(lo,hi,'[)')) FROM clipped WHERE hi>lo
  ) SELECT source,COALESCE(sum(extract(epoch FROM (upper(span)-lower(span)))*1000),0)::float8 AS milliseconds
    FROM unions LEFT JOIN LATERAL unnest(spans) AS span ON true GROUP BY source`, [userId, JSON.stringify(windows), now ?? null]);
  const values = new Map(rows.map(row => [row.source, row.milliseconds]));
  return { writtenMs: values.get('written') ?? 0, tutorConnectedMs: values.get('tutor') ?? 0, totalMs: values.get('total') ?? 0,
    writtenTrust: 'client-reported-interaction', tutorTrust: 'server-observed-connection' };
}

export function createUsageRepository(pool: Pool, identity: AuthenticatedIdentity, policy: DataPolicy = { allowStructuredStorage: false, access: denyUnresolvedGrants }, ports: UsagePorts = {}) {
  const run = <T>(sessionId: string, work: (client: PoolClient, now: Date) => Promise<T>) => transaction(pool, async client => {
    await authorize(client, identity, policy.access, 'practice:own');
    if (!policy.allowStructuredStorage) throw new RepositoryError('policy-unresolved');
    requireId(sessionId);
    const session = await client.query<{ status: string }>('SELECT status FROM learning_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE', [sessionId, identity.userId]);
    if (!session.rows[0]) throw new RepositoryError('not-found');
    if (session.rows[0].status !== 'open') throw new RepositoryError('conflict');
    const now = ports.now?.() ?? (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now;
    if (!Number.isFinite(now.getTime())) throw new RepositoryError('invalid-input');
    return work(client, now);
  });
  async function record(client: PoolClient, now: Date, input: { sessionId: string; eventId: string; sequence: number; kind: string }, stream: StreamRow, source: 'written' | 'tutor'): Promise<UsageReceipt> {
    requireId(input.eventId); requireRevision(input.sequence);
    if (input.sequence < 1) throw new RepositoryError('invalid-input');
    const fingerprint = JSON.stringify([stream.id, input.sequence, input.kind, source]);
    const old = await client.query<{ fingerprint: string; result: UsageReceipt }>('SELECT fingerprint,result FROM learning_time_receipts WHERE session_id=$1 AND event_id=$2', [input.sessionId, input.eventId]);
    if (old.rows[0]) {
      if (old.rows[0].fingerprint !== fingerprint) throw new RepositoryError('conflict');
      return { ...old.rows[0].result, status: 'duplicate' };
    }
    if (input.sequence !== stream.sequence + 1 || stream.last_observed_at && now < stream.last_observed_at) throw new RepositoryError('conflict');
    let active = stream.active_interval_id;
    let visible = stream.visible;
    if (input.kind === 'visible') visible = true;
    if (input.kind === 'hidden' || input.kind === 'disconnected') {
      visible = false;
      if (active) await client.query('UPDATE learning_time_intervals SET ended_at=GREATEST(started_at,LEAST(COALESCE(ended_at,$2),$2)) WHERE id=$1', [active, now]);
      active = null;
    }
    const activating = source === 'written' ? visible && ['input','tap'].includes(input.kind) : input.kind === 'connected';
    if (activating) {
      const interval = active ? await client.query<{ ended_at: Date | null }>('SELECT ended_at FROM learning_time_intervals WHERE id=$1', [active]) : null;
      if (!active || source === 'written' && interval?.rows[0]?.ended_at && interval.rows[0].ended_at < now) {
        active = randomUUID();
        await client.query('INSERT INTO learning_time_intervals(id,stream_id,session_id,source,started_at,ended_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [active, stream.id, input.sessionId, source, now, source === 'written' ? new Date(now.getTime() + WRITTEN_IDLE_MS) : null]);
      } else if (source === 'written') await client.query('UPDATE learning_time_intervals SET ended_at=$2 WHERE id=$1', [active, new Date(now.getTime() + WRITTEN_IDLE_MS)]);
    }
    await client.query('UPDATE learning_time_streams SET sequence=$2,visible=$3,active_interval_id=$4,last_observed_at=$5 WHERE id=$1', [stream.id, input.sequence, visible, active, now]);
    const result: UsageReceipt = { eventId: input.eventId, sequence: input.sequence, intervalId: active, observedAt: now.toISOString(), status: 'recorded' };
    await client.query('INSERT INTO learning_time_receipts(session_id,event_id,fingerprint,result) VALUES ($1,$2,$3,$4)', [input.sessionId, input.eventId, fingerprint, JSON.stringify(result)]);
    return result;
  }
  return {
    /** One server-issued stream per mounted tab/exercise visit; identities are not client-supplied. */
    openWrittenStream: (sessionId: string): Promise<string> => run(sessionId, async client => {
      const id = randomUUID(); await client.query("INSERT INTO learning_time_streams(id,session_id,source) VALUES ($1,$2,'written')", [id, sessionId]); return id;
    }),
    written(input: WrittenObservation): Promise<UsageReceipt> {
      exactKeys(input, ['schemaVersion','sessionId','streamId','eventId','sequence','kind']); requireId(input.streamId);
      if (input.schemaVersion !== 1 || !['visible','hidden','input','tap'].includes(input.kind)) throw new RepositoryError('invalid-input');
      return run(input.sessionId, async (client, now) => {
        const { rows } = await client.query<StreamRow>("SELECT * FROM learning_time_streams WHERE id=$1 AND session_id=$2 AND source='written'", [input.streamId, input.sessionId]);
        if (!rows[0]) throw new RepositoryError('not-found');
        return record(client, now, input, rows[0], 'written');
      });
    },
    tutor(input: TutorObservation): Promise<UsageReceipt> {
      exactKeys(input, ['schemaVersion','segment','eventId','sequence','kind']); exactKeys(input.segment, ['sessionId','segmentId','connectionEpoch']);
      requireId(input.segment.segmentId); requireRevision(input.segment.connectionEpoch);
      if (input.schemaVersion !== 1 || !['connected','disconnected'].includes(input.kind)) throw new RepositoryError('invalid-input');
      return run(input.segment.sessionId, async (client, now) => {
        if (!ports.verifyTutorTransition || !await ports.verifyTutorTransition(input)) throw new RepositoryError('policy-unresolved');
        const segment = await client.query<{ ended: boolean }>('SELECT ended FROM learning_segments WHERE id=$1 AND session_id=$2 AND epoch=$3', [input.segment.segmentId, input.segment.sessionId, input.segment.connectionEpoch]);
        if (!segment.rows[0]) throw new RepositoryError('not-found');
        if (segment.rows[0].ended) throw new RepositoryError('conflict');
        await client.query("INSERT INTO learning_time_streams(id,session_id,source,segment_id) VALUES ($1,$2,'tutor',$3) ON CONFLICT(session_id,segment_id) DO NOTHING", [randomUUID(), input.segment.sessionId, input.segment.segmentId]);
        const { rows } = await client.query<StreamRow>('SELECT * FROM learning_time_streams WHERE session_id=$1 AND segment_id=$2', [input.segment.sessionId, input.segment.segmentId]);
        return record(client, now, { ...input, sessionId: input.segment.sessionId }, rows[0]!, 'tutor');
      });
    },
  };
}
