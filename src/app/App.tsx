import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type LearnerSettings, type LessonMode } from '../contracts';
import { browserStorage, loadSettings, resetSettings, saveSettings } from '../platform/settings-store';
import { MODES, modeHref, resolveLessonRoute } from './routes';
import { LessonSession, type LessonRenderer } from './LessonSession';
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
}

export function App({ lessons = {}, renderLesson, requireExitRegistration = false, homeProgress }: AppProps) {
  const [settings, setSettings] = useState(() => loadSettings(browserStorage()));
  const [mode, setMode] = useState(() => resolveLessonRoute(window.location.hash));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceStatusTarget, setVoiceStatusTarget] = useState<HTMLDivElement | null>(null);
  const [notice, setNotice] = useState('');
  const current = MODES.find(item => item.id === mode);
  const modeRef = useRef(mode); modeRef.current = mode;
  const requireGuard = useRef(requireExitRegistration); requireGuard.current = requireExitRegistration;
  const guard = useRef<null | ((hash: string) => Promise<string | null>)>(null);
  const navigator = useRef<ReturnType<typeof createRootNavigator> | null>(null);
  const [navigationError, setNavigationError] = useState('');
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
      setNavigationError(''); setMode(resolveLessonRoute(hash));
      requestAnimationFrame(() => document.getElementById('lesson')?.focus());
    }, async hash => {
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
    setSettings(next);
    setNotice(saveSettings(next, browserStorage()) ? 'Preferences saved on this device.' : 'Preferences changed for this visit. Device storage is unavailable.');
  }
  function reset() {
    const removed = resetSettings(browserStorage());
    setSettings({ ...DEFAULT_SETTINGS, difficulty: { ...DEFAULT_SETTINGS.difficulty } });
    setNotice(removed ? 'Saved preferences cleared.' : 'Preferences reset for this visit. Device storage is unavailable.');
  }

  return <RootExitRegistration.Provider value={registerExit}><div className="app-shell" onClickCapture={event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#/"]') : null;
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
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
          {/* Temporary profile initials; no account or identity is persisted. */}
          <span aria-hidden="true">PC</span>
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
        <LessonToolsVisible.Provider value={false}><LessonSession key={mode} mode={mode} settings={settings} preferencesOpen={settingsOpen} voiceStatusTarget={voiceStatusTarget}
          renderLesson={renderLesson} fallback={lessons[mode] ?? <p>This lesson is unavailable.</p>} /></LessonToolsVisible.Provider>
      </> : <section className="lesson-catalog" aria-labelledby="catalog-title">
        <div className="catalog-heading"><h1 id="catalog-title">Choose a lesson</h1><p>Practice with your voice, or write a translation.</p></div>
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
    {settingsOpen && <Preferences settings={settings} onChange={updateSettings} onReset={reset} onClose={() => setSettingsOpen(false)} notice={notice} />}
  </div></RootExitRegistration.Provider>;
}
