import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { Pool } from 'pg';
import type { AuthenticatedIdentity } from '../accounts/authorization';
import { authorize } from '../accounts/authorization';
import { approvedAccountAccess } from '../accounts/approved-policy';
import { exactKeys, requireId, RepositoryError, transaction } from '../data/database';
import type { LoginPolicy } from './better-auth';
import { withCredentialLock } from './credential-lock';

export interface CredentialLinkConfiguration {
  pool: Pool;
  /** Trusted application origin; never supplied by the issuing request. */
  origin: string;
  passwordPolicy: Pick<LoginPolicy, 'minPasswordLength' | 'maxPasswordLength'>;
  expiresInSeconds?: number;
}
export function createCredentialLinkRepository(config: CredentialLinkConfiguration) {
  const { pool, passwordPolicy } = config;
  const origin = new URL(config.origin);
  if (origin.origin !== config.origin || !(origin.protocol === 'https:' || origin.protocol === 'http:' && ['127.0.0.1','localhost'].includes(origin.hostname))) throw new RepositoryError('invalid-input');
  const expiry = config.expiresInSeconds ?? 1800;
  if (!Number.isSafeInteger(expiry) || expiry < 1 || expiry > 1800 || !passwordPolicy
    || !Number.isSafeInteger(passwordPolicy.minPasswordLength) || passwordPolicy.minPasswordLength < 1
    || !Number.isSafeInteger(passwordPolicy.maxPasswordLength) || passwordPolicy.maxPasswordLength < passwordPolicy.minPasswordLength
    || passwordPolicy.maxPasswordLength > 1024) throw new RepositoryError('invalid-input');
  return {
    /** Manual delivery only. Response is sensitive: no logs, analytics, cache or durable replay receipt. */
    issue(identity: AuthenticatedIdentity, input: { userId: string; purpose: 'setup' | 'reset' }): Promise<{ link: string; expiresAt: string }> {
      exactKeys(input,['userId','purpose']); requireId(input.userId);
      if (!['setup','reset'].includes(input.purpose)) throw new RepositoryError('invalid-input');
      return transaction(pool,async client=>{
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('lang-lessons:admin-management',0))");
        await authorize(client,identity,approvedAccountAccess,'users:manage');
        const target = await client.query<{disabled:boolean}>('SELECT disabled FROM learning_users WHERE id=$1 FOR UPDATE',[input.userId]);
        if (!target.rows[0] || target.rows[0].disabled) throw new RepositoryError('forbidden');
        const credentials = await client.query('SELECT id FROM account WHERE "userId"=$1 AND "providerId"=\'credential\' AND password IS NOT NULL',[input.userId]);
        if ((input.purpose === 'setup') === Boolean(credentials.rowCount)) throw new RepositoryError('conflict');
        const token = randomBytes(32).toString('base64url');
        const digest = createHash('sha256').update(token).digest('hex');
        await client.query('DELETE FROM learning_credential_links WHERE user_id=$1',[input.userId]);
        const result = await client.query<{expires_at:Date}>('INSERT INTO learning_credential_links(token_hash,user_id,purpose,issued_by,expires_at) VALUES ($1,$2,$3,$4,clock_timestamp()+$5*interval \'1 second\') RETURNING expires_at',[digest,input.userId,input.purpose,identity.userId,expiry]);
        // Fragment is not sent in HTTP requests/referrers. UI must clear it before rendering/telemetry.
        return {link:config.origin+'/account/credentials#token='+token,expiresAt:result.rows[0]!.expires_at.toISOString()};
      });
    },
    redeem(input: { token: string; password: string }): Promise<{ ok: true }> {
      exactKeys(input,['token','password']);
      if (typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(input.token)
        || typeof input.password !== 'string' || input.password.length < passwordPolicy.minPasswordLength
        || input.password.length > passwordPolicy.maxPasswordLength) throw new RepositoryError('invalid-input');
      const digest = createHash('sha256').update(input.token).digest('hex');
      return withCredentialLock(pool,true,()=>transaction(pool,async client=>{
        // Acquire the dedicated credential lock before borrowing an application connection.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('lang-lessons:admin-management',0))");
        const result = await client.query<{user_id:string;purpose:'setup'|'reset'}>('SELECT user_id,purpose FROM learning_credential_links WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE',[digest]);
        const link = result.rows[0]; if (!link) throw new RepositoryError('invalid-input');
        const target = await client.query<{disabled:boolean}>('SELECT disabled FROM learning_users WHERE id=$1 FOR UPDATE',[link.user_id]);
        if (!target.rows[0] || target.rows[0].disabled) throw new RepositoryError('invalid-input');
        const existing = await client.query<{id:string;password:string|null}>('SELECT id,password FROM account WHERE "userId"=$1 AND "providerId"=\'credential\' FOR UPDATE',[link.user_id]);
        if (existing.rows.length>1 || (link.purpose==='setup') === existing.rows.some(row=>row.password!==null)) throw new RepositoryError('invalid-input');
        const password = await hashPassword(input.password);
        // Recheck expiry after hashing; invalid/expired links never consume or mutate credentials.
        const consumed = await client.query('UPDATE learning_credential_links SET consumed_at=clock_timestamp() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING token_hash',[digest]);
        if (!consumed.rowCount) throw new RepositoryError('invalid-input');
        if (existing.rows[0]) await client.query('UPDATE account SET password=$2,"updatedAt"=clock_timestamp() WHERE id=$1',[existing.rows[0].id,password]);
        else await client.query('INSERT INTO account(id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,\'credential\',$2,$3,clock_timestamp())',[randomUUID(),link.user_id,password]);
        await client.query('UPDATE learning_users SET auth_valid_after=clock_timestamp() WHERE id=$1',[link.user_id]);
        await client.query('DELETE FROM session WHERE "userId"=$1',[link.user_id]);
        return {ok:true as const};
      }));
    },
  };
}
