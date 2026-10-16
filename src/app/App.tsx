import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type LearnerSettings, type LessonMode, type ProviderMode } from '../contracts';
import { browserStorage, loadSettings, resetSettings, saveSettings } from '../platform/settings-store';
import { MODES, modeHref, resolveMode } from './routes';
import { LessonSession, type LessonRenderer } from './LessonSession';
import './global.css';

/** The integration owner supplies complete feature elements after worker branches land. */
export interface AppProps { lessons?: Partial<Record<LessonMode, ReactNode>>; renderLesson?: LessonRenderer }

export function App({ lessons = {}, renderLesson }: AppProps) {
  const [settings, setSettings] = useState(() => loadSettings(browserStorage()));
  const [mode, setMode] = useState(() => resolveMode(window.location.hash, settings.preferredMode));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [provider, setProvider] = useState<ProviderMode>('mock');
  const current = MODES.find(item => item.id === mode)!;

  useEffect(() => {
    const update = () => setMode(resolveMode(window.location.hash, settings.preferredMode));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [settings.preferredMode]);

  function updateSettings(next: LearnerSettings) {
    setSettings(next);
    setNotice(saveSettings(next, browserStorage()) ? 'Preferences saved on this device.' : 'Preferences changed for this visit. Device storage is unavailable.');
  }
  function selectMode(next: LessonMode) {
    setMode(next);
    updateSettings({ ...settings, preferredMode: next });
  }
  function reset() {
    const removed = resetSettings(browserStorage());
    setSettings({ ...DEFAULT_SETTINGS, difficulty: { ...DEFAULT_SETTINGS.difficulty } });
    setNotice(removed ? 'Saved preferences cleared.' : 'Preferences reset for this visit. Device storage is unavailable.');
  }

  return <div className="app-shell">
    <a href="#lesson" className="skip-link">Skip to lesson</a>
    <header className="app-header">
      <a className="brand" href={modeHref('verb-image')} onClick={() => selectMode('verb-image')} aria-label="English practice home">
        <span className="brand-mark" aria-hidden="true">e.</span><span>English practice</span>
      </a>
      <button className="quiet-button" aria-expanded={settingsOpen} aria-controls="preferences" onClick={() => setSettingsOpen(!settingsOpen)}>Preferences</button>
    </header>

    {settingsOpen && <section className="preferences panel" id="preferences" aria-labelledby="preferences-title">
      <div className="section-heading"><h2 id="preferences-title">Make it yours</h2><button className="quiet-button" onClick={() => setSettingsOpen(false)}>Close</button></div>
      <label className="check-label"><input type="checkbox" checked={settings.helpEnabled} onChange={event => updateSettings({ ...settings, helpEnabled: event.target.checked })} />Offer sound guidance after a spelling error</label>
      <label className="check-label"><input type="checkbox" checked={settings.untimedHelp} onChange={event => updateSettings({ ...settings, untimedHelp: event.target.checked })} />Keep sound-help offers available until dismissed</label>
      <div className="settings-grid">
        {(['grammar', 'vocabulary'] as const).map(dimension => <label key={dimension} htmlFor={`${dimension}-difficulty`}>
          <span className="label-title" id={`${dimension}-label`}>{dimension === 'grammar' ? 'Grammar' : 'Vocabulary'} difficulty</span>
          <select id={`${dimension}-difficulty`} aria-labelledby={`${dimension}-label`} value={settings.difficulty[dimension]} onChange={event => updateSettings({ ...settings, difficulty: { ...settings.difficulty, [dimension]: Number(event.target.value) as 1 | 2 | 3 } })}>
            <option value="1">1 · Start gently</option><option value="2">2 · Build confidence</option><option value="3">3 · Add a challenge</option>
          </select>
        </label>)}
      </div>
      <p className="muted">These two settings are independent. Only your preferences are saved on this device.</p>
      <button className="quiet-button" onClick={reset}>Clear saved preferences</button>
    </section>}

    <main id="lesson" tabIndex={-1}>
      <div className="intro"><p className="eyebrow">A little practice, every day</p><h1>Make English feel natural.</h1><p>Speak, write, and take the time you need.</p></div>
      <nav className="mode-nav" aria-label="Practice mode">
        {MODES.map((item, index) => <a key={item.id} href={modeHref(item.id)} onClick={() => selectMode(item.id)} aria-current={mode === item.id ? 'page' : undefined}>
          <span className="mode-number" aria-hidden="true">0{index + 1}</span><span>{item.short}</span>
        </a>)}
      </nav>
      <div className="provider-choice"><label htmlFor="voice-provider">Session mode</label>
        <select id="voice-provider" value={provider} onChange={event => setProvider(event.target.value as ProviderMode)}>
          <option value="mock">Mock · no microphone or charges</option><option value="openai-realtime">Live voice · requires local setup</option>
        </select>
      </div>
      <h2 id="lesson-title">{current.title}</h2><p className="lesson-description">{current.description}</p>
      <LessonSession key={`${mode}:${provider}`} mode={mode} settings={settings} provider={provider} preferencesOpen={settingsOpen}
        renderLesson={renderLesson} fallback={lessons[mode] ?? <div className="lesson-outline">
          <div className="outline-symbol" aria-hidden="true">{mode === 'sentence' ? 'Aa' : mode === 'verb-image' ? '◌' : 'abc'}</div>
          <h3>{mode === 'sentence' ? 'First translate. Then explain.' : 'One verb. Four ways to learn.'}</h3>
          <p>{mode === 'sentence' ? 'Practice an oral translation, identify its tense, and explain the structure and meaning.' : `Write ${current.editableForms} forms, say the meaning in Spanish, pronounce all three forms, and create three original sentences.`}</p>
          <p className="integration-note" role="status">The lesson module is awaiting integration. Navigation, preferences and session controls are available.</p>
        </div>} />
      <p className="sr-only" aria-live="polite">{notice}</p>
    </main>
    <footer>Local development · No audio or learning history stored</footer>
  </div>;
}
