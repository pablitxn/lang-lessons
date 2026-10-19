import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type CurrentUser, type LearnerSettings, type LessonMode } from '../contracts';
import { browserStorage, loadSettings, saveSettings } from '../platform/settings-store';
import { createAccountSettings, type AccountSettingsApi } from '../platform/account-settings';
import { MODES, modeHref, resolveLessonRoute } from './routes';
import { LessonSession, type LessonRenderer } from './LessonSession';
import { PersistedLesson, type PersistedSessionServices } from './PersistedLesson';
import { Preferences } from './Preferences';
import { LessonDialog, ReferenceTable } from '../ui/mobile';
import { LessonToolsVisible } from '../ui/mobile/lesson-tools-context';
import { TENSE_GUIDE } from '../content/tense-guide';
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
  const accountSettings = useRef<ReturnType<typeof createAccountSettings> | null>(null);
  const [mode, setMode] = useState(() => resolveLessonRoute(window.location.hash));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceStatusTarget, setVoiceStatusTarget] = useState<HTMLDivElement | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!account || !preferencesApi) return;
    const controller = createAccountSettings({ accountId: account.id, api: preferencesApi, storage: browserStorage() });
    accountSettings.current = controller;
    const update = () => { const next = controller.getSnapshot(); setSettings(next.settings); setNotice(next.notice); };
    const unsubscribe = controller.subscribe(update);
    const sync = () => { void controller.sync(); };
    const visible = () => { if (document.visibilityState === 'visible') sync(); };
    update(); sync();
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', visible);
    return () => {
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

  function updateSettings(next: LearnerSettings) {
    if (accountSettings.current) { accountSettings.current.update(next); return; }
    setSettings(next);
    setNotice(saveSettings(next, browserStorage()) ? 'Preferences saved on this device.' : 'Preferences changed for this visit. Device storage is unavailable.');
  }
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
      <a className="brand" href="#/" aria-label="English practice home">
        <span className="brand-mark" aria-hidden="true">e.</span><span>English practice</span>
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
      {mode && current ? <>
        <div className="lesson-heading">
          <a className="back-link" href="#/" aria-label="All lessons">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 6-6 6 6 6M4 12h16" /></svg>
            All lessons
          </a>
          <span className="lesson-heading-divider" aria-hidden="true">/</span>
          <h1 aria-label={current.title}>{current.short}</h1>
        </div>
        <LessonToolsVisible.Provider value={false}>{sessionServices ?
          <PersistedLesson key={`${sessionServices.actorId}:${mode}`} mode={mode} services={sessionServices} settings={settings}
            preferencesOpen={settingsOpen} voiceStatusTarget={voiceStatusTarget} renderLesson={renderLesson}
            fallback={lessons[mode] ?? <p>This lesson is unavailable.</p>} /> :
          <LessonSession key={mode} mode={mode} settings={settings} preferencesOpen={settingsOpen} voiceStatusTarget={voiceStatusTarget}
            renderLesson={renderLesson} fallback={lessons[mode] ?? <p>This lesson is unavailable.</p>} />}</LessonToolsVisible.Provider>
      </> : <section className="lesson-catalog" aria-labelledby="catalog-title" inert={signingOut}>
        <div className="catalog-heading"><h1 id="catalog-title">Choose a lesson</h1><p>Pick a lesson and start writing. The voice tutor is optional.</p></div>
        <nav className="lesson-cards" aria-label="Lessons">
          {MODES.map((item, index) => <a className={`lesson-card lesson-card-${item.id}`} key={item.id}
            href={modeHref(item.id)} aria-label={`Start ${item.title}`} onClick={() => updateSettings({ ...settings, preferredMode: item.id })}>
            <div className="lesson-card-art" aria-hidden="true">
              {item.id === 'verb-image' ? <div className="verb-card-forms picture-card-words"><span>see</span><span>think</span><span>say</span></div> : item.id === 'verb-visible'
                ? <div className="verb-card-forms"><span>go</span><span>went</span><span>gone</span></div>
                : <div className="sentence-card-words"><span>Hola.</span><span>Hello.</span></div>}
            </div>
            <div className="lesson-card-copy"><span className="eyebrow">Lesson 0{index + 1}</span><h2>{item.short}</h2><p>{item.description}</p>
              <span className="lesson-card-start">Start lesson <span aria-hidden="true">↗</span></span></div>
          </a>)}
        </nav>
        {homeContent}
        <nav className="home-tools ll-mobile" aria-label="Learning tools">
          <LessonDialog title="Progress" triggerLabel="Your progress" triggerText="Progress" triggerIcon="progress"
            closeLabel="Close progress" onHoldChange={noHold}>
            {homeProgress ?? <p>No saved progress is available here yet.</p>}
          </LessonDialog>
          <ReferenceTable title="Reference" caption="English tense reference" columns={['Tense', 'Structure and use']}
            rows={TENSE_GUIDE.map(item => [item.label, item.guidance])} onHoldChange={noHold} />
        </nav>
      </section>}
    </main>
    {settingsOpen && <Preferences settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} notice={notice}
      profile={profileSettings} onSignOut={onSignOut ? () => void signOut() : undefined} signingOut={signingOut} />}
  </div></RootExitRegistration.Provider>;
}
