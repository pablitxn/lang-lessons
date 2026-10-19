import { CredentialLinkActions } from './CredentialLinks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StudentApplication } from './StudentApplication';
import { createBrowserProgressBinding } from './browser-progress';
import type { LessonRenderer } from './LessonSession';
import type { PersistedSessionServices, SessionProgressBinding } from './PersistedLesson';
import { AccountShell, type AccountState } from '../features/accounts';
import { ProfileSettings } from '../features/accounts/ProfileSettings';
import { AdminUsers } from '../features/administration';
import { ProfessorStudents } from '../features/professor';
import { ApplicationRequestError, createApplicationClient } from '../platform/application-client';
import { createIssuedProgressSender } from '../foundation/issued-progress';
import type { CurrentUser, PracticeEvent, ProgressBatchResult } from '../contracts';
export type DurableProgressFactory = (actorId: string, sessionId: string, send: (events: readonly PracticeEvent[]) => Promise<ProgressBatchResult>) => SessionProgressBinding | Promise<SessionProgressBinding>;

/** A configured server activates the real account path. Missing policy never becomes an auth grant. */
export function LearningApplication({ renderLesson, progressFactory }: { renderLesson: LessonRenderer; progressFactory?: DurableProgressFactory }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [state, setState] = useState<AccountState>({ status: 'loading' });
  const authEpoch = useRef(0);
  const authenticationGeneration = useRef(0);
  const logoutActive = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const client = useMemo(() => createApplicationClient(fetch, () => {
    authenticationGeneration.current++; authEpoch.current++; setState({ status: 'anonymous' });
  }, () => authenticationGeneration.current), []);
  const refresh = useCallback(async () => {
    if (logoutActive.current) return;
    const epoch = ++authEpoch.current;
    try { const user = await client.me(); if (epoch === authEpoch.current && !logoutActive.current) setState({ status: 'authenticated', user }); }
    catch (error) { if (epoch === authEpoch.current && !logoutActive.current) setState({ status: error instanceof ApplicationRequestError && error.status === 401 ? 'anonymous' : 'error' }); }
  }, [client]);
  const signOut = useCallback(async () => {
    if (logoutActive.current) return;
    logoutActive.current = true; setSigningOut(true);
    authenticationGeneration.current++; authEpoch.current++;
    try {
      await client.signOut();
      authenticationGeneration.current++; authEpoch.current++;
      history.replaceState(null, '', '/');
      setState({ status: 'anonymous' });
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[autocomplete="username"]')?.focus());
    } finally { logoutActive.current = false; setSigningOut(false); }
  }, [client]);
  useEffect(() => {
    let alive = true;
    void client.json('/api/learning/config').then(value => {
      if (!value || typeof value !== 'object' || !('accountsEnabled' in value) || typeof value.accountsEnabled !== 'boolean') throw new Error('Invalid configuration');
      if (!alive) return; setEnabled(value.accountsEnabled); if (value.accountsEnabled) void refresh();
    }).catch(() => { if (alive) { setEnabled(true); setState({ status: 'error' }); } });
    return () => { alive = false; };
  }, [client, refresh]);
  const user = state.status === 'authenticated' ? state.user : null;
  const updateProfile = useCallback((next: CurrentUser) => {
    setState(previous => previous.status === 'authenticated' && previous.user.id === next.id
      ? { ...previous, user: { ...previous.user, ...(next.name !== undefined ? { name: next.name } : {}), ...(next.image !== undefined ? { image: next.image } : {}) } } : previous);
  }, []);
  const currentActor = useRef<string | null>(null); currentActor.current = user?.id ?? null;
  const services = useMemo<PersistedSessionServices | undefined>(() => user ? {
    actorId: user.id, commands: client.commands, enter: client.practice.enter, current: client.practice.current,
    reconcileClose: sessionId => client.recovery.reconcile(sessionId, 'finalize', new AbortController().signal).then(() => {}),
    reportCall: async (segment, intervals) => { await client.json('/api/learning/usage/client-call', { segment, intervals }, AbortSignal.timeout(5000)); },
    progress: (sessionId, mode) => {
      const send = createIssuedProgressSender({ issue: client.issue, send: client.send });
      return progressFactory ? progressFactory(user.id, sessionId, send) : createBrowserProgressBinding({
        actorId: user.id, sessionId, ...(mode ? { mode } : {}), send, usage: client.usage, readFence: () => client.readFence(sessionId),
        isCurrentUser: () => currentActor.current === user.id,
      });
    },
  } : undefined, [user?.id, client, progressFactory]);
  if (enabled === false) return <p role="alert">The account service is unavailable. Practice cannot open until it is configured.</p>;
  if (enabled === null) return <p role="status">Opening English practice…</p>;
  if (signingOut && !user) return <p role="status">Signing out…</p>;
  if (user?.role === 'student' && services) return <StudentApplication user={user} key={JSON.stringify([user.id, user.role, user.capabilities])} renderLesson={renderLesson} services={services} client={client} onSignOut={signOut} onProfileUpdated={updateProfile} />;
  return <AccountShell state={state} loginApi={client.login} onSignOut={signOut} profileSettings={user ? <ProfileSettings user={user} onSave={client.profile.update} onUpdated={updateProfile} /> : undefined} onAuthenticated={next => { authenticationGeneration.current++; authEpoch.current++; setState({ status: 'authenticated', user: next }); }}>
    <div inert={signingOut}>
    {user?.role === 'administrator' ? <AdminUsers key={JSON.stringify(user)} user={user} capability="users:list" api={client.administration}
      credentialActions={target => <CredentialLinkActions key={target.id} userId={target.id} email={target.email} credentialStatus={target.credentialStatus} disabled={target.disabled} json={client.json} />} managementApi={client.management} managementCapabilities={{ create: 'users:manage', changeRole: 'users:manage', deactivate: 'users:manage', reactivate: 'users:manage' }} onAccountChanged={() => { void refresh(); }} />
      : user?.role === 'professor' ? <ProfessorStudents key={JSON.stringify(user)} user={user} listCapability="students:list" progressCapability="students:feedback:read" api={client.professor} />
      : <p role="status">Practice synchronization is unavailable. Your saved work has not been discarded.</p>}
    </div>
  </AccountShell>;
}
