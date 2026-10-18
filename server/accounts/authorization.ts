import type { PoolClient } from 'pg';
import type { CurrentUser, Role } from '../../src/contracts/accounts';
import { RepositoryError, requireId } from '../data/database';

export interface AccessPolicy { grants(role: Role): readonly string[] }
export const denyUnresolvedGrants: AccessPolicy = { grants: () => [] };
/** User ID must come from the server's validated auth session, never a request body. */
export interface AuthenticatedIdentity { readonly userId: string }
export async function authorize(client: PoolClient, identity: AuthenticatedIdentity, policy: AccessPolicy, capability?: string): Promise<CurrentUser> {
  requireId(identity.userId);
  // Hold a shared lock through the operation: disable/role changes serialize with writes.
  const { rows } = await client.query<{ id: string; role: Role; disabled: boolean }>(
    'SELECT id, role, disabled FROM learning_users WHERE id = $1 FOR SHARE', [identity.userId]);
  const user = rows[0];
  if (!user || user.disabled) throw new RepositoryError('forbidden');
  const granted = [...policy.grants(user.role)];
  if (capability && !granted.includes(capability)) throw new RepositoryError('forbidden');
  return { id: user.id, role: user.role, capabilities: { granted } };
}
