import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { EvidenceResult, LearnerSettings, LessonMode, LessonModuleProps, ProviderMode, VoiceState } from '../contracts';
import { createMockVoiceAdapter, createRealtimeVoiceAdapter, isMockVoiceAdapter } from '../voice';
import { VoiceControls } from '../ui/mobile';
import { createSessionRuntime } from './session-runtime';

export interface ComposedLessonProps extends LessonModuleProps {
  connectionState: VoiceState; microphoneMuted: boolean; onStartVoice: () => void; onStopVoice: () => void;
  claimUtterance: (utteranceId: string) => void;
  sessionControls: ReactNode;
}
export type LessonRenderer = (mode: LessonMode, props: ComposedLessonProps) => ReactNode;
export function LessonSession({ mode, settings, provider, preferencesOpen, renderLesson, fallback }: {
  mode: LessonMode; settings: LearnerSettings; provider: ProviderMode; preferencesOpen: boolean;
  renderLesson?: LessonRenderer | undefined; fallback: ReactNode;
}) {
  const [base] = useState(() => provider === 'mock' ? createMockVoiceAdapter() : createRealtimeVoiceAdapter());
  const [runtime] = useState(() => createSessionRuntime(base, crypto.randomUUID()));
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [brokerReady, setBrokerReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [demoText, setDemoText] = useState('A simulated spoken practice response.');
  const [outcome, setOutcome] = useState<EvidenceResult['status']>('accepted');
  const [notice, setNotice] = useState('');
  useEffect(() => () => runtime.stop(), [runtime]);
  useEffect(() => { runtime.hold('root-preferences', preferencesOpen); }, [runtime, preferencesOpen]);
  useEffect(() => {
    const abort = new AbortController();
    if (provider === 'openai-realtime') void fetch('/api/realtime/status', { signal: abort.signal, credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : null)
      .then((status: unknown) => { if (!abort.signal.aborted) setBrokerReady(Boolean(status && typeof status === 'object' && 'enabled' in status && status.enabled === true)); })
      .catch(() => { if (!abort.signal.aborted) setBrokerReady(false); });
    return () => abort.abort();
  }, [provider]);
  async function start() {
    if (provider !== 'mock' && (!brokerReady || !consent)) { setNotice('Enable the local voice broker and agree to share audio before starting.'); return; }
    try { await runtime.start(); } catch { setNotice('The session did not start. Check the conversation status and try again.'); }
  }
  const sessionControls = <div className="ll-actions" role="group" aria-label="Practice session lifecycle">
    <button className="ll-button" disabled={state.state === 'ready' || state.state === 'connecting'} onClick={() => { void start(); }}>Start practice session</button>
    <button className="ll-button" onClick={runtime.stop}>Stop practice session</button>
  </div>;
  const lesson = renderLesson?.(mode, { settings, voice: runtime.voice, sessionId: runtime.sessionId, onComplete: () => setNotice('Exercise completed.'),
    connectionState: state.state, microphoneMuted: state.muted, onStartVoice: () => { void start(); }, onStopVoice: runtime.stop,
    claimUtterance: runtime.claimUtterance, sessionControls });
  return <div className="workspace-grid">
    <section className="lesson-panel panel" aria-label="Current exercise">{lesson ?? fallback}</section>
    <aside className="practice-aside" aria-labelledby="practice-heading">
      <div className="panel session-panel">
        <span className="eyebrow">{provider === 'mock' ? 'Deterministic demo' : 'Live voice option'}</span>
        <h2 id="practice-heading">Room for conversation</h2>
        <p>Ask a question, try again, or pause whenever you need.</p>
        {provider === 'mock' ? <p className="muted">Mock responses are simulated. No microphone, model or acoustic assessment is used.</p>
          : <><p className="muted">Live voice sends microphone audio to OpenAI and may incur charges. Sessions stop after ten minutes. This app saves no recordings or transcripts.</p>
            <p role="status">{brokerReady ? 'Local voice broker is enabled.' : 'Local voice broker is disabled or unavailable.'}</p>
            <label className="check-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />I agree to send audio for this session.</label></>}
        <VoiceControls {...state} mock={provider === 'mock'} onStart={() => { void start(); }} onMute={value => runtime.voice.setMuted(value)} onStop={runtime.stop} />
        {state.state === 'ready' && <div className="ll-actions"><button className="ll-button" onClick={() => runtime.voice.interrupt()}>Interrupt coach</button>
          <button className="ll-button" onClick={() => { runtime.resume(); setNotice('Practice resumed.'); }}>Resume practice</button></div>}
        {provider === 'mock' && <details className="demo-controls"><summary>Mock response simulator</summary>
          <p className="muted">Choose a fixture outcome for the current spoken obligations. This does not evaluate your English.</p>
          <label className="label-title" htmlFor="demo-transcript">Simulated transcript</label>
          <textarea id="demo-transcript" maxLength={4000} value={demoText} onChange={event => setDemoText(event.target.value)} />
          <label className="label-title" htmlFor="demo-outcome">Simulated outcome</label>
          <select id="demo-outcome" value={outcome} onChange={event => setOutcome(event.target.value as EvidenceResult['status'])}>
            <option value="accepted">Accepted fixture</option><option value="incorrect">Retry fixture</option><option value="uncertain">Uncertain audio fixture</option></select>
          <button className="ll-button" disabled={state.state !== 'ready' || !state.contextReady || !demoText.trim()} onClick={() => {
            if (isMockVoiceAdapter(base)) base.simulateUtterance(demoText, outcome);
          }}>Send simulated speech</button>
          <button className="ll-button" disabled={state.state !== 'ready'} onClick={() => { if (isMockVoiceAdapter(base)) base.simulateIntent('question'); }}>Simulate a question</button>
        </details>}
      </div>
      <p className="muted" role="status">{notice}</p>
      <div className="practice-note"><span aria-hidden="true">+</span><p>{mode === 'sentence' ? 'More than one translation can be right. Context matters.' : 'A picture suggests an action. Your sentence gives it a tense.'}</p></div>
    </aside>
  </div>;
}
