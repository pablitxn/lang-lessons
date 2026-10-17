import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LearnerSettings, LessonMode, LessonModuleProps, VoiceAdapter, VoiceState } from '../contracts';
import { createRealtimeVoiceAdapter } from '../voice/realtime';
import { checkVoiceAvailability, createSessionRuntime } from './session-runtime';

export interface ComposedLessonProps extends LessonModuleProps {
  connectionState: VoiceState; microphoneMuted: boolean; onStartVoice: () => void; onStopVoice: () => void;
  claimUtterance: (utteranceId: string) => void;
  sessionControls: ReactNode;
}
export type LessonRenderer = (mode: LessonMode, props: ComposedLessonProps) => ReactNode;
export function LessonSession({ mode, settings, preferencesOpen, renderLesson, fallback, voiceAdapter }: {
  mode: LessonMode; settings: LearnerSettings; preferencesOpen: boolean;
  renderLesson?: LessonRenderer | undefined; fallback: ReactNode;
  /** Internal fixture seam. The application always creates the live adapter. */
  voiceAdapter?: VoiceAdapter;
}) {
  const [runtime] = useState(() => createSessionRuntime(voiceAdapter ?? createRealtimeVoiceAdapter(), crypto.randomUUID(), {
    prepareConnection: checkVoiceAvailability,
  }));
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const start = () => {
    if (runtime.getSnapshot().contextReady) void runtime.start().catch(() => { /* The runtime exposes the current connection error. */ });
  };
  useEffect(() => {
    window.addEventListener('pagehide', runtime.stop);
    return () => { window.removeEventListener('pagehide', runtime.stop); runtime.stop(); };
  }, [runtime]);
  useEffect(() => {
    if (!state.contextReady) return;
    // Runtime startup yields before any media/network activity, so StrictMode's
    // disposable effect is cancelled before it can start a second call.
    void runtime.start().catch(() => {});
    return () => runtime.stop();
  }, [runtime, state.contextReady]);
  useEffect(() => { runtime.hold('root-preferences', preferencesOpen); }, [runtime, preferencesOpen]);

  const connecting = state.state === 'connecting' || state.state === 'reconnecting';
  const active = connecting || state.state === 'ready';
  const status = !state.contextReady ? 'Voice starts when a lesson is ready.' : state.error || (state.paused ? 'Call paused' : connecting ? 'Connecting voice…'
    : state.state !== 'ready' ? 'Voice disconnected' : state.muted ? 'Microphone muted'
      : state.assistantSpeaking ? 'Your coach is speaking' : state.learnerSpeaking ? 'Listening to you' : 'Ready to talk');
  const sessionControls = state.contextReady ? <div className="voice-call-actions ll-actions" role="group" aria-label="Voice call controls">
    <button type="button" className="ll-button" disabled={state.state !== 'ready'} aria-pressed={state.muted}
      onClick={() => runtime.voice.setMuted(!state.muted)}>{state.muted ? 'Unmute microphone' : 'Mute microphone'}</button>
    <button type="button" className="ll-button" onClick={active ? runtime.pause : start}>
      {active ? 'Pause call' : state.paused ? 'Resume call' : 'Retry call'}
    </button>
  </div> : null;
  const lesson = renderLesson?.(mode, { settings, voice: runtime.voice, sessionId: runtime.sessionId, onComplete: () => {},
    connectionState: state.state, microphoneMuted: state.muted, onStartVoice: start, onStopVoice: runtime.pause,
    claimUtterance: runtime.claimUtterance, sessionControls });
  return <div className="lesson-workspace">
    <section className="voice-call-bar" aria-label="Voice call">
      <p className="voice-call-status" role="status"><span aria-hidden="true" className={state.state === 'ready' ? 'call-indicator active' : 'call-indicator'} />{status}</p>
      {sessionControls}
    </section>
    <section className="lesson-panel panel" aria-label="Current exercise">{lesson ?? fallback}</section>
  </div>;
}
