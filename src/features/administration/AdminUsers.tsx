import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CurrentUser, PublicUser } from '../../contracts';
import { hasCapability, type Page, type ReadResult } from '../accounts/access';
import { ReadPanel } from '../accounts/ReadPanel';
import { changeDescription, CreateUserForm, UserActions } from './ManagementControls';
import { managementMessages, unboundManagement, type ManagedUser, type ManagementCapabilities, type UserChange, type UserManagementApi } from './management';
export interface AdminUsersApi { listUsers(cursor: string | null, signal: AbortSignal): Promise<ReadResult<Page<PublicUser | ManagedUser>>> }
export function AdminUsers({ user, capability = null, api = null, managementApi = null, managementCapabilities = unboundManagement, onAccountChanged, credentialActions }: {
  user: CurrentUser | null; capability?: string | null; api?: AdminUsersApi | null;
  managementApi?: UserManagementApi | null; managementCapabilities?: ManagementCapabilities;
  /** Root refreshes current actor/grants after a successful mutation, including self changes. */
  onAccountChanged?: () => void;
  credentialActions?: (user: ManagedUser) => ReactNode;
}) {
  return <section className="p3-admin"><h1>User management</h1>{!hasCapability(user, capability) ? <p role="alert">Access denied.</p> : !api || !user ? <p role="status">User management is not available yet.</p> :
    <UserList key={JSON.stringify([user, capability, managementCapabilities])} actor={user} api={api} managementApi={managementApi} capabilities={managementCapabilities} onAccountChanged={onAccountChanged} credentialActions={credentialActions} />}
    <p>Public signup and account deletion are not available. Setup and recovery links are delivered manually by an administrator.</p></section>;
}
function UserList({ actor, api, managementApi, capabilities, onAccountChanged, credentialActions }: {
  actor: CurrentUser; api: AdminUsersApi; managementApi: UserManagementApi | null; capabilities: ManagementCapabilities; credentialActions: ((user: ManagedUser) => ReactNode) | undefined; onAccountChanged: (() => void) | undefined;
}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [revision, setRevision] = useState(0);
  const [change, setChange] = useState<UserChange | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [denied, setDenied] = useState(false);
  const active = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const cursor = cursors.at(-1) ?? null;
  const load = useCallback((signal: AbortSignal) => api.listUsers(cursor, signal), [api, cursor, revision]);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, [managementApi]);
  useEffect(() => { if (change) dialog.current?.showModal(); }, [change]);
  useEffect(() => { if (message) feedback.current?.focus(); }, [message]);
  const locked = pending || blocked;
  function requestChange(next: UserChange) { if (!locked) { setMessage(''); setChange(next); } }
  function cancel() { if (!active.current) { dialog.current?.close(); setChange(null); } }
  async function confirm() {
    if (!change || !managementApi || active.current || locked) return;
    const controller = new AbortController(); active.current = controller; setPending(true);
    try {
      const result = await managementApi.apply(change, controller.signal);
      if (controller.signal.aborted) return;
      dialog.current?.close(); setChange(null);
      if (result.status === 'applied') {
        setMessage('Account updated.'); setRevision(value => value + 1); onAccountChanged?.();
      } else {
        setMessage(managementMessages[result.status]);
        if (result.status === 'denied') { setBlocked(true); setDenied(true); onAccountChanged?.(); }
        if (result.status === 'conflict') setRevision(value => value + 1);
      }
    } catch {
      if (!controller.signal.aborted) {
        dialog.current?.close(); setChange(null); setBlocked(true);
        setMessage('The outcome is unknown. Do not repeat the request. Ask an administrator to reconcile the account before continuing.');
      }
    } finally { if (active.current === controller) { active.current = null; setPending(false); } }
  }
  if (denied) return <p role="alert">Access denied. Your permissions may have changed.</p>;
  return <>
    {message && <p role="status" tabIndex={-1} ref={feedback}>{message}</p>}
    {managementApi && hasCapability(actor, capabilities.create) && <CreateUserForm key={revision} disabled={locked} onChange={requestChange} />}
    <ReadPanel key={cursor ?? 'first'} load={load}>{page => <>
      {page.items.length ? <ul aria-label="Users">{page.items.map(user => <li key={`${user.id}:${user.role}:${'disabled' in user ? user.disabled : 'unknown'}`}>
        <p>{user.id} · {user.role}{'disabled' in user ? ` · ${user.disabled ? 'Inactive' : 'Active'}` : ''}</p>
        {managementApi && 'disabled' in user && <UserActions target={user} actor={actor} capabilities={capabilities} disabled={locked} onChange={requestChange} />}
        {'disabled' in user && credentialActions?.(user)}
      </li>)}</ul> : <p>No users found.</p>}
      <button disabled={locked || cursors.length === 1} onClick={() => setCursors(value => value.slice(0, -1))}>Previous users</button>
      <button disabled={locked || !page.nextCursor || cursors.includes(page.nextCursor)} onClick={() => { if (page.nextCursor) setCursors(value => [...value, page.nextCursor]); }}>Next users</button>
    </>}</ReadPanel>
    <dialog ref={dialog} aria-labelledby="p3-management-confirm" onCancel={event => { event.preventDefault(); cancel(); }}>
      <h2 id="p3-management-confirm">Confirm account change</h2><p>{change && changeDescription(change)}</p>
      <p>The server checks your current permissions and protects the last active administrator.</p>
      <button disabled={pending} autoFocus onClick={cancel}>Cancel</button>
      <button disabled={pending} onClick={() => { void confirm(); }}>{pending ? 'Saving…' : 'Confirm change'}</button>
    </dialog>
  </>;
}
