import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { LessonMode, ExerciseIdentity } from '../../src/contracts/curriculum';
import type { SessionCommands, SessionSnapshot, SessionMutation, CallSegmentRef, ConfirmCloseRequest, CloseResult } from '../../src/contracts/session';
import type { FeedbackState } from '../../src/contracts/feedback';
import type { ProgressBatchResult, PracticeEvent } from '../../src/contracts/progress';
import { applyProgressBatch, parsePracticeEvent, MAX_PRACTICE_BATCH } from '../../src/foundation/progress-batch';
import { authorize, denyUnresolvedGrants } from '../accounts/authorization';
import type { AuthenticatedIdentity, AccessPolicy } from '../accounts/authorization';
import { transaction, RepositoryError, requireId, requireRevision, exactKeys } from './database';

export interface DataPolicy {
  /** An affirmative, externally approved storage policy is required. No retention duration is selected here. */
  allowStructuredStorage: boolean;
  access: AccessPolicy;
  /** Server facts only; no client qualifying-call boolean. Undefined blocks close after any call start. */
  feedbackOnClose?: (segments: readonly CallSegmentRef[]) => 'not-requested' | 'pending' | 'insufficient-evidence';
}
export const unresolvedDataPolicy: DataPolicy = { allowStructuredStorage: false, access: denyUnresolvedGrants };
interface SessionRow { id: string; user_id: string; mode: LessonMode; status: 'open' | 'closed'; revision: number; journal_revision: number; next_epoch: number }
const snapshot = (row: SessionRow): SessionSnapshot => ({ sessionId: row.id, mode: row.mode, status: row.status, revision: row.revision });
function mutation(input: SessionMutation) {
  requireId(input.sessionId); requireId(input.operationId); requireRevision(input.expectedRevision);
}
async function lockSession(client: PoolClient, identity: AuthenticatedIdentity, sessionId: string): Promise<SessionRow> {
  requireId(sessionId);
  const { rows } = await client.query<SessionRow>('SELECT * FROM learning_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE', [sessionId, identity.userId]);
  if (!rows[0]) throw new RepositoryError('not-found');
  return rows[0];
}
function open(row: SessionRow, expectedRevision?: number) {
  if (row.status !== 'open' || (expectedRevision !== undefined && row.revision !== expectedRevision)) throw new RepositoryError('conflict');
}
async function operation<T>(client: PoolClient, userId: string, operationId: string, fingerprint: string, work: () => Promise<T>): Promise<T> {
  // Serialize creation as well as session mutations with the same actor/key, without lock-order cycles.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([userId, operationId])]);
  const { rows } = await client.query<{ fingerprint: string; result: T }>('SELECT fingerprint, result FROM learning_operations WHERE user_id = $1 AND operation_id = $2', [userId, operationId]);
  if (rows[0]) {
    if (rows[0].fingerprint !== fingerprint) throw new RepositoryError('conflict');
    return rows[0].result;
  }
  const result = await work();
  await client.query('INSERT INTO learning_operations(user_id, operation_id, fingerprint, result) VALUES ($1,$2,$3,$4)', [userId, operationId, fingerprint, JSON.stringify(result)]);
  return result;
}

/** Bound once per authenticated request; never construct identity from the JSON payload. */
export function createLearningRepository(pool: Pool, identity: AuthenticatedIdentity, policy: DataPolicy = unresolvedDataPolicy) {
  const run = <T>(work: (client: PoolClient) => Promise<T>, writing = true): Promise<T> => transaction(pool, async client => {
    await authorize(client, identity, policy.access, 'practice:own');
    if (writing && !policy.allowStructuredStorage) throw new RepositoryError('policy-unresolved');
    return work(client);
  });
  const commands: SessionCommands = {
    create(input) {
      exactKeys(input, ['mode', 'operationId']); requireId(input.operationId);
      if (!['verb-image', 'verb-visible', 'sentence'].includes(input.mode)) throw new RepositoryError('invalid-input');
      return run(client => operation(client, identity.userId, input.operationId, JSON.stringify(['create', input.mode]), async () => {
        const { rows } = await client.query<SessionRow>('INSERT INTO learning_sessions(id,user_id,mode) VALUES ($1,$2,$3) RETURNING *', [randomUUID(), identity.userId, input.mode]);
        return snapshot(rows[0]!);
      }));
    },
    read: sessionId => run(async client => snapshot(await lockSession(client, identity, sessionId)), false),
    startCall(input) {
      exactKeys(input, ['sessionId', 'operationId', 'expectedRevision']); mutation(input);
      return run(client => operation(client, identity.userId, input.operationId, JSON.stringify(['start', input.sessionId, input.expectedRevision]), async () => {
        const row = await lockSession(client, identity, input.sessionId); open(row, input.expectedRevision);
        const active = await client.query('SELECT id FROM learning_segments WHERE session_id=$1 AND NOT ended', [row.id]);
        if (active.rowCount) throw new RepositoryError('conflict');
        const segment = { sessionId: row.id, segmentId: randomUUID(), connectionEpoch: row.next_epoch + 1 };
        await client.query('INSERT INTO learning_segments(id,session_id,epoch) VALUES ($1,$2,$3)', [segment.segmentId, row.id, segment.connectionEpoch]);
        await client.query('UPDATE learning_sessions SET revision=revision+1, next_epoch=next_epoch+1 WHERE id=$1', [row.id]);
        return { session: { ...snapshot(row), revision: row.revision + 1 }, segment };
      }));
    },
    stopCall(input) {
      exactKeys(input, ['sessionId', 'operationId', 'expectedRevision', 'segment']); mutation(input);
      exactKeys(input.segment, ['sessionId', 'segmentId', 'connectionEpoch']); requireId(input.segment.segmentId); requireRevision(input.segment.connectionEpoch);
      if (input.segment.sessionId !== input.sessionId || input.segment.connectionEpoch < 1) throw new RepositoryError('invalid-input');
      return run(client => operation(client, identity.userId, input.operationId,
        JSON.stringify(['stop', input.sessionId, input.expectedRevision, input.segment.segmentId, input.segment.connectionEpoch]), async () => {
          const row = await lockSession(client, identity, input.sessionId); open(row, input.expectedRevision);
          const stopped = await client.query('UPDATE learning_segments SET ended=true WHERE id=$1 AND session_id=$2 AND epoch=$3 RETURNING id', [input.segment.segmentId, row.id, input.segment.connectionEpoch]);
          if (!stopped.rowCount) throw new RepositoryError('not-found');
          await client.query('UPDATE learning_sessions SET revision=revision+1 WHERE id=$1', [row.id]);
          return { ...snapshot(row), revision: row.revision + 1 };
        }));
    },
    confirmClose(input: ConfirmCloseRequest) {
      exactKeys(input, ['sessionId', 'operationId', 'expectedRevision', 'finalProgress']); mutation(input);
      exactKeys(input.finalProgress, ['sessionId', 'journalRevision']); requireRevision(input.finalProgress.journalRevision);
      if (input.finalProgress.sessionId !== input.sessionId) throw new RepositoryError('invalid-input');
      return run(client => operation(client, identity.userId, input.operationId,
        JSON.stringify(['close', input.sessionId, input.expectedRevision, input.finalProgress.journalRevision]), async () => {
          const row = await lockSession(client, identity, input.sessionId); open(row, input.expectedRevision);
          if (row.journal_revision !== input.finalProgress.journalRevision) throw new RepositoryError('conflict');
          const { rows } = await client.query<{ id: string; epoch: number }>('SELECT id,epoch FROM learning_segments WHERE session_id=$1 ORDER BY epoch', [row.id]);
          let feedback: FeedbackState = 'not-requested';
          if (rows.length) {
            if (!policy.feedbackOnClose) throw new RepositoryError('policy-unresolved');
            feedback = policy.feedbackOnClose(rows.map(segment => ({ sessionId: row.id, segmentId: segment.id, connectionEpoch: segment.epoch })));
            if (!['not-requested', 'pending', 'insufficient-evidence'].includes(feedback)) throw new RepositoryError('policy-unresolved');
          }
          const result: CloseResult = { sessionId: row.id, operationId: input.operationId, status: 'closed', revision: row.revision + 1, feedback };
          await client.query("UPDATE learning_sessions SET status='closed', revision=revision+1 WHERE id=$1", [row.id]);
          await client.query('UPDATE learning_segments SET ended=true WHERE session_id=$1 AND NOT ended', [row.id]);
          if (feedback !== 'not-requested') await client.query('INSERT INTO learning_feedback_jobs(id,session_id,state) VALUES ($1,$2,$3)', [randomUUID(), row.id, feedback]);
          await client.query('INSERT INTO learning_closes(session_id,result) VALUES ($1,$2)', [row.id, JSON.stringify(result)]);
          return result;
        }));
    },
    readClose: sessionId => run(async client => {
      await lockSession(client, identity, sessionId);
      const { rows } = await client.query<{ result: CloseResult }>('SELECT result FROM learning_closes WHERE session_id=$1', [sessionId]);
      return rows[0]?.result ?? null;
    }, false),
  };
  return {
    commands,
    /** Server composition seam: register an issued instance, not arbitrary browser assertion. */
    registerInstance(ref: ExerciseIdentity): Promise<void> {
      exactKeys(ref, ['sessionId', 'exerciseId', 'generation']); requireId(ref.exerciseId); requireRevision(ref.generation);
      return run(async client => {
        open(await lockSession(client, identity, ref.sessionId));
        await client.query('INSERT INTO learning_instances(session_id,exercise_id,generation) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [ref.sessionId, ref.exerciseId, ref.generation]);
      });
    },
    submit(sessionId: string, input: unknown): Promise<ProgressBatchResult> {
      return run(async client => {
        const row = await lockSession(client, identity, sessionId); open(row);
        const reject = (): ProgressBatchResult => ({ status: 'rejected', reason: 'invalid-batch', current: { sessionId, journalRevision: row.journal_revision } });
        if (!Array.isArray(input) || input.length < 1 || input.length > MAX_PRACTICE_BATCH) return reject();
        const parsed = input.map(parsePracticeEvent);
        if (parsed.some(event => !event || event.ref.sessionId !== sessionId)) return reject();
        const events = parsed as PracticeEvent[];
        for (const event of events) {
          const found = await client.query('SELECT 1 FROM learning_instances WHERE session_id=$1 AND exercise_id=$2 AND generation=$3', [sessionId, event.ref.exerciseId, event.ref.generation]);
          if (!found.rowCount) return reject();
        }
        const keys = events.map(event => JSON.stringify([event.ref.exerciseId, event.ref.generation, event.ref.obligation]));
        const receipts = await client.query<{ event_id: string; fingerprint: string; committed_revision: number }>(
          'SELECT event_id,fingerprint,committed_revision FROM learning_events WHERE session_id=$1 AND event_id=ANY($2::text[])', [sessionId, events.map(event => event.eventId)]);
        const attempts = await client.query<{ attempt_key: string; revision: number }>(
          'SELECT attempt_key,revision FROM learning_attempts WHERE session_id=$1 AND attempt_key=ANY($2::text[])', [sessionId, keys]);
        const original = { sessionId, revision: row.journal_revision,
          receipts: new Map(receipts.rows.map(r => [r.event_id, { fingerprint: r.fingerprint, committedRevision: r.committed_revision }])),
          attempts: new Map(attempts.rows.map(r => [r.attempt_key, r.revision])) };
        const applied = applyProgressBatch(original, events);
        if (applied.result.status === 'rejected') return applied.result;
        // No writes occur until every member has validated; a database error rolls back all writes.
        for (const [eventId, receipt] of applied.state.receipts) {
          if (original.receipts.has(eventId)) continue;
          const event = events.find(item => item.eventId === eventId)!;
          await client.query('INSERT INTO learning_events(session_id,event_id,exercise_id,generation,fingerprint,committed_revision) VALUES ($1,$2,$3,$4,$5,$6)',
            [sessionId, eventId, event.ref.exerciseId, event.ref.generation, receipt.fingerprint, receipt.committedRevision]);
        }
        for (const [key, revision] of applied.state.attempts) {
          await client.query('INSERT INTO learning_attempts(session_id,attempt_key,revision) VALUES ($1,$2,$3) ON CONFLICT (session_id,attempt_key) DO UPDATE SET revision=EXCLUDED.revision', [sessionId, key, revision]);
        }
        await client.query('UPDATE learning_sessions SET journal_revision=$2 WHERE id=$1', [sessionId, applied.state.revision]);
        return applied.result;
      });
    },
  };
}
