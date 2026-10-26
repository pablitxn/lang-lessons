# Application and lesson layouts

Generated 2026-10-24 from the local working tree on `codex/exercise-feedback`, base `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. This discovery snapshot includes in-progress changes. It is design context, not a release or runtime receipt. No secrets, local account configuration, model generation, or external assets were inspected.

The authenticated student path is `main -> LearningApplication -> StudentApplication -> App -> PersistedLesson -> LessonSession -> feature`. App owns the header, catalog, breadcrumb, theme preference and modal entrypoint. LessonSession supplies the scrolling lesson panel and voice controls. `PracticeLayout` is fully copied in `components.md` and is not duplicated here.

## `src/main.tsx`

Actual root composition and feature dispatch, including the separate credential-redemption route.

SHA-256: `ea112056b235f0af5892f8a711db9a298d2fe42754650c8ac276026e44556249`

```tsx
import { CredentialRedemption } from './app/CredentialLinks';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LearningApplication } from './app/LearningApplication';
import { SentenceLesson } from './features/sentences';
import { VerbLesson } from './features/verbs';

const credentialPage = location.pathname === '/account/credentials';
let credentialToken: string | null = null;
if (credentialPage) {
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  credentialToken = token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  history.replaceState(null, '', location.pathname);
}
createRoot(document.getElementById('root')!).render(<StrictMode>{credentialPage ? <CredentialRedemption token={credentialToken} /> : <LearningApplication renderLesson={(mode, props) => mode === 'sentence'
  ? <SentenceLesson {...props} /> : <VerbLesson {...props} mode={mode} />} />}</StrictMode>);
```

## `src/app/LearningApplication.tsx`

Authenticated application composition and role routing; no credential values exist in this source.

SHA-256: `6d7e49acb9e211c141d0265c95c6b832f4494ec9bb568abd93b62429051c5d61`

```tsx
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
    progress: (sessionId, mode, language) => {
      const send = createIssuedProgressSender({ issue: client.issue, send: client.send });
      return progressFactory ? progressFactory(user.id, sessionId, send) : createBrowserProgressBinding({
        actorId: user.id, sessionId, language: language ?? 'en', ...(mode ? { mode } : {}), send, usage: client.usage, readFence: () => client.readFence(sessionId),
        isCurrentUser: () => currentActor.current === user.id,
      });
    },
  } : undefined, [user?.id, client, progressFactory]);
  if (enabled === false) return <p role="alert">The account service is unavailable. Practice cannot open until it is configured.</p>;
  if (enabled === null) return <p role="status">Opening Lang Lessons…</p>;
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
```

## `src/app/StudentApplication.tsx`

Student wrapper passing account preferences, profile and session services to App.

SHA-256: `adf917caccae9aaeaf2e6e7542dc411fe725aeee313325f68edabbcd25f124cd`

```tsx
import { ProfileSettings } from '../features/accounts/ProfileSettings';
import type { CurrentUser } from '../contracts';
import { App } from './App';
import type { LessonRenderer } from './LessonSession';
import type { PersistedSessionServices } from './PersistedLesson';
import type { createApplicationClient } from '../platform/application-client';

export function StudentApplication({ services, client, renderLesson, user, onSignOut, onProfileUpdated }: {
  user: CurrentUser; services: PersistedSessionServices; client: ReturnType<typeof createApplicationClient>; renderLesson: LessonRenderer;
  onSignOut: () => Promise<void>; onProfileUpdated: (user: CurrentUser) => void;
}) {
  return <App renderLesson={renderLesson} sessionServices={services} onSignOut={onSignOut} accountEmail={user.email}
    account={user} preferencesApi={client.preferences}
    profileSettings={<ProfileSettings user={user} onSave={client.profile.update} onUpdated={onProfileUpdated} />} />;
}
```

## `src/app/App.tsx`

Full shared application shell: header, logo, profile button, hash lesson breadcrumb, catalog, preference modal and theme effect.

SHA-256: `5703c75f6fb9c134f398d3f2e73469e29a7c300ad22d4def3dc84f85a68efed9`

```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type CurrentUser, type LearnerSettings, type LearningLanguage, type LessonMode } from '../contracts';
import { browserStorage, loadSettings, saveSettings } from '../platform/settings-store';
import { createAccountSettings, type AccountSettingsApi } from '../platform/account-settings';
import { MODES, modeHref, resolveLessonRoute } from './routes';
import { LessonSession, type LessonRenderer } from './LessonSession';
import { PersistedLesson, type PersistedSessionServices } from './PersistedLesson';
import { Preferences } from './Preferences';
import { LessonDialog, ReferenceTable } from '../ui/mobile';
import { LessonToolsVisible } from '../ui/mobile/lesson-tools-context';
import { getTenseGuide } from '../content/tense-guide';
import { createRootNavigator } from './root-navigation';
import { RootExitRegistration, type RegisterRootExit } from './navigation-context';
import './global.css';
const noHold = () => {};

export interface AppProps {
  lessons?: Partial<Record<LessonMode, ReactNode>>; renderLesson?: LessonRenderer;
  /** Enable when P4 is integrated; no registered exit ports then means fail closed. */
  requireExitRegistration?: boolean;
  /** Supplied only after the owning feature/server authorizes its data. No access grant here. */
  homeProgress?: ReactNode;
  sessionServices?: PersistedSessionServices;
  homeContent?: ReactNode;
  onSignOut?: () => Promise<void>;
  accountEmail?: string | undefined;
  account?: CurrentUser;
  profileSettings?: ReactNode;
  preferencesApi?: AccountSettingsApi;
}
export function App({ lessons = {}, renderLesson, requireExitRegistration = false, homeProgress, sessionServices, homeContent, onSignOut, accountEmail, account, profileSettings, preferencesApi }: AppProps) {
  const [settings, setSettings] = useState(() => preferencesApi ? { ...DEFAULT_SETTINGS, difficulty: { ...DEFAULT_SETTINGS.difficulty } } : loadSettings(browserStorage()));
  const [settingsReady, setSettingsReady] = useState(!preferencesApi);
  const [sessionLanguage, setSessionLanguage] = useState<LearningLanguage>(settings.learningLanguage);
  const languageSwitchPending = useRef(false);
  const accountSettings = useRef<ReturnType<typeof createAccountSettings> | null>(null);
  const [mode, setMode] = useState(() => resolveLessonRoute(window.location.hash));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceStatusTarget, setVoiceStatusTarget] = useState<HTMLDivElement | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!account || !preferencesApi) return;
    const controller = createAccountSettings({ accountId: account.id, api: preferencesApi, storage: browserStorage() });
    accountSettings.current = controller;
    let alive = true;
    const update = () => { const next = controller.getSnapshot(); setSettings(next.settings); setNotice(next.notice); };
    const unsubscribe = controller.subscribe(update);
    const sync = () => { void controller.sync(); };
    const visible = () => { if (document.visibilityState === 'visible') sync(); };
    update(); void controller.sync().finally(() => {
      if (!alive) return;
      setSessionLanguage(controller.getSnapshot().settings.learningLanguage);
      setSettingsReady(true);
    });
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false;
      window.removeEventListener('online', sync); document.removeEventListener('visibilitychange', visible);
      unsubscribe(); controller.dispose(); accountSettings.current = null;
    };
  }, [account?.id, preferencesApi]);
  const current = MODES.find(item => item.id === mode);
  const modeRef = useRef(mode); modeRef.current = mode;
  const requireGuard = useRef(requireExitRegistration); requireGuard.current = requireExitRegistration || Boolean(sessionServices);
  const guard = useRef<null | ((hash: string) => Promise<string | null>)>(null);
  const navigator = useRef<ReturnType<typeof createRootNavigator> | null>(null);
  const [navigationError, setNavigationError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const signOutPending = useRef(false);
  const logoutNavigation = useRef(false);
  const registerExit = useCallback<RegisterRootExit>(handler => {
    let alive = true;
    const registered = async (hash: string) => {
      const approved = await handler(hash);
      return alive && guard.current === registered ? approved : null;
    };
    guard.current = registered;
    return () => { alive = false; if (guard.current === registered) guard.current = null; };
  }, []);

  useEffect(() => {
    const routing = createRootNavigator(window, hash => {
      modeRef.current = resolveLessonRoute(hash);
      setNavigationError(''); setMode(modeRef.current);
      requestAnimationFrame(() => document.getElementById('lesson')?.focus());
    }, async hash => {
      if (signOutPending.current && (!logoutNavigation.current || hash !== '#/')) return null;
      setNavigationError('');
      if (!modeRef.current) return hash;
      if (guard.current) return guard.current(hash);
      if (requireGuard.current) { setNavigationError('Please wait until your lesson is ready to close.'); return null; }
      return hash; // Existing runtime until P4's separately reviewed integration enables the guard.
    }, () => setNavigationError('Your lesson is still open. Please try leaving again.'));
    navigator.current = routing;
    return () => { routing.dispose(); navigator.current = null; };
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      document.documentElement.dataset.theme = settings.theme === 'system' ? (query.matches ? 'dark' : 'light') : settings.theme;
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [settings.theme]);

  function persistSettings(next: LearnerSettings) {
    if (accountSettings.current) { accountSettings.current.update(next); return; }
    setSettings(next);
    setNotice(saveSettings(next, browserStorage()) ? 'Preferences saved on this device.' : 'Preferences changed for this visit. Device storage is unavailable.');
  }
  async function updateSettings(next: LearnerSettings) {
    if (languageSwitchPending.current) return;
    if (next.learningLanguage !== settings.learningLanguage && modeRef.current) {
      languageSwitchPending.current = true;
      setSettingsOpen(false);
      try {
        const exited = await navigator.current?.request('#/');
        if (!exited || modeRef.current) return;
        setSessionLanguage(next.learningLanguage);
        const latest = accountSettings.current?.getSnapshot().settings ?? settings;
        persistSettings({ ...latest, learningLanguage: next.learningLanguage, sentenceTense: next.sentenceTense });
        setSettingsOpen(true);
      } finally { languageSwitchPending.current = false; }
      return;
    }
    persistSettings(next);
  }
  useEffect(() => {
    if (!settingsReady || !mode) { setSessionLanguage(settings.learningLanguage); return; }
    // A preference synced from another device must not replace a mounted curriculum.
    if (settings.learningLanguage !== sessionLanguage && !languageSwitchPending.current) {
      languageSwitchPending.current = true;
      void navigator.current?.request('#/').finally(() => { languageSwitchPending.current = false; });
    }
  }, [settings.learningLanguage, settingsReady, mode, sessionLanguage]);
  const learningSettings = mode ? { ...settings, learningLanguage: sessionLanguage } : settings;
  const french = learningSettings.learningLanguage === 'fr';
  async function signOut() {
    if (!onSignOut || signOutPending.current) return;
    signOutPending.current = true; setSigningOut(true); setNavigationError('');
    setSettingsOpen(false);
    try {
      // Use the same explicit close/flush guard as All lessons before revoking the cookie.
      if (modeRef.current) {
        logoutNavigation.current = true;
        const exited = await navigator.current?.request('#/');
        logoutNavigation.current = false;
        if (!exited || modeRef.current) return;
      }
      await onSignOut();
    } catch { setNavigationError('Could not sign out. Please try again.'); }
    finally { logoutNavigation.current = false; signOutPending.current = false; setSigningOut(false); }
  }

  return <RootExitRegistration.Provider value={registerExit}><div className="app-shell" data-lesson={mode || undefined} onClickCapture={event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#/"]') : null;
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
    if (signOutPending.current) { event.preventDefault(); return; }
    event.preventDefault(); void navigator.current?.request(anchor.hash);
  }}>
    <a href="#lesson" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('lesson')?.focus(); }}>Skip to lesson</a>
    <header className="app-header">
      <a className="brand" href="#/" aria-label={french ? "Inicio de práctica de francés" : "English practice home"}>
        <span className="brand-mark" aria-hidden="true">{french ? 'f.' : 'e.'}</span><span>{french ? 'Práctica de francés' : 'English practice'}</span>
      </a>
      <div className="app-header-actions">
        <div ref={setVoiceStatusTarget} className="header-voice-status" />
        <button id="profile-preferences" className="profile-avatar" aria-label="Preferences" title="Preferences"
          aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}>
          {account?.image ? <img src={account.image} alt="" /> : <span aria-hidden="true">{(account?.name || accountEmail || 'Aa').slice(0, 2).toUpperCase()}</span>}
        </button>
      </div>
    </header>
    {navigationError && <p role="alert">{navigationError}</p>}
    <main id="lesson" tabIndex={-1}>
      {!settingsReady ? <p role="status">Cargando preferencias…</p> : mode && current ? <>
        <div className="lesson-heading">
          <a className="back-link" href="#/" aria-label="All lessons">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 6-6 6 6 6M4 12h16" /></svg>
            All lessons
          </a>
          <span className="lesson-heading-divider" aria-hidden="true">/</span>
          <h1 aria-label={current.title}>{current.short}</h1>
        </div>
        <LessonToolsVisible.Provider value={false}>{sessionServices ?
          <PersistedLesson key={`${sessionServices.actorId}:${sessionLanguage}:${mode}`} mode={mode} services={sessionServices} settings={learningSettings}
            preferencesOpen={settingsOpen} voiceStatusTarget={voiceStatusTarget} renderLesson={renderLesson}
            fallback={lessons[mode] ?? <p>This lesson is unavailable.</p>} /> :
          <LessonSession key={`${sessionLanguage}:${mode}`} mode={mode} settings={learningSettings} preferencesOpen={settingsOpen} voiceStatusTarget={voiceStatusTarget}
            renderLesson={renderLesson} fallback={lessons[mode] ?? <p>This lesson is unavailable.</p>} />}</LessonToolsVisible.Provider>
      </> : <section className="lesson-catalog" aria-labelledby="catalog-title" inert={signingOut}>
        <div className="catalog-heading"><h1 id="catalog-title">{french ? 'Elegí una clase de francés' : 'Choose a lesson'}</h1><p>{french ? 'Practicá desde el español. Podés escribir y usar el tutor de voz cuando quieras.' : 'Pick a lesson and start writing. The voice tutor is optional.'}</p></div>
        <nav className="lesson-cards" aria-label="Lessons">
          {MODES.map((item, index) => <a className={`lesson-card lesson-card-${item.id}`} key={item.id}
            href={modeHref(item.id)} aria-label={`Start ${item.title}`} onClick={() => updateSettings({ ...settings, preferredMode: item.id })}>
            <div className="lesson-card-art" aria-hidden="true">
              {item.id === 'verb-image' ? <div className="verb-card-forms picture-card-words"><span>{french ? 'voir' : 'see'}</span><span>{french ? 'penser' : 'think'}</span><span>{french ? 'dire' : 'say'}</span></div> : item.id === 'verb-visible'
                ? <div className="verb-card-forms"><span>{french ? 'aller' : 'go'}</span><span>{french ? 'je vais' : 'went'}</span><span>{french ? 'allé' : 'gone'}</span></div>
                : <div className="sentence-card-words"><span>Hola.</span><span>{french ? 'Bonjour.' : 'Hello.'}</span></div>}
            </div>
            <div className="lesson-card-copy"><span className="eyebrow">Lesson 0{index + 1}</span><h2>{french ? ({'verb-image':'Imágenes','verb-visible':'Verbos','sentence':'Frases'}[item.id]) : item.short}</h2><p>{french ? ({'verb-image':'Reconocé la acción y practicá las formas del verbo francés.','verb-visible':'Practicá el presente y el participio de 25 verbos irregulares.','sentence':'Traducí del español al francés y explicá la construcción.'}[item.id]) : item.description}</p>
              <span className="lesson-card-start">Start lesson <span aria-hidden="true">↗</span></span></div>
          </a>)}
        </nav>
        {homeContent}
        <nav className="home-tools ll-mobile" aria-label="Learning tools">
          <LessonDialog title="Progress" triggerLabel="Your progress" triggerText="Progress" triggerIcon="progress"
            closeLabel="Close progress" onHoldChange={noHold}>
            {homeProgress ?? <p>No saved progress is available here yet.</p>}
          </LessonDialog>
          <ReferenceTable title="Reference" caption={french ? "Referencia de tiempos franceses" : "English tense reference"} columns={['Tense', 'Structure and use']}
            rows={getTenseGuide(learningSettings.learningLanguage).map(item => [item.label, item.guidance])} onHoldChange={noHold} />
        </nav>
      </section>}
    </main>
    {settingsOpen && <Preferences settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} notice={notice}
      profile={profileSettings} onSignOut={onSignOut ? () => void signOut() : undefined} signingOut={signingOut} />}
  </div></RootExitRegistration.Provider>;
}
```

## `src/app/LessonSession.tsx`

Full visible lesson panel composition with a single voice runtime and current feature.

SHA-256: `6586bbfb0b4cedef2db29e0569da6e1aeb8ee26199923db773c73d55b5b71c80`

```tsx
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ActivePractice, LearnerSettings, LessonMode, LessonModuleProps, VoiceAdapter, VoiceState } from '../contracts';
import { createRealtimeVoiceAdapter } from '../voice/realtime';
import { checkVoiceAvailability, createSessionRuntime } from './session-runtime';
import { createSessionLifecycle, type SessionLifecycle, type SessionLifecyclePorts } from './session-lifecycle';
import { SessionExitDialog } from './SessionExitDialog';
import { VoiceStatus } from './VoiceStatus';

const idleLifecycle = { frozen: false, callStarting: false, error: '', callError: '' };
const idleSubscribe = () => () => {};
const idleSnapshot = () => idleLifecycle;

export interface ComposedLessonProps extends LessonModuleProps {
  writtenPractice?: import('../features/progress/written-snapshot').WrittenPracticeBinding;
  writtenActivity?: import('../features/progress/use-written-activity').WrittenActivityBinding;
  connectionState: VoiceState; microphoneMuted: boolean; onStartVoice: () => void; onStopVoice: () => void;
  claimUtterance: (utteranceId: string) => void;
  sessionControls: ReactNode;
  rootVoiceError: string;
}
export type LessonRenderer = (mode: LessonMode, props: ComposedLessonProps) => ReactNode;
export function LessonSession({ mode, settings, preferencesOpen, renderLesson, fallback, voiceAdapter, voiceStatusTarget = null, sessionId, lifecyclePorts, registerLifecycle, initialCallState = 'none', endRestoredCall, checkRestoredCall, syncStatus }: {
  mode: LessonMode; settings: LearnerSettings; preferencesOpen: boolean;
  renderLesson?: LessonRenderer | undefined; fallback: ReactNode;
  /** Internal fixture seam. The application always creates the live adapter. */
  voiceAdapter?: VoiceAdapter;
  voiceStatusTarget?: HTMLElement | null;
  sessionId?: string;
  lifecyclePorts?: SessionLifecyclePorts;
  registerLifecycle?: (lifecycle: SessionLifecycle | null) => void;
  initialCallState?: ActivePractice['callState'];
  endRestoredCall?: () => Promise<void>;
  checkRestoredCall?: () => Promise<ActivePractice['callState']>;
  syncStatus?: ReactNode;
}) {
  const [restoredCall, setRestoredCall] = useState(initialCallState);
  const [restoredCallBusy, setRestoredCallBusy] = useState(false);
  const [restoredCallError, setRestoredCallError] = useState('');
  const mounted = useRef(false);
  const restoredCallPending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function resolveRestoredCall(end: boolean) {
    if (restoredCallPending.current) return;
    restoredCallPending.current = true; setRestoredCallBusy(true); setRestoredCallError('');
    try {
      if (end) {
        if (!endRestoredCall) throw new Error('Call cleanup is unavailable');
        await endRestoredCall();
      }
      if (!checkRestoredCall) throw new Error('Call status is unavailable');
      const state = await checkRestoredCall();
      if (mounted.current) setRestoredCall(state);
    } catch {
      if (mounted.current) setRestoredCallError('The call could not be confirmed as ended. Check its status or try ending it again.');
    } finally { restoredCallPending.current = false; if (mounted.current) setRestoredCallBusy(false); }
  }
  const [runtime] = useState(() => createSessionRuntime(voiceAdapter ?? createRealtimeVoiceAdapter(), sessionId ?? crypto.randomUUID(), {
    prepareConnection: checkVoiceAvailability,
  }));
  const [lifecycle] = useState(() => lifecyclePorts ? createSessionLifecycle(runtime, lifecyclePorts, { prepareConnection: checkVoiceAvailability }) : null);
  const [availability, setAvailability] = useState<{ ready: boolean; checking: boolean; error: string }>({ ready: false, checking: true, error: '' });
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const availabilityRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController(); availabilityRequest.current = abort;
    setAvailability({ ready: false, checking: true, error: '' });
    void checkVoiceAvailability(abort.signal).then(() => {
      if (!abort.signal.aborted) {
        lifecycle?.clearCallError();
        setAvailability({ ready: true, checking: false, error: '' });
      }
    }).catch(error => {
      if (!abort.signal.aborted) setAvailability({ ready: false, checking: false, error: error instanceof Error ? error.message : 'Voice is unavailable. Please try again.' });
    });
    return () => { abort.abort(); if (availabilityRequest.current === abort) availabilityRequest.current = null; };
  }, [availabilityAttempt, lifecycle]);
  useEffect(() => {
    const refresh = () => { if (runtime.getSnapshot().state !== 'ready') setAvailabilityAttempt(value => value + 1); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [runtime]);
  useEffect(() => {
    lifecycle?.activate();
    registerLifecycle?.(lifecycle);
    return () => { registerLifecycle?.(null); lifecycle?.dispose(); };
  }, [lifecycle, registerLifecycle]);
  const lifecycleState = useSyncExternalStore(lifecycle?.subscribe ?? idleSubscribe, lifecycle?.getSnapshot ?? idleSnapshot);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useEffect(() => {
    if (!lifecycleState.callError) return;
    // The start-time check is newer than a cached ready result. Ignore any
    // background response that could otherwise re-enable this unavailable call.
    availabilityRequest.current?.abort();
    setAvailability({ ready: false, checking: false, error: lifecycleState.callError });
  }, [lifecycleState.callError]);
  useEffect(() => {
    // A failed connection may coincide with a service outage. Recheck readiness
    // without reconnecting, while preserving the transport error for the learner.
    if (state.state === 'error' && state.error) setAvailabilityAttempt(value => value + 1);
  }, [state.state, state.error]);
  const start = () => {
    if (restoredCall === 'none' && availability.ready && runtime.getSnapshot().contextReady) void (lifecycle ? lifecycle.start() : runtime.start()).catch(() => { /* The runtime exposes the current connection error. */ });
  };
  useEffect(() => {
    window.addEventListener('pagehide', runtime.stop);
    return () => { window.removeEventListener('pagehide', runtime.stop); runtime.stop(); };
  }, [runtime]);
  useEffect(() => { runtime.hold('root-preferences', preferencesOpen); }, [runtime, preferencesOpen]);

  const connecting = state.state === 'connecting' || state.state === 'reconnecting';
  const active = restoredCall !== 'none' || lifecycleState.callStarting || connecting || state.state === 'ready';
  const error = lifecycleState.error || lifecycleState.callError || state.error || availability.error;
  const status = restoredCall !== 'none' ? 'A tutor call is still open. You can keep writing or end it.' : !state.contextReady ? 'Prepare an exercise to start the optional tutor.' : error || (state.paused ? 'Tutor stopped' : connecting ? 'Connecting voice…'
    : state.state !== 'ready' ? 'Tutor is optional. Practice or start a call.' : state.muted ? 'Microphone muted'
      : state.assistantSpeaking ? 'Your coach is speaking' : state.learnerSpeaking ? 'Listening to you' : 'Ready to talk');
  const callLabel = active ? 'Stop tutor' : availability.checking ? 'Checking voice availability' : !availability.ready ? 'Voice unavailable' : 'Start tutor';
  const toggle = <button type="button" className={`voice-status-badge${active ? ' voice-status-active' : ''}`} aria-label={callLabel} title={active ? 'End call' : error || callLabel}
    aria-pressed={active} disabled={restoredCallBusy || lifecycleState.frozen || (!active && (!state.contextReady || !availability.ready || Boolean(lifecycleState.error)))}
    onClick={restoredCall !== 'none' ? () => void resolveRestoredCall(true) : active ? () => { if (lifecycle) void lifecycle.stop(); else runtime.pause(); } : start}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {active ? <path d="M4 16v-4m16 4v-4M2 13c5-7 15-7 20 0v4h-6v-5M8 12v5H2" />
        : <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.79a2 2 0 0 1-.45 2.11L8.08 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.33 1.83.56 2.79.69A2 2 0 0 1 22 16.92Z" />}
    </svg>
  </button>;
  const sessionControls = <div className="voice-call-actions ll-actions" role="group" aria-label="Voice call controls">
    <button type="button" className="ll-button" disabled={state.state !== 'ready'} aria-pressed={state.muted}
      onClick={() => runtime.voice.setMuted(!state.muted)}>{state.muted ? 'Unmute microphone' : 'Mute microphone'}</button>
  </div>;
  const lesson = renderLesson?.(mode, { settings, voice: runtime.voice, sessionId: runtime.sessionId, onComplete: () => {},
    connectionState: state.state, microphoneMuted: state.muted, onStartVoice: start, onStopVoice: () => { if (lifecycle) void lifecycle.stop(); else runtime.pause(); },
    claimUtterance: runtime.claimUtterance, sessionControls, rootVoiceError: '' });
  return <div className="lesson-workspace">
    <section className="lesson-panel panel" aria-label="Current exercise" tabIndex={0}>
      {lifecycle && <SessionExitDialog lifecycle={lifecycle} />}
      <div inert={lifecycleState.frozen}>
        <VoiceStatus status={status} ready={state.state === 'ready'} active={restoredCall === 'none' && active}
          controls={sessionControls} toggle={toggle} target={voiceStatusTarget} />
        {restoredCall !== 'none' && <div className="voice-call-notice"><p className="voice-call-error" role="status">{restoredCallError || status}</p>
          <button className="quiet-button" disabled={restoredCallBusy} onClick={() => void resolveRestoredCall(false)}>Check call status</button>
        </div>}
        {error && !active && <div className="voice-call-notice"><p className="voice-call-error" role="status">{error}</p>
          {!lifecycleState.error && <button type="button" className="quiet-button" disabled={availability.checking} onClick={() => setAvailabilityAttempt(value => value + 1)}>Check voice availability</button>}
          {lifecycleState.error && !lifecycleState.frozen && <button type="button" className="quiet-button" onClick={() => { void lifecycle?.stop(); }}>Check call status</button>}
        </div>}
        {lesson ?? fallback}
      </div>
      {syncStatus}
    </section>
  </div>;
}
```

## `src/app/PersistedLesson.tsx`

Durable practice lifecycle wrapper around the lesson session.

SHA-256: `4aadd8eabe4886edfd68f31b757aa691e4c97edeee3a065e405fa52ca6862f75`

```tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ActivePractice, LearnerSettings, LearningLanguage, LessonMode, ProgressSink, SessionCommands } from '../contracts';
import { LessonSession, type LessonRenderer } from './LessonSession';
import type { SessionLifecycle } from './session-lifecycle';
import { useRootExitRegistration } from './navigation-context';
import type { WrittenActivityBinding } from '../features/progress/use-written-activity';

export interface SessionProgressBinding {
  sink: ProgressSink; canWrite(): boolean; freezeWrites(): void; releasePreparation(): void;
  writtenPractice?: import('../features/progress/written-snapshot').WrittenPracticeBinding;
  writtenActivity?: WrittenActivityBinding; status?: ReactNode; dispose?(): void;
}
export interface PersistedSessionServices {
  readonly actorId: string;
  readonly commands: SessionCommands;
  enter?(input: { mode: LessonMode; language?: LearningLanguage; operationId: string }): Promise<ActivePractice>;
  current?(): Promise<ActivePractice | null>;
  reconcileClose?(sessionId: string): Promise<void>;
  reportCall?(segment: import('../contracts').CallSegmentRef, intervals: readonly { start: string; end: string }[]): Promise<void>;
  progress(sessionId: string, mode?: LessonMode, language?: LearningLanguage): SessionProgressBinding | Promise<SessionProgressBinding>;
}
/** Enter atomically selects the saved practice before mounting any producer. */
export function PersistedLesson({ mode, services, ...props }: {
  mode: LessonMode; services: PersistedSessionServices; settings: LearnerSettings; preferencesOpen: boolean;
  voiceStatusTarget: HTMLElement | null; renderLesson?: LessonRenderer | undefined; fallback: ReactNode;
}) {
  const language = props.settings.learningLanguage;
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [prepared, setPrepared] = useState<ActivePractice & { progress: SessionProgressBinding } | null>(null);
  const [blockingCall, setBlockingCall] = useState<ActivePractice | null>(null);
  const [endingCall, setEndingCall] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<Promise<ActivePractice & { progress: SessionProgressBinding }> | null>(null);
  const lifetime = useRef(0);
  useEffect(() => {
    let current = true; const generation = ++lifetime.current; setFailed(false); setBlockingCall(null);
    pending.current ??= (services.enter ? services.enter({ mode, language, operationId }) : services.commands.create({ mode, language, operationId }).then(session => ({ session, callState: 'none' as const }))).then(async entry => {
      const { session } = entry;
      if (session.mode !== mode || (session.language ?? 'en') !== language || session.status !== 'open' || !session.sessionId) throw new Error('Canonical session mismatch');
      return { ...entry, progress: await services.progress(session.sessionId, mode, session.language ?? 'en') };
    });
    const work = pending.current;
    void work.then(({ session: value, progress, callState }) => {
      if (value.mode !== mode || (value.language ?? 'en') !== language || value.status !== 'open' || !value.sessionId) throw new Error('Canonical session mismatch');
      if (current) setPrepared({ session: value, progress, callState });
    }).catch(async () => {
      if (!current) return;
      pending.current = null;
      try {
        const active = await services.current?.();
        if (current && active && active.callState !== 'none') setBlockingCall(active);
      } catch { /* A failed read must not invent an active call. */ }
      if (current) setFailed(true);
    });
    return () => { current = false; queueMicrotask(() => {
      if (generation === lifetime.current) void work.then(value => value.progress.dispose?.()).catch(() => {});
    }); };
  }, [services, mode, language, operationId]);
  function retryEntry() { pending.current = null; setOperationId(crypto.randomUUID()); }
  const register = useRootExitRegistration();
  useEffect(() => {
    if (!prepared && failed) return register?.(async destination => endingCall ? null : destination);
  }, [register, prepared, failed, endingCall]);
  async function endBlockingCall() {
    if (!blockingCall || endingCall || !services.reconcileClose) return;
    setEndingCall(true);
    try { await services.reconcileClose(blockingCall.session.sessionId); retryEntry(); }
    catch { setFailed(true); }
    finally { setEndingCall(false); }
  }
  if (!prepared && blockingCall) return <div className="voice-call-notice" role="status">
    <p>A tutor call is still open. End it before switching exercises.</p>
    <button className="quiet-button" disabled={endingCall} onClick={() => void endBlockingCall()}>{endingCall ? 'Ending call…' : 'End current call'}</button>
    <button className="quiet-button" disabled={endingCall} onClick={retryEntry}>Check call status</button>
  </div>;
  if (!prepared) return failed ? <div role="alert"><p>The lesson could not be opened. Your previous work has not been discarded.</p>
    <button onClick={retryEntry}>Try opening lesson again</button></div> : <p role="status">Opening lesson…</p>;
  return <BoundLesson key={prepared.session.sessionId} mode={mode} sessionId={prepared.session.sessionId} services={services} progress={prepared.progress} callState={prepared.callState} {...props} />;
}
function BoundLesson({ sessionId, services, progress, callState, renderLesson, ...props }: {
  sessionId: string; callState: ActivePractice['callState']; services: PersistedSessionServices; progress: SessionProgressBinding; mode: LessonMode; settings: LearnerSettings; preferencesOpen: boolean;
  voiceStatusTarget: HTMLElement | null; renderLesson?: LessonRenderer | undefined; fallback: ReactNode;
}) {
  const register = useRootExitRegistration();
  const alive = useRef(true); const approved = useRef<string | null>(null); const cleanup = useRef<(() => void) | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const lifecyclePorts = useMemo(() => ({ ...(services.reportCall ? { reportCall: services.reportCall } : {}), ...(services.reconcileClose ? { reconcileClose: () => services.reconcileClose!(sessionId) } : {}), sessions: services.commands, progress: progress.sink,
    freezeWrites: progress.freezeWrites, releasePreparation: progress.releasePreparation,
    operationId: () => crypto.randomUUID(), isCurrent: () => alive.current,
    navigate: (target: string) => { approved.current = target; },
  }), [services, progress]);
  const registerLifecycle = useCallback((lifecycle: SessionLifecycle | null) => {
    cleanup.current?.(); cleanup.current = null;
    if (!lifecycle) return;
    cleanup.current = register?.(async destination => {
      const result = await lifecycle.requestExit(destination);
      return (result === 'closed' || result === 'saved') && alive.current ? approved.current : null;
    }) ?? null;
  }, [register]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; cleanup.current?.(); }; }, []);
  return <LessonSession {...props} sessionId={sessionId} lifecyclePorts={lifecyclePorts} registerLifecycle={registerLifecycle}
      syncStatus={<>{saveFailed && <p role="alert">Some practice results have not been saved. Keep this lesson open while the pending queue is recovered.</p>}{progress.status}</>}
      initialCallState={callState} endRestoredCall={async () => {
        if (!services.reconcileClose) throw new Error('Call cleanup is unavailable');
        await services.reconcileClose(sessionId);
      }} checkRestoredCall={async () => {
        const current = await services.current?.();
        return current?.session.sessionId === sessionId ? current.callState : 'none';
      }}
      renderLesson={(mode, lesson) => {
        const bound = { ...lesson, ...(progress.writtenPractice ? { writtenPractice: progress.writtenPractice } : {}), ...(progress.writtenActivity ? { writtenActivity: progress.writtenActivity } : {}), progressSink: progress.sink, canWrite: progress.canWrite, onProgressError: () => setSaveFailed(true) };
        return renderLesson?.(mode, bound);
      }} />;
}
```
