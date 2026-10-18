import type { Pool, PoolClient } from 'pg';
import type { LessonMode } from '../../src/contracts/curriculum';
import type { SessionSnapshot, CallSegmentRef } from '../../src/contracts/session';
import type { ProgressFence } from '../../src/contracts/progress';
import type { FeedbackState } from '../../src/contracts/feedback';
import type { AuthenticatedIdentity } from '../accounts/authorization';
import { authorize, denyUnresolvedGrants } from '../accounts/authorization';
import type { DataPolicy } from './repository';
import { exactKeys, requireId, requireRevision, RepositoryError, transaction } from './database';

export interface RecoverySnapshot {
  readonly session: SessionSnapshot; readonly progress: ProgressFence; readonly activeSegments: readonly CallSegmentRef[];
  readonly feedback: { jobId: string; state: FeedbackState; retryRevision: number } | null;
}
export interface RetryFeedbackRequest { sessionId: string; jobId: string; operationId: string; expectedRetryRevision: number }
export interface RetryFeedbackResult { sessionId: string; jobId: string; state: 'pending'; retryRevision: number }

/** Resume means reusing the same open session. Finalize uses existing confirmClose after queue flush/confirmation. */
export function createRecoveryRepository(pool: Pool, identity: AuthenticatedIdentity, policy: DataPolicy = { allowStructuredStorage: false, access: denyUnresolvedGrants }) {
  const run = <T>(work: (client: PoolClient) => Promise<T>) => transaction(pool, async client => {
    await authorize(client, identity, policy.access, 'practice:own'); return work(client);
  });
  return {
    listOpen(cursor: string | null = null, limit = 50): Promise<{ items: readonly SessionSnapshot[]; nextCursor: string | null }> {
      return run(async client => {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RepositoryError('invalid-input');
        const after = cursor ?? ''; if (cursor !== null) requireId(cursor);
        const { rows } = await client.query<{ id: string; mode: LessonMode; status: 'open'; revision: number }>(
          "SELECT id,mode,status,revision FROM learning_sessions WHERE user_id=$1 AND status='open' AND id>$2 ORDER BY id LIMIT $3", [identity.userId, after, limit + 1]);
        const items = rows.slice(0, limit).map(row => ({ sessionId: row.id, mode: row.mode, status: row.status, revision: row.revision }));
        return { items, nextCursor: rows.length > limit ? items.at(-1)!.sessionId : null };
      });
    },
    read(sessionId: string): Promise<RecoverySnapshot> {
      requireId(sessionId);
      return run(async client => {
        const { rows } = await client.query<{ id: string; mode: LessonMode; status: 'open' | 'closed'; revision: number; journal_revision: number }>(
          'SELECT id,mode,status,revision,journal_revision FROM learning_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE', [sessionId, identity.userId]);
        const row = rows[0]; if (!row) throw new RepositoryError('not-found');
        const segments = await client.query<{ id: string; epoch: number }>('SELECT id,epoch FROM learning_segments WHERE session_id=$1 AND NOT ended ORDER BY epoch', [sessionId]);
        const jobs = await client.query<{ id: string; state: FeedbackState; retry_revision: number }>('SELECT id,state,retry_revision FROM learning_feedback_jobs WHERE session_id=$1', [sessionId]);
        const job = jobs.rows[0];
        return { session: { sessionId, mode: row.mode, status: row.status, revision: row.revision }, progress: { sessionId, journalRevision: row.journal_revision },
          activeSegments: segments.rows.map(segment => ({ sessionId, segmentId: segment.id, connectionEpoch: segment.epoch })),
          feedback: job ? { jobId: job.id, state: job.state, retryRevision: job.retry_revision } : null };
      });
    },
    retryFailedFeedback(input: RetryFeedbackRequest): Promise<RetryFeedbackResult> {
      exactKeys(input, ['sessionId','jobId','operationId','expectedRetryRevision']);
      requireId(input.sessionId); requireId(input.jobId); requireId(input.operationId); requireRevision(input.expectedRetryRevision);
      return run(async client => {
        if (!policy.allowStructuredStorage) throw new RepositoryError('policy-unresolved');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([identity.userId, input.operationId])]);
        const fingerprint = JSON.stringify(['retry-feedback', input.sessionId, input.jobId, input.expectedRetryRevision]);
        const prior = await client.query<{ fingerprint: string; result: RetryFeedbackResult }>('SELECT fingerprint,result FROM learning_operations WHERE user_id=$1 AND operation_id=$2', [identity.userId, input.operationId]);
        if (prior.rows[0]) {
          if (prior.rows[0].fingerprint !== fingerprint) throw new RepositoryError('conflict');
          return prior.rows[0].result;
        }
        const session = await client.query<{ status: string }>('SELECT status FROM learning_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE', [input.sessionId, identity.userId]);
        if (!session.rows[0]) throw new RepositoryError('not-found');
        if (session.rows[0].status !== 'closed') throw new RepositoryError('conflict');
        const retried = await client.query<{ retry_revision: number }>(`UPDATE learning_feedback_jobs j SET state='pending',claim_token=NULL,retry_revision=retry_revision+1
          WHERE j.id=$1 AND j.session_id=$2 AND j.state='failed' AND j.retry_revision=$3
          AND NOT EXISTS (SELECT 1 FROM learning_comments c WHERE c.session_id=j.session_id) RETURNING retry_revision`, [input.jobId, input.sessionId, input.expectedRetryRevision]);
        if (!retried.rows[0]) throw new RepositoryError('conflict');
        const result: RetryFeedbackResult = { sessionId: input.sessionId, jobId: input.jobId, state: 'pending', retryRevision: retried.rows[0].retry_revision };
        await client.query('INSERT INTO learning_operations(user_id,operation_id,fingerprint,result) VALUES ($1,$2,$3,$4)', [identity.userId, input.operationId, fingerprint, JSON.stringify(result)]);
        return result;
      });
    },
  };
}
