import { useEffect, useRef, useState } from 'react';
import type { LearnerSettings } from '../contracts';
import { TENSE_GUIDE } from '../content/tense-guide';

type MicrophonePermission = PermissionState | 'unknown' | 'unavailable';
const PERMISSION_LABELS: Record<MicrophonePermission, string> = {
  granted: 'Microphone access is allowed.',
  denied: 'Microphone access is blocked. Allow it in your browser’s site settings, then try again.',
  prompt: 'Your browser will ask for microphone access when you start a lesson.',
  unknown: 'Microphone permission is managed by your browser.',
  unavailable: 'Microphone access is unavailable in this browser.',
};

export function Preferences({ settings, onChange, onReset, onClose, notice }: {
  settings: LearnerSettings; onChange: (settings: LearnerSettings) => void;
  onReset: () => void; onClose: () => void; notice: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [permission, setPermission] = useState<MicrophonePermission>('unknown');
  const [checking, setChecking] = useState(false);
  const [section, setSection] = useState('appearance');
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
      <button className="quiet-button" aria-label="Close preferences" onClick={onClose}>Close</button></div>
    <div className="preferences-layout">
      <nav className="preferences-nav" aria-label="Preferences sections">
        {[
          ['appearance', 'Appearance', 'M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm0 0v18'],
          ['voice', 'Voice', 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1M12 18v4m-3 0h6'],
          ['learning', 'Learning', 'm2 9 10-5 10 5-10 5L2 9Zm4 2v6l6 3 6-3v-6M22 9v7'],
          ['device', 'Storage', 'M5 3h14v18H5V3Zm4 14h6'],
        ].map(([id, label, path]) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined}
          aria-controls="preferences-content" onClick={() => setSection(id!)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
          {label}
        </button>)}
      </nav>
      <div id="preferences-content" className="preferences-content">
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
          <p className="muted">Choose your pace and the help you want along the way.</p>
          <label className="setting-row"><span>Sentence tenses</span><select aria-label="Sentence tenses" value={settings.sentenceTense}
            onChange={event => onChange({ ...settings, sentenceTense: event.target.value as LearnerSettings['sentenceTense'] })}>
            <option value="all">All eight tenses</option>
            {TENSE_GUIDE.map(item => <option key={item.tense} value={item.tense}>{item.label}</option>)}
          </select></label>
          <p className="muted">Applies to the next sentence prompt. Verb lessons keep all three form families.</p>
          <div className="settings-grid">{(['grammar', 'vocabulary'] as const).map(dimension => <label key={dimension}>
            <span className="label-title">{dimension === 'grammar' ? 'Grammar' : 'Vocabulary'} difficulty</span>
            <select aria-label={`${dimension === 'grammar' ? 'Grammar' : 'Vocabulary'} difficulty`} value={settings.difficulty[dimension]} onChange={event => onChange({ ...settings, difficulty: { ...settings.difficulty, [dimension]: Number(event.target.value) as 1 | 2 | 3 } })}>
              <option value="1">1 · Start gently</option><option value="2">2 · Build confidence</option><option value="3">3 · Add a challenge</option>
            </select></label>)}</div>
          <label className="check-label"><input type="checkbox" checked={settings.helpEnabled} onChange={event => onChange({ ...settings, helpEnabled: event.target.checked })} />Offer help after written corrections</label>
          <label className="check-label"><input type="checkbox" checked={settings.untimedHelp} onChange={event => onChange({ ...settings, untimedHelp: event.target.checked })} />Keep sound-help offers available until dismissed</label>
        </section>}
        {section === 'device' && <section className="preferences-section" aria-labelledby="device-title">
          <h3 id="device-title">Storage</h3><p className="muted">Your appearance and learning preferences are saved on this device.</p>
          <div className="setting-card"><h4>Saved preferences</h4><p className="muted">Restore the default appearance, difficulty and sound-help settings.</p>
            <button className="quiet-button" onClick={onReset}>Clear saved preferences</button></div>
        </section>}
        <p className="muted preferences-notice" role="status">{notice}</p>
      </div>
    </div>
  </dialog>;
}
