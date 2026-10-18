import { useCallback, useState } from 'react';
import type { CurrentUser, PublicUser } from '../../contracts';
import { hasCapability, type Page, type ReadResult } from '../accounts/access';
import { ReadPanel } from '../accounts/ReadPanel';
export interface AdminUsersApi { listUsers(cursor: string | null, signal: AbortSignal): Promise<ReadResult<Page<PublicUser>>> }
export function AdminUsers({ user, capability = null, api = null }: { user: CurrentUser | null; capability?: string | null; api?: AdminUsersApi | null }) {
  return <section className="p3-admin"><h1>User management</h1>{!hasCapability(user, capability) ? <p role="alert">Access denied.</p> : !api ? <p role="status">User management is not available yet.</p> : <UserList key={JSON.stringify([user, capability])} api={api} />}
    <p>Account creation, role changes, disabling and recovery are not available yet.</p></section>;
}
function UserList({ api }: { api: AdminUsersApi }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors.at(-1) ?? null;
  const load = useCallback((signal: AbortSignal) => api.listUsers(cursor, signal), [api, cursor]);
  return <ReadPanel key={cursor ?? 'first'} load={load}>{page => <>
    {page.items.length ? <ul aria-label="Users">{page.items.map(user => <li key={user.id}>{user.id} · {user.role}</li>)}</ul> : <p>No users found.</p>}
    <button disabled={cursors.length === 1} onClick={() => setCursors(value => value.slice(0, -1))}>Previous users</button>
    <button disabled={!page.nextCursor || cursors.includes(page.nextCursor)} onClick={() => { if (page.nextCursor) setCursors(value => [...value, page.nextCursor]); }}>Next users</button>
  </>}</ReadPanel>;
}
