import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from './App';
import { createBrowserProgressBinding } from './browser-progress';
import type { LessonRenderer } from './LessonSession';
import type { PersistedSessionServices, SessionProgressBinding } from './PersistedLesson';
import { AccountShell, type AccountState } from '../features/accounts';
import { AdminUsers } from '../features/administration';
import { ProfessorStudents } from '../features/professor';
import { ApplicationRequestError, createApplicationClient } from '../platform/application-client';
import { createIssuedProgressSender } from '../foundation/issued-progress';
import type { PracticeEvent, ProgressBatchResult } from '../contracts';
export type DurableProgressFactory = (actorId: string, sessionId: string, send: (events: readonly PracticeEvent[]) => Promise<ProgressBatchResult>) => SessionProgressBinding | Promise<SessionProgressBinding>;

/** A configured server activates the real account path. Missing policy never becomes an auth grant. */
export function LearningApplication({ renderLesson, progressFactory }: { renderLesson: LessonRenderer; progressFactory?: DurableProgressFactory }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [state, setState] = useState<AccountState>({ status: 'loading' });
  const client = useMemo(() => createApplicationClient(fetch, () => setState({ status: 'anonymous' })), []);
  const refresh = useCallback(async () => {
    try { setState({ status: 'authenticated', user: await client.me() }); }
    catch (error) { setState({ status: error instanceof ApplicationRequestError && error.status === 401 ? 'anonymous' : 'error' }); }
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
  const currentActor = useRef<string | null>(null); currentActor.current = user?.id ?? null;
  const services = useMemo<PersistedSessionServices | undefined>(() => user ? {
    actorId: user.id, commands: client.commands,
    progress: sessionId => {
      const send = createIssuedProgressSender({ issue: client.issue, send: client.send });
      return progressFactory ? progressFactory(user.id, sessionId, send) : createBrowserProgressBinding({
        actorId: user.id, sessionId, send, usage: client.usage, readFence: () => client.readFence(sessionId),
        isCurrentUser: () => currentActor.current === user.id,
      });
    },
  } : undefined, [user, client, progressFactory]);
  if (enabled === false) return <p role="alert">The account service is unavailable. Practice cannot open until it is configured.</p>;
  if (enabled === null) return <p role="status">Opening English practice…</p>;
  if (user?.role === 'student' && services) return <App key={JSON.stringify(user)} renderLesson={renderLesson} sessionServices={services} />;
  return <AccountShell state={state} loginApi={client.login} onAuthenticated={next => setState({ status: 'authenticated', user: next })}>
    {user?.role === 'administrator' ? <AdminUsers key={JSON.stringify(user)} user={user} capability="users:list" api={client.administration}
      managementApi={client.management} managementCapabilities={{ create: 'users:manage', changeRole: 'users:manage', deactivate: 'users:manage', reactivate: 'users:manage' }} onAccountChanged={() => { void refresh(); }} />
      : user?.role === 'professor' ? <ProfessorStudents key={JSON.stringify(user)} user={user} listCapability="students:list" progressCapability="students:feedback:read" api={client.professor} />
      : <p role="status">Practice synchronization is unavailable. Your saved work has not been discarded.</p>}
  </AccountShell>;
}
