import type { PoolClient } from 'pg';
import { finishUsage } from '../data/usage';

/** OpenAI documents a 60-minute session maximum. The creation exchange is bounded
 * to 15 seconds in realtime.ts; five extra minutes conservatively cover setup.
 * https://developers.openai.com/api/docs/guides/realtime-conversations#session-lifecycle-events
 * This is a transport bound, never evidence that a call connected or did not connect.
 */
export const OPENAI_CALL_LIFETIME_MS = 65 * 60_000;

/** The caller holds an exclusive actor lock before acquiring any session lock. */
export async function expireOutstandingCalls(client: PoolClient, userId: string, lifetimeMs: number | undefined) {
  const revised = new Set<string>();
  if (lifetimeMs === undefined) return revised;
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < OPENAI_CALL_LIFETIME_MS) throw new Error('Invalid provider lifetime policy');
  const expired = await client.query<{ segment_id: string; session_id: string; deadline: Date }>(`SELECT segment_id,session_id,created_at+($2*interval '1 millisecond') AS deadline
    FROM learning_broker_receipts WHERE user_id=$1 AND state IN ('reserved','created')
    AND created_at+($2*interval '1 millisecond')<=clock_timestamp() ORDER BY session_id,segment_id`, [userId, lifetimeMs]);
  for (const row of expired.rows) {
    await client.query('SELECT id FROM learning_sessions WHERE id=$1 FOR UPDATE', [row.session_id]);
    const ended = await client.query(`UPDATE learning_broker_receipts SET state='ended',ended_at=COALESCE(ended_at,created_at+($2*interval '1 millisecond'))
      WHERE segment_id=$1 AND state IN ('reserved','created') RETURNING segment_id`, [row.segment_id, lifetimeMs]);
    if (!ended.rowCount) continue;
    await finishUsage(client, row.session_id, row.segment_id, row.deadline);
    await client.query('UPDATE learning_segments SET ended=true WHERE id=$1', [row.segment_id]);
    revised.add(row.session_id);
  }
  if (revised.size) await client.query('UPDATE learning_sessions SET revision=revision+1 WHERE id=ANY($1::text[])', [[...revised]]);
  return revised;
}
