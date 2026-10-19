import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CurrentUser, PublicUser } from '../../contracts';
import { hasCapability, type Page, type ReadResult } from '../accounts/access';
import { ReadPanel } from '../accounts/ReadPanel';
import { changeDescription, CreateUserForm, UserActions } from './ManagementControls';
import { accountLabel, roleLabels, roleDescriptions, managementMessages, unboundManagement, type ManagedUser, type ManagementCapabilities, type UserChange, type UserManagementApi } from './management';
export interface AdminUsersApi { listUsers(cursor: string | null, signal: AbortSignal): Promise<ReadResult<Page<PublicUser | ManagedUser>>> }
export function AdminUsers({ user, capability = null, api = null, managementApi = null, managementCapabilities = unboundManagement, onAccountChanged, credentialActions }: {
  user: CurrentUser | null; capability?: string | null; api?: AdminUsersApi | null;
  managementApi?: UserManagementApi | null; managementCapabilities?: ManagementCapabilities;
  /** Root refreshes current actor/grants after a successful mutation, including self changes. */
  onAccountChanged?: () => void;
  credentialActions?: (user: ManagedUser) => ReactNode;
}) {
  return <section className="p3-admin"><header className="p3-admin-heading"><span className="p3-eyebrow">Administration</span><h1>People &amp; access</h1><p>A clear home for your learners, teachers and administrators.</p></header>
    {!hasCapability(user, capability) ? <p role="alert">Access denied.</p> : !api || !user ? <p role="status">User management is not available yet.</p> :
      <UserList key={JSON.stringify([user, capability, managementCapabilities])} actor={user} api={api} managementApi={managementApi} capabilities={managementCapabilities} onAccountChanged={onAccountChanged} credentialActions={credentialActions} />}
    <p className="p3-admin-footer">Accounts are created by an administrator. Deactivating an account keeps its learning records.</p></section>;
}
function UserList({ actor, api, managementApi, capabilities, onAccountChanged, credentialActions }: {
  actor: CurrentUser; api: AdminUsersApi; managementApi: UserManagementApi | null; capabilities: ManagementCapabilities; credentialActions: ((user: ManagedUser) => ReactNode) | undefined; onAccountChanged: (() => void) | undefined;
}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [revision, setRevision] = useState(0);
  const [change, setChange] = useState<UserChange | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState('');
  const active = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const cursor = cursors.at(-1) ?? null;
  const load = useCallback((signal: AbortSignal) => api.listUsers(cursor, signal), [api, cursor, revision]);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, [managementApi]);
  useEffect(() => { if (change) dialog.current?.showModal(); }, [change]);
  useEffect(() => { if (message) feedback.current?.focus(); }, [message]);
  const locked = pending || blocked;
  function requestChange(next: UserChange, name = '') { if (!locked) { setMessage(''); setDisplayName(name); setChange(next); } }
  function cancel() { if (!active.current) { dialog.current?.close(); setChange(null); } }
  async function confirm() {
    if (!change || !managementApi || active.current || locked) return;
    const controller = new AbortController(); active.current = controller; setPending(true);
    try {
      const result = await managementApi.apply(change, controller.signal);
      if (controller.signal.aborted) return;
      dialog.current?.close(); setChange(null);
      if (result.status === 'applied') {
        setMessage(change.kind === 'create' ? `Account created for ${change.email}. Find their account, create a password setup link and share it directly. No email has been sent.` : 'Account updated.');
        if (change.kind === 'create') { setQuery(''); setCursors([null]); }
        setRevision(value => value + 1); onAccountChanged?.();
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
    {message && <p className="p3-feedback" role="status" tabIndex={-1} ref={feedback}>{message}</p>}
    <div className={`p3-admin-layout${managementApi && hasCapability(actor, capabilities.create) ? '' : ' p3-admin-layout-list-only'}`}>
      <section className="p3-people-panel" aria-label="Account directory"><div className="p3-directory-heading"><h2>All accounts</h2><label className="p3-directory-search"><span className="p3-field-help">Find on this page</span><input type="search" aria-label="Find accounts on this page" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Search email or account type" /></label></div>
        <ReadPanel key={cursor ?? 'first'} load={load}>{page => {
          const normalizedQuery = query.trim().toLowerCase();
          const shown = page.items.filter(user => `${accountLabel(user)} ${roleLabels[user.role]}`.toLowerCase().includes(normalizedQuery));
          return <>
            {shown.length ? <ul className="p3-user-list" aria-label="Users">{shown.map(user => <li className="p3-user-card" key={`${user.id}:${user.role}:${'disabled' in user ? user.disabled : 'unknown'}`}>
              <div className="p3-user-card-heading"><span className="p3-person-avatar" aria-hidden="true">{('email' in user && typeof user.email === 'string' ? user.email[0] : roleLabels[user.role][0])?.toUpperCase()}</span><div className="p3-user-card-identity"><h3>{accountLabel(user)}</h3><div className="p3-user-badges"><span className="p3-role-badge">{roleLabels[user.role]}</span>{user.id === actor.id && <span className="p3-you-badge">You</span>}{'disabled' in user && <span className={`p3-status-badge${user.disabled ? ' p3-status-inactive' : ''}`}>{user.disabled ? 'Inactive' : 'Active'}</span>}</div></div></div>
              <p className="p3-user-description">{roleDescriptions[user.role]}</p>
              {'credentialStatus' in user && (user.credentialStatus === 'ready' || user.credentialStatus === 'setup-required') && <p className={`p3-credential-status${user.credentialStatus === 'setup-required' ? ' p3-setup-needed' : ''}`}>{user.credentialStatus === 'ready' ? ('disabled' in user && user.disabled ? 'Password set' : 'Password set · ready to sign in') : 'Password not set · setup link needed'}</p>}
              {managementApi && 'disabled' in user && <UserActions target={user} actor={actor} capabilities={capabilities} disabled={locked} onChange={requestChange} />}
              {'disabled' in user && credentialActions && <fieldset className="p3-credential-controls" disabled={locked}>{credentialActions(user)}</fieldset>}
              <details className="p3-technical-details"><summary>Technical details</summary><p>Account ID</p><code>{user.id}</code></details>
            </li>)}</ul> : <p className="p3-empty-accounts">{page.items.length ? 'No accounts match this search on the current page.' : 'No accounts yet. Create a student account to get started.'}</p>}
            <nav className="p3-pagination" aria-label="Account pages"><button className="p3-secondary-button" disabled={locked || cursors.length === 1} onClick={() => { setQuery(''); setCursors(value => value.slice(0, -1)); }}>Previous users</button><span>Page {cursors.length}</span><button className="p3-secondary-button" disabled={locked || !page.nextCursor || cursors.includes(page.nextCursor)} onClick={() => { if (page.nextCursor) { setQuery(''); setCursors(value => [...value, page.nextCursor]); } }}>Next users</button></nav>
          </>;
        }}</ReadPanel>
      </section>
      {managementApi && hasCapability(actor, capabilities.create) && <CreateUserForm key={revision} disabled={locked} onChange={requestChange} />}
    </div>
    <dialog ref={dialog} aria-labelledby="p3-management-confirm" onCancel={event => { event.preventDefault(); cancel(); }}>
      <span className="p3-eyebrow">Review this change</span><h2 id="p3-management-confirm">{change?.kind === 'create' ? 'Create this account?' : 'Update account access?'}</h2><p>{change && changeDescription(change, displayName)}</p>
      {change?.kind !== 'create' && <p className="p3-field-help">The last active administrator cannot be removed.</p>}
      <div className="p3-dialog-actions"><button className="p3-secondary-button" disabled={pending} autoFocus onClick={cancel}>Cancel</button><button className="p3-primary-button" disabled={pending} onClick={() => { void confirm(); }}>{pending ? 'Saving…' : 'Confirm change'}</button></div>
    </dialog>
  </>;
}
