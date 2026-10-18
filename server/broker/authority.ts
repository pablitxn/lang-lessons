import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Pool } from 'pg';
import type { CallSegmentRef } from '../../src/contracts';
import type { createAuthAdapter } from '../auth/better-auth';
import { authorize, type AuthenticatedIdentity, type AccessPolicy } from '../accounts/authorization';
import { exactKeys, requireId, requireRevision, RepositoryError, transaction } from '../data/database';

export interface BrokerBinding { readonly identity: AuthenticatedIdentity; readonly segment: CallSegmentRef; readonly tokenDigest: string }
export interface BrokerAuthority {
  authenticate(request: IncomingMessage): Promise<AuthenticatedIdentity>;
  reserve(identity: AuthenticatedIdentity, segment: unknown, token: string): Promise<BrokerBinding>;
  created(binding: BrokerBinding, providerCallId: string): Promise<void>;
  ended(binding: BrokerBinding): Promise<void>;
  rejected(binding: BrokerBinding): Promise<void>;
  authorizeRelease(identity: AuthenticatedIdentity, token: string): Promise<{ binding: BrokerBinding; state: 'reserved' | 'created' | 'ended' | 'rejected'; providerCallId: string | null }>;
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
/** SDP acceptance is a creation receipt, deliberately not verified connection-time evidence. */
export function createBrokerAuthority(options: {
  pool: Pool; auth: ReturnType<typeof createAuthAdapter>; access: AccessPolicy; origin: string;
  allowRequest(address: string): Promise<boolean>;
}): BrokerAuthority {
  const { pool, access } = options;
  async function change(binding: BrokerBinding, state: 'created' | 'ended' | 'rejected', providerCallId?: string) {
    // Internal provider cleanup can finish after logout/deactivation; it cannot
    // create new calls or promote browser observations into trusted evidence.
    await transaction(pool, async client => {
      const result = await client.query(`UPDATE learning_broker_receipts SET state=$1,
        provider_call_id=COALESCE($2,provider_call_id), ended_at=CASE WHEN $1 IN ('ended','rejected') THEN COALESCE(ended_at,clock_timestamp()) ELSE ended_at END
        WHERE token_digest=$3 AND user_id=$4 AND session_id=$5 AND segment_id=$6 AND epoch=$7
        AND (state=$1 OR state='reserved' OR state='created' AND $1='ended')`,
        [state, providerCallId ?? null, binding.tokenDigest, binding.identity.userId, binding.segment.sessionId, binding.segment.segmentId, binding.segment.connectionEpoch]);
      if (!result.rowCount) throw new RepositoryError('conflict');
    });
  }
  return {
    async authenticate(request) {
      if (request.headers['sec-fetch-site'] === 'cross-site' || request.method !== 'GET' && request.headers.origin !== options.origin) throw new RepositoryError('forbidden');
      if (!await options.allowRequest(request.socket.remoteAddress ?? '')) throw new RepositoryError('forbidden');
      const headers = new Headers(); for (const [key, value] of Object.entries(request.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      const identity = await options.auth.identity(headers);
      await transaction(pool, async client => { await authorize(client, identity, access, 'practice:own'); });
      return identity;
    },
    reserve(identity, raw, token) {
      exactKeys(raw, ['sessionId', 'segmentId', 'connectionEpoch']); requireId(raw.sessionId); requireId(raw.segmentId); requireRevision(raw.connectionEpoch);
      if (raw.connectionEpoch < 1) throw new RepositoryError('invalid-input');
      const segment = { sessionId: raw.sessionId, segmentId: raw.segmentId, connectionEpoch: raw.connectionEpoch };
      const tokenDigest = digest(token);
      return transaction(pool, async client => {
        await authorize(client, identity, access, 'practice:own');
        const session = await client.query("SELECT id FROM learning_sessions WHERE id=$1 AND user_id=$2 AND status='open' FOR UPDATE", [segment.sessionId, identity.userId]);
        if (!session.rowCount) throw new RepositoryError('not-found');
        const active = await client.query('SELECT id FROM learning_segments WHERE id=$1 AND session_id=$2 AND epoch=$3 AND NOT ended', [segment.segmentId, segment.sessionId, segment.connectionEpoch]);
        if (!active.rowCount) throw new RepositoryError('conflict');
        const prior = await client.query('SELECT segment_id FROM learning_broker_receipts WHERE segment_id=$1', [segment.segmentId]);
        if (prior.rowCount) throw new RepositoryError('conflict');
        await client.query("INSERT INTO learning_broker_receipts(segment_id,session_id,user_id,epoch,token_digest,state) VALUES ($1,$2,$3,$4,$5,'reserved')", [segment.segmentId, segment.sessionId, identity.userId, segment.connectionEpoch, tokenDigest]);
        return { identity: { userId: identity.userId }, segment, tokenDigest };
      });
    },
    created: (binding, callId) => change(binding, 'created', callId),
    ended: binding => change(binding, 'ended'),
    rejected: binding => change(binding, 'rejected'),
    authorizeRelease(identity, token) {
      return transaction(pool, async client => {
        await authorize(client, identity, access, 'practice:own');
        const receipt = await client.query<{ segment_id: string; session_id: string; epoch: number; state: 'reserved' | 'created' | 'ended' | 'rejected'; provider_call_id: string | null }>('SELECT segment_id,session_id,epoch,state,provider_call_id FROM learning_broker_receipts WHERE user_id=$1 AND token_digest=$2', [identity.userId, digest(token)]);
        const row = receipt.rows[0]; if (!row) throw new RepositoryError('forbidden');
        return { binding: { identity: { ...identity }, segment: { sessionId: row.session_id, segmentId: row.segment_id, connectionEpoch: row.epoch }, tokenDigest: digest(token) }, state: row.state, providerCallId: row.provider_call_id };
      });
    },
  };
}
