import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { ActivePractice, SessionSnapshot } from '../../src/contracts/session';
import type { LessonMode } from '../../src/contracts/curriculum';
import { authorize, type AuthenticatedIdentity } from '../accounts/authorization';
import type { DataPolicy } from './repository';
import { exactKeys, RepositoryError, requireId, transaction } from './database';
import { finishUsage } from './usage';
import { expireOutstandingCalls } from '../broker/lifetime';

interface SessionRow { id: string; mode: LessonMode; status: 'open' | 'closed'; revision: number }
interface OutstandingCall extends SessionRow { state: 'reserved' | 'created' }
const snapshot = (row: SessionRow): SessionSnapshot => ({ sessionId: row.id, mode: row.mode, status: row.status, revision: row.revision });
const callState = (rows: OutstandingCall[]): ActivePractice['callState'] => rows.some(row => row.state === 'reserved') ? 'uncertain' : rows.length ? 'active' : 'none';
async function outstanding(client: PoolClient, userId: string, lifetimeMs?: number): Promise<OutstandingCall[]> {
  return (await client.query<OutstandingCall>(`SELECT s.id,s.mode,s.status,s.revision,b.state FROM learning_broker_receipts b
    JOIN learning_sessions s ON s.id=b.session_id WHERE b.user_id=$1 AND b.state IN ('reserved','created')
    AND ($2::bigint IS NULL OR b.created_at+($2*interval '1 millisecond')>clock_timestamp())
    ORDER BY b.created_at,b.segment_id`, [userId, lifetimeMs ?? null])).rows;
}

/** The caller holds an actor share lock, so entry cannot switch modes during call creation. */
export async function requireActivePractice(client: PoolClient, userId: string, sessionId: string) {
  const current = await client.query('SELECT 1 FROM learning_active_practice WHERE user_id=$1 AND session_id=$2', [userId, sessionId]);
  if (!current.rowCount) throw new RepositoryError('conflict');
}
export async function requireNoOutstandingCall(client: PoolClient, userId: string) {
  const calls = await client.query("SELECT 1 FROM learning_broker_receipts WHERE user_id=$1 AND state IN ('reserved','created') LIMIT 1", [userId]);
  if (calls.rowCount) throw new RepositoryError('conflict');
}

/** Entry is an atomic choice of written practice, independent of tutor transport recovery. */
export function createActivePracticeRepository(pool: Pool, policy: DataPolicy) {
  return {
    readCurrent(identity: AuthenticatedIdentity): Promise<ActivePractice | null> {
      return transaction(pool, async client => {
        await authorize(client, identity, policy.access, 'practice:own');
        const calls = await outstanding(client, identity.userId, policy.providerCallLifetimeMs);
        // Older installations can have a live receipt before any current pointer exists.
        if (calls[0]) return { session: snapshot(calls[0]), callState: callState(calls.filter(row => row.id === calls[0]!.id)) };
        const current = await client.query<SessionRow>(`SELECT s.* FROM learning_active_practice p JOIN learning_sessions s ON s.id=p.session_id
          WHERE p.user_id=$1 AND s.status='open'`, [identity.userId]);
        return current.rows[0] ? { session: snapshot(current.rows[0]), callState: 'none' } : null;
      });
    },
    enter(identity: AuthenticatedIdentity, input: unknown): Promise<ActivePractice> {
      exactKeys(input, ['mode', 'operationId']); requireId(input.operationId);
      if (typeof input.mode !== 'string' || !['verb-image', 'verb-visible', 'sentence'].includes(input.mode)) throw new RepositoryError('invalid-input');
      const mode = input.mode as LessonMode;
      return transaction(pool, async client => {
        requireId(identity.userId);
        // Lock before authorization's share lock: serialize all entries and exclude call starts/reservations.
        await client.query('SELECT id FROM learning_users WHERE id=$1 FOR UPDATE', [identity.userId]);
        await authorize(client, identity, policy.access, 'practice:own');
        if (!policy.allowStructuredStorage) throw new RepositoryError('policy-unresolved');
        await expireOutstandingCalls(client, identity.userId, policy.providerCallLifetimeMs);
        const fingerprint = JSON.stringify(['enter', mode]);
        const receipt = (await client.query<{ fingerprint: string; result: { sessionId: string } }>(
          'SELECT fingerprint,result FROM learning_operations WHERE user_id=$1 AND operation_id=$2', [identity.userId, input.operationId])).rows[0];
        const current = (await client.query<SessionRow>(`SELECT s.* FROM learning_active_practice p JOIN learning_sessions s ON s.id=p.session_id
          WHERE p.user_id=$1`, [identity.userId])).rows[0];
        // Retrying an old request must not reactivate a session after a subsequent mode switch.
        if (receipt && (receipt.fingerprint !== fingerprint || receipt.result.sessionId !== current?.id || current.status !== 'open')) throw new RepositoryError('conflict');
        const calls = await outstanding(client, identity.userId);
        if (calls.some(row => row.mode !== mode || row.status !== 'open')) throw new RepositoryError('conflict');

        // Unbound/rejected/ended segments never established an outstanding provider call.
        // Reserved/created receipts are left intact until the learner explicitly ends the call.
        const orphans = await client.query<{ id: string; session_id: string }>(`SELECT g.id,g.session_id FROM learning_segments g
          JOIN learning_sessions s ON s.id=g.session_id LEFT JOIN learning_broker_receipts b ON b.segment_id=g.id
          WHERE s.user_id=$1 AND NOT g.ended AND (b.segment_id IS NULL OR b.state IN ('ended','rejected')) ORDER BY s.id,g.epoch`, [identity.userId]);
        const revised = new Set<string>();
        for (const orphan of orphans.rows) {
          await client.query('SELECT id FROM learning_sessions WHERE id=$1 FOR UPDATE', [orphan.session_id]);
          await finishUsage(client, orphan.session_id, orphan.id);
          await client.query('UPDATE learning_segments SET ended=true WHERE id=$1', [orphan.id]);
          revised.add(orphan.session_id);
        }
        if (revised.size) await client.query('UPDATE learning_sessions SET revision=revision+1 WHERE id=ANY($1::text[])', [[...revised]]);

        const selectedId = calls[0]?.id ?? (current?.status === 'open' && current.mode === mode ? current.id : null);
        let selected = selectedId ? (await client.query<SessionRow>('SELECT * FROM learning_sessions WHERE id=$1 FOR UPDATE', [selectedId])).rows[0]
          : (await client.query<SessionRow>(`SELECT * FROM learning_sessions WHERE user_id=$1 AND mode=$2 AND status='open'
            ORDER BY last_entered_at DESC NULLS LAST,started_at DESC NULLS LAST,id DESC LIMIT 1 FOR UPDATE`, [identity.userId, mode])).rows[0];
        if (!selected) selected = (await client.query<SessionRow>('INSERT INTO learning_sessions(id,user_id,mode) VALUES ($1,$2,$3) RETURNING *', [randomUUID(), identity.userId, mode])).rows[0]!;
        if (current && current.id !== selected.id) await finishUsage(client, current.id);
        await client.query('UPDATE learning_sessions SET last_entered_at=clock_timestamp() WHERE id=$1', [selected.id]);
        await client.query(`INSERT INTO learning_active_practice(user_id,session_id) VALUES ($1,$2)
          ON CONFLICT(user_id) DO UPDATE SET session_id=EXCLUDED.session_id,updated_at=clock_timestamp()
          WHERE learning_active_practice.session_id<>EXCLUDED.session_id`, [identity.userId, selected.id]);
        if (!receipt) await client.query('INSERT INTO learning_operations(user_id,operation_id,fingerprint,result) VALUES ($1,$2,$3,$4)',
          [identity.userId, input.operationId, fingerprint, JSON.stringify({ sessionId: selected.id })]);
        return { session: snapshot(selected), callState: callState(calls.filter(row => row.id === selected.id)) };
      });
    },
  };
}
