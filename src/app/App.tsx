import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type LearnerSettings, type LessonMode } from '../contracts';
import { browserStorage, loadSettings, resetSettings, saveSettings } from '../platform/settings-store';
import { MODES, modeHref, resolveLessonRoute } from './routes';
import { LessonSession, type LessonRenderer } from './LessonSession';
import { Preferences } from './Preferences';
import './global.css';

export interface AppProps { lessons?: Partial<Record<LessonMode, ReactNode>>; renderLesson?: LessonRenderer }

export function App({ lessons = {}, renderLesson }: AppProps) {
  const [settings, setSettings] = useState(() => loadSettings(browserStorage()));
  const [mode, setMode] = useState(() => resolveLessonRoute(window.location.hash));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceStatusTarget, setVoiceStatusTarget] = useState<HTMLDivElement | null>(null);
  const [notice, setNotice] = useState('');
  const current = MODES.find(item => item.id === mode);

  useEffect(() => {
    const update = () => setMode(resolveLessonRoute(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
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

  return <div className="app-shell">
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
        <LessonSession key={mode} mode={mode} settings={settings} preferencesOpen={settingsOpen} voiceStatusTarget={voiceStatusTarget}
          renderLesson={renderLesson} fallback={lessons[mode] ?? <p>This lesson is unavailable.</p>} />
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
      </section>}
    </main>
    {settingsOpen && <Preferences settings={settings} onChange={updateSettings} onReset={reset} onClose={() => setSettingsOpen(false)} notice={notice} />}
  </div>;
}
