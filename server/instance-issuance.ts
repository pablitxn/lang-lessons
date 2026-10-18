import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { ExerciseIdentity } from '../src/contracts';
import { authorize, type AuthenticatedIdentity } from './accounts/authorization';
import type { DataPolicy } from './data/repository';
import { exactKeys, RepositoryError, requireId, transaction } from './data/database';

/** Client supplies only an idempotency key. The server creates and registers the exercise identity. */
export function createInstanceIssuer(pool: Pool, policy: DataPolicy) {
  return (identity: AuthenticatedIdentity, input: unknown): Promise<ExerciseIdentity> => {
    exactKeys(input, ['sessionId', 'operationId']); requireId(input.sessionId); requireId(input.operationId);
    const { sessionId, operationId } = input;
    return transaction(pool, async client => {
      await authorize(client, identity, policy.access, 'practice:own');
      if (!policy.allowStructuredStorage) throw new RepositoryError('policy-unresolved');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([identity.userId, operationId])]);
      const fingerprint = JSON.stringify(['issue-instance', sessionId]);
      const receipt = await client.query<{ fingerprint: string; result: ExerciseIdentity }>('SELECT fingerprint,result FROM learning_operations WHERE user_id=$1 AND operation_id=$2', [identity.userId, operationId]);
      if (receipt.rows[0]) {
        if (receipt.rows[0].fingerprint !== fingerprint) throw new RepositoryError('conflict');
        return receipt.rows[0].result;
      }
      const session = await client.query<{ status: string }>('SELECT status FROM learning_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE', [sessionId, identity.userId]);
      if (!session.rows[0]) throw new RepositoryError('not-found');
      if (session.rows[0].status !== 'open') throw new RepositoryError('conflict');
      const issued = { sessionId, exerciseId: randomUUID(), generation: 0 };
      await client.query('INSERT INTO learning_instances(session_id,exercise_id,generation) VALUES ($1,$2,$3)', [sessionId, issued.exerciseId, issued.generation]);
      await client.query('INSERT INTO learning_operations(user_id,operation_id,fingerprint,result) VALUES ($1,$2,$3,$4)', [identity.userId, operationId, fingerprint, JSON.stringify(issued)]);
      return issued;
    });
  };
}
