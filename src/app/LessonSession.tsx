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
