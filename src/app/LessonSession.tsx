import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LearnerSettings, LessonMode, LessonModuleProps, VoiceAdapter, VoiceState } from '../contracts';
import { createRealtimeVoiceAdapter } from '../voice/realtime';
import { checkVoiceAvailability, createSessionRuntime } from './session-runtime';
import { createSessionLifecycle, type SessionLifecycle, type SessionLifecyclePorts } from './session-lifecycle';
import { SessionExitDialog } from './SessionExitDialog';
import { VoiceStatus } from './VoiceStatus';

const idleLifecycle = { frozen: false, callStarting: false };
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
export function LessonSession({ mode, settings, preferencesOpen, renderLesson, fallback, voiceAdapter, voiceStatusTarget = null, sessionId, lifecyclePorts, registerLifecycle }: {
  mode: LessonMode; settings: LearnerSettings; preferencesOpen: boolean;
  renderLesson?: LessonRenderer | undefined; fallback: ReactNode;
  /** Internal fixture seam. The application always creates the live adapter. */
  voiceAdapter?: VoiceAdapter;
  voiceStatusTarget?: HTMLElement | null;
  sessionId?: string;
  lifecyclePorts?: SessionLifecyclePorts;
  registerLifecycle?: (lifecycle: SessionLifecycle | null) => void;
}) {
  const [runtime] = useState(() => createSessionRuntime(voiceAdapter ?? createRealtimeVoiceAdapter(), sessionId ?? crypto.randomUUID(), {
    prepareConnection: checkVoiceAvailability,
  }));
  const [lifecycle] = useState(() => lifecyclePorts ? createSessionLifecycle(runtime, lifecyclePorts) : null);
  useEffect(() => {
    lifecycle?.activate();
    registerLifecycle?.(lifecycle);
    return () => { registerLifecycle?.(null); lifecycle?.dispose(); };
  }, [lifecycle, registerLifecycle]);
  const lifecycleState = useSyncExternalStore(lifecycle?.subscribe ?? idleSubscribe, lifecycle?.getSnapshot ?? idleSnapshot);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const start = () => {
    if (runtime.getSnapshot().contextReady) void (lifecycle ? lifecycle.start() : runtime.start()).catch(() => { /* The runtime exposes the current connection error. */ });
  };
  useEffect(() => {
    window.addEventListener('pagehide', runtime.stop);
    return () => { window.removeEventListener('pagehide', runtime.stop); runtime.stop(); };
  }, [runtime]);
  useEffect(() => { runtime.hold('root-preferences', preferencesOpen); }, [runtime, preferencesOpen]);

  const connecting = state.state === 'connecting' || state.state === 'reconnecting';
  const active = lifecycleState.callStarting || connecting || state.state === 'ready';
  const status = !state.contextReady ? 'Prepare an exercise to start the optional tutor.' : state.error || (state.paused ? 'Tutor stopped' : connecting ? 'Connecting voice…'
    : state.state !== 'ready' ? 'Tutor is optional. Practice or start a call.' : state.muted ? 'Microphone muted'
      : state.assistantSpeaking ? 'Your coach is speaking' : state.learnerSpeaking ? 'Listening to you' : 'Ready to talk');
  const toggle = <button type="button" className="ll-button" aria-label={active ? 'Stop tutor' : 'Start tutor'}
    aria-pressed={active} disabled={!state.contextReady || lifecycleState.frozen}
    onClick={active ? () => { if (lifecycle) void lifecycle.stop(); else runtime.pause(); } : start}>
    {active ? 'Stop tutor' : 'Start tutor'}
  </button>;
  const sessionControls = <div className="voice-call-actions ll-actions" role="group" aria-label="Voice call controls">
    <button type="button" className="ll-button" disabled={state.state !== 'ready'} aria-pressed={state.muted}
      onClick={() => runtime.voice.setMuted(!state.muted)}>{state.muted ? 'Unmute microphone' : 'Mute microphone'}</button>
    {toggle}
  </div>;
  const lesson = renderLesson?.(mode, { settings, voice: runtime.voice, sessionId: runtime.sessionId, onComplete: () => {},
    connectionState: state.state, microphoneMuted: state.muted, onStartVoice: start, onStopVoice: () => { if (lifecycle) void lifecycle.stop(); else runtime.pause(); },
    claimUtterance: runtime.claimUtterance, sessionControls, rootVoiceError: voiceStatusTarget ? state.error : '' });
  return <div className="lesson-workspace">
    <VoiceStatus runtime={runtime} status={status} ready={state.state === 'ready'} failed={Boolean(state.error) || state.state === 'error'}
      controls={sessionControls} toggle={toggle} target={voiceStatusTarget} />
    {lifecycle && <SessionExitDialog lifecycle={lifecycle} />}
    <section inert={lifecycleState.frozen} className="lesson-panel panel" aria-label="Current exercise">{lesson ?? fallback}</section>
  </div>;
}
