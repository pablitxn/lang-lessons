import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Role } from '../../src/contracts/accounts';
import type { AuthenticatedIdentity } from './authorization';
import { authorize } from './authorization';
import { approvedAccountAccess } from './approved-policy';
import { exactKeys, requireId, requireRevision, RepositoryError, transaction } from '../data/database';

/** Local consumer DTO; integrator alone may promote this to shared contracts. */
export interface ManagedUser { readonly id: string; readonly role: Role; readonly disabled: boolean; readonly revision: number }
/** Personal account details are returned only by the administrator directory. */
export interface ManagedUserListItem extends ManagedUser { readonly email: string; readonly credentialStatus: 'ready' | 'setup-required' }
export interface CreateAccountInput { readonly operationId: string; readonly email: string; readonly role: Role; readonly disabled: boolean }
export interface CreateAccountResult { readonly user: ManagedUser; readonly credentialSetup: 'pending-policy' }
export type UpdateAccountInput = { readonly operationId: string; readonly userId: string; readonly expectedRevision: number } & (
  { readonly kind: 'set-role'; readonly role: Role } | { readonly kind: 'set-disabled'; readonly disabled: boolean });
export interface ManagedUserPage { readonly items: readonly ManagedUserListItem[]; readonly nextCursor: string | null }
function role(value: unknown): asserts value is Role {
  if (typeof value !== 'string' || !['administrator', 'professor', 'student'].includes(value)) throw new RepositoryError('invalid-input');
}
function email(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@\u0000-\u001f]+@[^\s@\u0000-\u001f]+\.[^\s@\u0000-\u001f]+$/u.test(value)) throw new RepositoryError('invalid-input');
  return value.toLowerCase();
}
async function admin(client: PoolClient, identity: AuthenticatedIdentity) {
  const actor = await authorize(client, identity, approvedAccountAccess, 'users:manage');
  if (actor.role !== 'administrator') throw new RepositoryError('forbidden');
}
async function receipt<T>(client: PoolClient, actor: string, operationId: string, payload: unknown, work: () => Promise<T>): Promise<T> {
  const fingerprint = `account-management:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([actor, operationId])]);
  const { rows } = await client.query<{ fingerprint: string; result: T }>('SELECT fingerprint,result FROM learning_operations WHERE user_id=$1 AND operation_id=$2', [actor, operationId]);
  if (rows[0]) {
    if (rows[0].fingerprint !== fingerprint) throw new RepositoryError('conflict');
    return rows[0].result;
  }
  const result = await work();
  await client.query('INSERT INTO learning_operations(user_id,operation_id,fingerprint,result) VALUES ($1,$2,$3,$4)', [actor, operationId, fingerprint, JSON.stringify(result)]);
  return result;
}

/** Existing authenticated administrators only. No bootstrap, deletion, password, invite or mail API. */
export function createUserManagementRepository(pool: Pool) {
  const write = <T>(identity: AuthenticatedIdentity, work: (client: PoolClient) => Promise<T>) => transaction(pool, async client => {
    // Every management mutation takes this lock BEFORE actor/target row locks.
    // It serializes last-admin checks and prevents two admins removing each other concurrently.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('lang-lessons:admin-management',0))");
    await admin(client, identity);
    return work(client);
  });
  return {
    list(identity: AuthenticatedIdentity, cursor: string | null = null, limit = 50): Promise<ManagedUserPage> {
      return transaction(pool, async client => {
        await admin(client, identity);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RepositoryError('invalid-input');
        let after = '';
        if (cursor !== null) {
          if (typeof cursor !== 'string' || cursor.length > 512) throw new RepositoryError('invalid-input');
          after = Buffer.from(cursor, 'base64url').toString('utf8'); requireId(after);
          if (Buffer.from(after).toString('base64url') !== cursor) throw new RepositoryError('invalid-input');
        }
        const { rows } = await client.query<ManagedUserListItem>(
          `SELECT u.id,u.role,u.disabled,u.revision,a.email,
            CASE WHEN EXISTS (SELECT 1 FROM account c WHERE c."userId"=u.id AND c."providerId"='credential' AND c.password IS NOT NULL)
              THEN 'ready' ELSE 'setup-required' END AS "credentialStatus"
           FROM learning_users u JOIN "user" a ON a.id=u.id WHERE u.id>$1 ORDER BY u.id LIMIT $2`, [after, limit + 1]);
        const items = rows.slice(0, limit);
        return { items, nextCursor: rows.length > limit ? Buffer.from(items.at(-1)!.id).toString('base64url') : null };
      });
    },
    create(identity: AuthenticatedIdentity, input: CreateAccountInput): Promise<CreateAccountResult> {
      exactKeys(input, ['operationId', 'email', 'role', 'disabled']); requireId(input.operationId); role(input.role);
      const canonicalEmail = email(input.email);
      if (typeof input.disabled !== 'boolean') throw new RepositoryError('invalid-input');
      return write(identity, client => receipt(client, identity.userId, input.operationId,
        ['create', canonicalEmail, input.role, input.disabled], async () => {
          const id = randomUUID();
          // Library-required name is the opaque ID, not an invented personal name.
          // No credential row, verified-email claim, invitation or password is created.
          const inserted = await client.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES ($1,$1,$2,false) ON CONFLICT (email) DO NOTHING RETURNING id', [id, canonicalEmail]);
          if (!inserted.rowCount) throw new RepositoryError('conflict');
          const { rows } = await client.query<ManagedUser>('INSERT INTO learning_users(id,role,disabled) VALUES ($1,$2,$3) RETURNING id,role,disabled,revision', [id, input.role, input.disabled]);
          return { user: rows[0]!, credentialSetup: 'pending-policy' as const };
        }));
    },
    update(identity: AuthenticatedIdentity, input: UpdateAccountInput): Promise<ManagedUser> {
      const field = input?.kind === 'set-role' ? 'role' : input?.kind === 'set-disabled' ? 'disabled' : null;
      if (!field) throw new RepositoryError('invalid-input');
      exactKeys(input, ['operationId', 'userId', 'expectedRevision', 'kind', field]);
      requireId(input.operationId); requireId(input.userId); requireRevision(input.expectedRevision);
      if (input.kind === 'set-role') role(input.role);
      else if (typeof input.disabled !== 'boolean') throw new RepositoryError('invalid-input');
      return write(identity, client => receipt(client, identity.userId, input.operationId,
        [input.kind, input.userId, input.expectedRevision, input.kind === 'set-role' ? input.role : input.disabled], async () => {
          const { rows } = await client.query<ManagedUser>('SELECT id,role,disabled,revision FROM learning_users WHERE id=$1 FOR UPDATE', [input.userId]);
          const target = rows[0]; if (!target) throw new RepositoryError('not-found');
          if (target.revision !== input.expectedRevision) throw new RepositoryError('conflict');
          const nextRole = input.kind === 'set-role' ? input.role : target.role;
          const nextDisabled = input.kind === 'set-disabled' ? input.disabled : target.disabled;
          if (target.role === 'administrator' && !target.disabled && (nextRole !== 'administrator' || nextDisabled)) {
            const others = await client.query("SELECT u.id FROM learning_users u WHERE u.role='administrator' AND NOT u.disabled AND u.id<>$1 AND EXISTS (SELECT 1 FROM account a WHERE a.\"userId\"=u.id AND a.\"providerId\"='credential' AND a.password IS NOT NULL) LIMIT 1", [target.id]);
            if (!others.rowCount) throw new RepositoryError('conflict');
          }
          const updated = await client.query<ManagedUser>(
            'UPDATE learning_users SET role=$2,disabled=$3,revision=revision+1,auth_valid_after=CASE WHEN disabled<>$3 THEN clock_timestamp() ELSE auth_valid_after END WHERE id=$1 RETURNING id,role,disabled,revision',
            [target.id, nextRole, nextDisabled]);
          if (target.disabled !== nextDisabled) await client.query('DELETE FROM session WHERE "userId"=$1', [target.id]);
          return updated.rows[0]!;
        }));
    },
  };
}
