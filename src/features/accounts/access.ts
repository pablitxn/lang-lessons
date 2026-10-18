import type { CurrentUser } from '../../contracts';

/** The integration adapter supplies the approved capability name; null denies. */
export function hasCapability(user: CurrentUser | null, capability: string | null): boolean {
  return user !== null && capability !== null && capability.length > 0 && user.capabilities.granted.includes(capability);
}
export type ReadResult<T> = { status: 'ok'; value: T } | { status: 'denied' };
export interface Page<T> { readonly items: readonly T[]; readonly nextCursor: string | null }
