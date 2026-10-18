import type { Pool, PoolClient } from 'pg';
import type { CallSegmentRef } from '../../src/contracts/session';
import type { AuthenticatedIdentity, AccessPolicy } from '../accounts/authorization';
import { authorize, denyUnresolvedGrants } from '../accounts/authorization';
import { exactKeys, requireId, requireRevision, RepositoryError, transaction } from './database';

export interface CallHistory { readonly sessionId: string; readonly hadConnectedCall: boolean | null }
export interface CloseContext { readonly sessionId: string; readonly segments: readonly CallSegmentRef[] }
export type CloseEligibility = 'not-requested' | 'pending' | 'insufficient-evidence';
export type EvaluateClose = (client: PoolClient, context: CloseContext) => Promise<CloseEligibility>;
export interface CallObservation { readonly eventId: string; readonly segment: CallSegmentRef; readonly kind: 'connected' | 'never-connected' }

/** Caller holds the session lock. No negative inference from stopped status, SDP, missing receipts or elapsed time. */
export async function readCallHistoryInTransaction(client: PoolClient, sessionId: string, allowUnknown = false): Promise<CallHistory> {
  const { rows } = await client.query<{ connected: boolean; never_connected: boolean }>(`SELECT
    EXISTS (SELECT 1 FROM learning_call_observations o WHERE o.session_id=s.session_id AND o.segment_id=s.id AND o.epoch=s.epoch AND o.kind='connected')
    OR EXISTS (SELECT 1 FROM learning_time_streams t JOIN learning_time_intervals i ON i.stream_id=t.id
      WHERE t.session_id=s.session_id AND t.segment_id=s.id AND t.source='tutor' AND i.source='tutor' AND i.session_id=s.session_id) AS connected,
    EXISTS (SELECT 1 FROM learning_call_observations o WHERE o.session_id=s.session_id AND o.segment_id=s.id AND o.epoch=s.epoch AND o.kind='never-connected') AS never_connected
    FROM learning_segments s WHERE s.session_id=$1 ORDER BY s.epoch`, [sessionId]);
  if (rows.some(row => row.connected)) return { sessionId, hadConnectedCall: true };
  if (rows.some(row => !row.never_connected)) {
    if (allowUnknown) return { sessionId, hadConnectedCall: null };
    throw new RepositoryError('policy-unresolved');
  }
  return { sessionId, hadConnectedCall: false };
}

/** Root supplies its transaction-local broker guard; P6 supplies the evidence/sufficiency decision. */
export function createCloseEvaluator(ports: {
  allowUnknown?: boolean;
  guardBroker: (client: PoolClient, context: CloseContext) => Promise<void>;
  connectedFeedback: (client: PoolClient, context: CloseContext) => Promise<'pending' | 'insufficient-evidence'>;
}): EvaluateClose {
  return async (client, context) => {
    await ports.guardBroker(client, context);
    const history = await readCallHistoryInTransaction(client, context.sessionId, ports.allowUnknown);
    if (history.hadConnectedCall === null) return 'insufficient-evidence';
    if (!history.hadConnectedCall) return 'not-requested';
    const result = await ports.connectedFeedback(client, context);
    if (result !== 'pending' && result !== 'insufficient-evidence') throw new RepositoryError('policy-unresolved');
    return result;
  };
}

/** Internal authenticated transport observations only; root must not expose record as a browser endpoint. */
export function createCallObservationRepository(pool: Pool, identity: AuthenticatedIdentity, ports: {
  access?: AccessPolicy;
  verify: (observation: CallObservation) => Promise<boolean>;
}) {
  return {
    record(input: CallObservation): Promise<'recorded' | 'duplicate'> {
      exactKeys(input, ['eventId','segment','kind']); requireId(input.eventId);
      exactKeys(input.segment, ['sessionId','segmentId','connectionEpoch']); requireId(input.segment.sessionId); requireId(input.segment.segmentId); requireRevision(input.segment.connectionEpoch);
      if (input.segment.connectionEpoch < 1 || !['connected','never-connected'].includes(input.kind)) throw new RepositoryError('invalid-input');
      return transaction(pool, async client => {
        await authorize(client, identity, ports.access ?? denyUnresolvedGrants, 'practice:own');
        const session = await client.query<{ status: string }>('SELECT status FROM learning_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE', [input.segment.sessionId, identity.userId]);
        if (!session.rows[0]) throw new RepositoryError('not-found');
        if (!await ports.verify(input)) throw new RepositoryError('policy-unresolved');
        const prior = await client.query<{ segment_id: string; epoch: number; kind: string }>('SELECT segment_id,epoch,kind FROM learning_call_observations WHERE session_id=$1 AND event_id=$2', [input.segment.sessionId,input.eventId]);
        if (prior.rows[0]) {
          const old=prior.rows[0];
          if (old.segment_id!==input.segment.segmentId || old.epoch!==input.segment.connectionEpoch || old.kind!==input.kind) throw new RepositoryError('conflict');
          return 'duplicate';
        }
        if (session.rows[0].status !== 'open') throw new RepositoryError('conflict');
        const segment = await client.query<{ ended: boolean }>('SELECT ended FROM learning_segments WHERE id=$1 AND session_id=$2 AND epoch=$3', [input.segment.segmentId,input.segment.sessionId,input.segment.connectionEpoch]);
        if (!segment.rowCount) throw new RepositoryError('not-found');
        if (input.kind === 'never-connected' && !segment.rows[0]!.ended) throw new RepositoryError('conflict');
        const contradictory = await client.query(`SELECT 1 FROM learning_call_observations WHERE session_id=$1 AND segment_id=$2 AND epoch=$3 AND kind<>$4
          UNION ALL SELECT 1 FROM learning_time_streams t JOIN learning_time_intervals i ON i.stream_id=t.id
          WHERE $4='never-connected' AND t.session_id=$1 AND t.segment_id=$2 AND t.source='tutor' AND i.source='tutor' LIMIT 1`,
          [input.segment.sessionId,input.segment.segmentId,input.segment.connectionEpoch,input.kind]);
        if (contradictory.rowCount) throw new RepositoryError('conflict');
        await client.query('INSERT INTO learning_call_observations(session_id,event_id,segment_id,epoch,kind) VALUES ($1,$2,$3,$4,$5)',
          [input.segment.sessionId,input.eventId,input.segment.segmentId,input.segment.connectionEpoch,input.kind]);
        return 'recorded';
      });
    },
  };
}
