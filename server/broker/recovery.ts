import type { Pool } from 'pg';
import { authorize, type AccessPolicy, type AuthenticatedIdentity } from '../accounts/authorization';
import { exactKeys, requireId, RepositoryError, transaction } from '../data/database';
import { finishUsage } from '../data/usage';

/** Explicit recovery only. Resume never terminates a possibly live transport. */
export function createBrokerRecovery(options: {
  pool: Pool; access: AccessPolicy; terminate?: (providerCallId: string) => Promise<boolean>;
}) {
  return (identity: AuthenticatedIdentity, input: unknown) => {
    exactKeys(input, ['sessionId', 'intent']); requireId(input.sessionId);
    if (input.intent !== 'resume' && input.intent !== 'finalize') throw new RepositoryError('invalid-input');
    const sessionId = input.sessionId; const intent = input.intent;
    return transaction(options.pool, async client => {
      await authorize(client, identity, options.access, 'practice:own');
      const session = await client.query<{ status: string }>('SELECT status FROM learning_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE', [sessionId, identity.userId]);
      if (!session.rowCount) throw new RepositoryError('not-found');
      if (session.rows[0]!.status !== 'open') throw new RepositoryError('conflict');
      // The same session lock fences broker reservation and new call segments.
      const { rows } = await client.query<{ id: string; state: string | null; provider_call_id: string | null }>(
        `SELECT s.id,r.state,r.provider_call_id FROM learning_segments s
         LEFT JOIN learning_broker_receipts r ON r.segment_id=s.id
         WHERE s.session_id=$1 AND (NOT s.ended OR r.state IN ('reserved','created')) ORDER BY s.epoch`, [sessionId]);
      for (const row of rows) {
        // Unknown provider outcomes cannot be treated as successful cleanup.
        if (row.state === 'reserved') throw new RepositoryError('conflict');
        if (row.state === 'created') {
          if (intent !== 'finalize') throw new RepositoryError('conflict');
          if (!row.provider_call_id || !options.terminate) throw new RepositoryError('policy-unresolved');
          if (!await options.terminate(row.provider_call_id)) throw new RepositoryError('conflict');
          await client.query("UPDATE learning_broker_receipts SET state='ended',ended_at=COALESCE(ended_at,clock_timestamp()) WHERE segment_id=$1", [row.id]);
        }
        await finishUsage(client, sessionId, row.id);
        await client.query('UPDATE learning_segments SET ended=true WHERE id=$1', [row.id]);
      }
      if (rows.length) await client.query('UPDATE learning_sessions SET revision=revision+1 WHERE id=$1', [sessionId]);
      return { sessionId, status: 'reconciled' as const };
    });
  };
}
