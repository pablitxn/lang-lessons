import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LearnerSettings } from '../contracts';
import { getTenseGuide } from '../content/tense-guide';
import { LearningCredits } from './LearningCredits';

type MicrophonePermission = PermissionState | 'unknown' | 'unavailable';
const PERMISSION_LABELS: Record<MicrophonePermission, string> = {
  granted: 'Microphone access is allowed.',
  denied: 'Microphone access is blocked. Allow it in your browser’s site settings, then try again.',
  prompt: 'Your browser will ask for microphone access when you start a call.',
  unknown: 'Microphone permission is managed by your browser.',
  unavailable: 'Microphone access is unavailable in this browser.',
};

export function Preferences({ settings, onChange, onClose, notice, profile, onSignOut, signingOut }: {
  settings: LearnerSettings; onChange: (settings: LearnerSettings) => void;
  onClose: () => void; notice: string;
  profile?: ReactNode; onSignOut?: (() => void) | undefined; signingOut?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [permission, setPermission] = useState<MicrophonePermission>('unknown');
  const [checking, setChecking] = useState(false);
  const [section, setSection] = useState(profile ? 'profile' : 'appearance');
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    let permissionStatus: PermissionStatus | undefined;
    let cancelled = false;
    const update = () => { if (!cancelled && permissionStatus) setPermission(permissionStatus.state); };
    if (!navigator.mediaDevices?.getUserMedia) setPermission('unavailable');
    else if (navigator.permissions?.query) {
      void navigator.permissions.query({ name: 'microphone' as PermissionName }).then(status => {
        if (cancelled) return;
        permissionStatus = status;
        update();
        status.addEventListener('change', update);
      }).catch(() => {});
    }
    return () => {
      active.current = false;
      cancelled = true;
      permissionStatus?.removeEventListener('change', update);
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  async function checkMicrophone() {
    if (checking || !navigator.mediaDevices?.getUserMedia) return;
    setChecking(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission checks release the device immediately and never start a call.
      stream.getTracks().forEach(track => track.stop());
      if (active.current) setPermission('granted');
    } catch (error) {
      if (active.current) setPermission(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    } finally {
      if (active.current) setChecking(false);
    }
  }

  return <dialog ref={dialog} className="preferences-dialog" aria-labelledby="preferences-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="preferences-heading"><h2 id="preferences-title">Preferences</h2>
      <button className="preferences-close" aria-label="Close preferences" onClick={onClose}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button></div>
    <div className="preferences-layout">
      <div className="preferences-sidebar">
      <nav className="preferences-nav" aria-label="Preferences sections">
        {[
          ...(profile || onSignOut ? [['profile', 'Profile', 'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z']] : []),
          ['appearance', 'Appearance', 'M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm0 0v18'],
          ['voice', 'Voice', 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1M12 18v4m-3 0h6'],
          ['learning', 'Learning', 'm2 9 10-5 10 5-10 5L2 9Zm4 2v6l6 3 6-3v-6M22 9v7'],
        ].map(([id, label, path]) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined}
          aria-controls="preferences-content" title={label} onClick={() => { setSection(id!); document.getElementById('preferences-content')?.scrollTo(0, 0); }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
          <span>{label}</span>
        </button>)}
      </nav>
      <div className="preferences-sidebar-footer">
        <button type="button" aria-current={section === 'credits' ? 'page' : undefined} aria-controls="preferences-content" title="Credits"
          onClick={() => { setSection('credits'); document.getElementById('preferences-content')?.scrollTo(0, 0); }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M15 8a5 5 0 1 0 0 8" /></svg><span>Credits</span>
        </button>
      {onSignOut && <button type="button" disabled={signingOut} onClick={onSignOut} title="Sign out">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h12" /></svg>
        <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
      </button>}
      </div>
      </div>
      <div id="preferences-content" className="preferences-content">
        {section === 'credits' && <LearningCredits language={settings.learningLanguage} />}
        {section === 'profile' && <section className="preferences-section" aria-labelledby="profile-title">
          <h3 id="profile-title">Profile</h3>
          {profile}
        </section>}
        {section === 'appearance' && <section className="preferences-section" aria-labelledby="appearance-title">
          <h3 id="appearance-title">Appearance</h3>
          <p className="muted">Make this space feel comfortable for you.</p>
          <label className="setting-row"><span>Theme</span><select aria-label="Theme" value={settings.theme} onChange={event => onChange({ ...settings, theme: event.target.value as LearnerSettings['theme'] })}>
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select></label>
        </section>}
        {section === 'voice' && <section className="preferences-section" aria-labelledby="microphone-title">
          <h3 id="microphone-title">Voice</h3>
          <p className="muted">Manage microphone access for your conversations.</p>
          <h4>Microphone</h4>
          <p className="muted" role="status">{PERMISSION_LABELS[permission]}</p>
          <button className="quiet-button" disabled={checking || permission === 'unavailable'} onClick={() => { void checkMicrophone(); }}>
            {checking ? 'Checking microphone…' : 'Check microphone access'}</button>
          <p className="muted">You can mute or pause your call at any time.</p>
        </section>}
        {section === 'learning' && <section className="preferences-section" aria-labelledby="learning-title">
          <h3 id="learning-title">Learning</h3>
          <label className="setting-row"><span>Idioma de aprendizaje</span><select aria-label="Idioma de aprendizaje" value={settings.learningLanguage}
            onChange={event => onChange({ ...settings, learningLanguage: event.target.value as LearnerSettings['learningLanguage'], sentenceTense: 'all' })}>
            <option value="en">Inglés</option><option value="fr">Francés</option>
          </select></label>
          <p className="muted">Idioma base: español. Cada idioma conserva sus ejercicios y progreso.</p>
          <p className="muted">Choose your pace and the help you want along the way.</p>
          <label className="setting-row"><span>Sentence tenses</span><select aria-label="Sentence tenses" value={settings.sentenceTense}
            onChange={event => onChange({ ...settings, sentenceTense: event.target.value as LearnerSettings['sentenceTense'] })}>
            <option value="all">{settings.learningLanguage === 'fr' ? 'Todos los tiempos franceses' : 'All English tenses'}</option>
            {getTenseGuide(settings.learningLanguage).map(item => <option key={item.tense} value={item.tense}>{item.label}</option>)}
          </select></label>
          <p className="muted">{settings.learningLanguage === 'fr' ? 'Se aplica al siguiente ejercicio. Los verbos trabajan infinitivo, presente con je y participio, con auxiliares y concordancia.' : 'Applies to the next sentence prompt. Verb lessons keep all three form families.'}</p>
          <div className="settings-grid">{(['grammar', 'vocabulary'] as const).map(dimension => <label key={dimension}>
            <span className="label-title">{dimension === 'grammar' ? 'Grammar' : 'Vocabulary'} difficulty</span>
            <select aria-label={`${dimension === 'grammar' ? 'Grammar' : 'Vocabulary'} difficulty`} value={settings.difficulty[dimension]} onChange={event => onChange({ ...settings, difficulty: { ...settings.difficulty, [dimension]: Number(event.target.value) as 1 | 2 | 3 } })}>
              <option value="1">1 · Start gently</option><option value="2">2 · Build confidence</option><option value="3">3 · Add a challenge</option>
            </select></label>)}</div>
          <label className="check-label"><input type="checkbox" checked={settings.helpEnabled} onChange={event => onChange({ ...settings, helpEnabled: event.target.checked })} />Offer help after written corrections</label>
          <label className="check-label"><input type="checkbox" checked={settings.untimedHelp} onChange={event => onChange({ ...settings, untimedHelp: event.target.checked })} />Keep sound-help offers available until dismissed</label>
        </section>}
        <p className="muted preferences-notice" role="status">{notice}</p>
      </div>
    </div>
  </dialog>;
}
