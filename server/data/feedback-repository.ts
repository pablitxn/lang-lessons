import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { FeedbackRepository, FeedbackJobRef, ProfessorComment } from '../../src/contracts/feedback';
import { transaction, RepositoryError, requireId, exactKeys } from './database';

export interface FeedbackStoragePolicy {
  /** Q13 selection and length bound supplied by an approved policy, never a default. */
  acceptComment(comment: ProfessorComment): boolean;
}
/** Internal worker-only API. Do not expose claims/tokens as client HTTP endpoints. */
export interface FencedFeedbackRepository extends FeedbackRepository {
  recordInsufficient(claim: FeedbackJobRef): Promise<'recorded' | 'stale'>;
}
export function createFeedbackRepository(pool: Pool, policy?: FeedbackStoragePolicy): FencedFeedbackRepository {
  const validateClaim = (claim: FeedbackJobRef) => {
    exactKeys(claim, ['sessionId', 'jobId', 'claimToken']);
    requireId(claim.sessionId); requireId(claim.jobId); requireId(claim.claimToken);
  };
  return {
    claim: jobId => transaction(pool, async client => {
      requireId(jobId);
      if (!policy) throw new RepositoryError('policy-unresolved');
      const token = randomUUID();
      // Only pending jobs may be claimed. No lease duration/reclaim/retry policy is invented.
      const { rows } = await client.query<{ session_id: string }>(
        "UPDATE learning_feedback_jobs SET state='running',claim_token=$2 WHERE id=$1 AND state='pending' AND EXISTS (SELECT 1 FROM learning_sessions s WHERE s.id=learning_feedback_jobs.session_id AND s.status='closed') AND EXISTS (SELECT 1 FROM learning_segments c WHERE c.session_id=learning_feedback_jobs.session_id) RETURNING session_id", [jobId, token]);
      return rows[0] ? { jobId, sessionId: rows[0].session_id, claimToken: token } : null;
    }),
    complete: (claim, comment) => transaction(pool, async client => {
      validateClaim(claim);
      if (!policy) throw new RepositoryError('policy-unresolved');
      exactKeys(comment, ['sessionId', 'text', 'provenanceVersion']);
      if (comment.sessionId !== claim.sessionId || typeof comment.text !== 'string' || !comment.text.trim()
        || typeof comment.provenanceVersion !== 'string' || !comment.provenanceVersion.trim() || !policy.acceptComment(comment)) throw new RepositoryError('invalid-input');
      const updated = await client.query(
        "UPDATE learning_feedback_jobs SET state='succeeded',claim_token=NULL WHERE id=$1 AND session_id=$2 AND claim_token=$3 AND state='running' RETURNING id", [claim.jobId, claim.sessionId, claim.claimToken]);
      if (!updated.rowCount) return 'stale';
      await client.query('INSERT INTO learning_comments(session_id,text,provenance_version) VALUES ($1,$2,$3)', [claim.sessionId, comment.text, comment.provenanceVersion]);
      return 'stored';
    }),
    recordInsufficient: claim => transaction(pool, async client => {
      validateClaim(claim);
      const updated = await client.query(
        "UPDATE learning_feedback_jobs SET state='insufficient-evidence',claim_token=NULL WHERE id=$1 AND session_id=$2 AND claim_token=$3 AND state='running' RETURNING id", [claim.jobId, claim.sessionId, claim.claimToken]);
      return updated.rowCount ? 'recorded' : 'stale';
    }),
    fail: claim => transaction(pool, async client => {
      validateClaim(claim);
      const updated = await client.query(
        "UPDATE learning_feedback_jobs SET state='failed',claim_token=NULL WHERE id=$1 AND session_id=$2 AND claim_token=$3 AND state='running' RETURNING id", [claim.jobId, claim.sessionId, claim.claimToken]);
      return updated.rowCount ? 'recorded' : 'stale';
    }),
  };
}
