import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ActivePractice, LearnerSettings, LessonMode, ProgressSink, SessionCommands } from '../contracts';
import { LessonSession, type LessonRenderer } from './LessonSession';
import type { SessionLifecycle } from './session-lifecycle';
import { useRootExitRegistration } from './navigation-context';
import type { WrittenActivityBinding } from '../features/progress/use-written-activity';

export interface SessionProgressBinding {
  sink: ProgressSink; canWrite(): boolean; freezeWrites(): void; releasePreparation(): void;
  writtenPractice?: import('../features/progress/written-snapshot').WrittenPracticeBinding;
  writtenActivity?: WrittenActivityBinding; status?: ReactNode; dispose?(): void;
}
export interface PersistedSessionServices {
  readonly actorId: string;
  readonly commands: SessionCommands;
  enter?(input: { mode: LessonMode; operationId: string }): Promise<ActivePractice>;
  current?(): Promise<ActivePractice | null>;
  reconcileClose?(sessionId: string): Promise<void>;
  reportCall?(segment: import('../contracts').CallSegmentRef, intervals: readonly { start: string; end: string }[]): Promise<void>;
  progress(sessionId: string, mode?: LessonMode): SessionProgressBinding | Promise<SessionProgressBinding>;
}
/** Enter atomically selects the saved practice before mounting any producer. */
export function PersistedLesson({ mode, services, ...props }: {
  mode: LessonMode; services: PersistedSessionServices; settings: LearnerSettings; preferencesOpen: boolean;
  voiceStatusTarget: HTMLElement | null; renderLesson?: LessonRenderer | undefined; fallback: ReactNode;
}) {
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [prepared, setPrepared] = useState<ActivePractice & { progress: SessionProgressBinding } | null>(null);
  const [blockingCall, setBlockingCall] = useState<ActivePractice | null>(null);
  const [endingCall, setEndingCall] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<Promise<ActivePractice & { progress: SessionProgressBinding }> | null>(null);
  const lifetime = useRef(0);
  useEffect(() => {
    let current = true; const generation = ++lifetime.current; setFailed(false); setBlockingCall(null);
    pending.current ??= (services.enter ? services.enter({ mode, operationId }) : services.commands.create({ mode, operationId }).then(session => ({ session, callState: 'none' as const }))).then(async entry => {
      const { session } = entry;
      if (session.mode !== mode || session.status !== 'open' || !session.sessionId) throw new Error('Canonical session mismatch');
      return { ...entry, progress: await services.progress(session.sessionId, mode) };
    });
    const work = pending.current;
    void work.then(({ session: value, progress, callState }) => {
      if (value.mode !== mode || value.status !== 'open' || !value.sessionId) throw new Error('Canonical session mismatch');
      if (current) setPrepared({ session: value, progress, callState });
    }).catch(async () => {
      if (!current) return;
      pending.current = null;
      try {
        const active = await services.current?.();
        if (current && active && active.callState !== 'none') setBlockingCall(active);
      } catch { /* A failed read must not invent an active call. */ }
      if (current) setFailed(true);
    });
    return () => { current = false; queueMicrotask(() => {
      if (generation === lifetime.current) void work.then(value => value.progress.dispose?.()).catch(() => {});
    }); };
  }, [services, mode, operationId]);
  function retryEntry() { pending.current = null; setOperationId(crypto.randomUUID()); }
  const register = useRootExitRegistration();
  useEffect(() => {
    if (!prepared && failed) return register?.(async destination => endingCall ? null : destination);
  }, [register, prepared, failed, endingCall]);
  async function endBlockingCall() {
    if (!blockingCall || endingCall || !services.reconcileClose) return;
    setEndingCall(true);
    try { await services.reconcileClose(blockingCall.session.sessionId); retryEntry(); }
    catch { setFailed(true); }
    finally { setEndingCall(false); }
  }
  if (!prepared && blockingCall) return <div className="voice-call-notice" role="status">
    <p>A tutor call is still open. End it before switching exercises.</p>
    <button className="quiet-button" disabled={endingCall} onClick={() => void endBlockingCall()}>{endingCall ? 'Ending call…' : 'End current call'}</button>
    <button className="quiet-button" disabled={endingCall} onClick={retryEntry}>Check call status</button>
  </div>;
  if (!prepared) return failed ? <div role="alert"><p>The lesson could not be opened. Your previous work has not been discarded.</p>
    <button onClick={retryEntry}>Try opening lesson again</button></div> : <p role="status">Opening lesson…</p>;
  return <BoundLesson key={prepared.session.sessionId} mode={mode} sessionId={prepared.session.sessionId} services={services} progress={prepared.progress} callState={prepared.callState} {...props} />;
}
function BoundLesson({ sessionId, services, progress, callState, renderLesson, ...props }: {
  sessionId: string; callState: ActivePractice['callState']; services: PersistedSessionServices; progress: SessionProgressBinding; mode: LessonMode; settings: LearnerSettings; preferencesOpen: boolean;
  voiceStatusTarget: HTMLElement | null; renderLesson?: LessonRenderer | undefined; fallback: ReactNode;
}) {
  const register = useRootExitRegistration();
  const alive = useRef(true); const approved = useRef<string | null>(null); const cleanup = useRef<(() => void) | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const lifecyclePorts = useMemo(() => ({ ...(services.reportCall ? { reportCall: services.reportCall } : {}), ...(services.reconcileClose ? { reconcileClose: () => services.reconcileClose!(sessionId) } : {}), sessions: services.commands, progress: progress.sink,
    freezeWrites: progress.freezeWrites, releasePreparation: progress.releasePreparation,
    operationId: () => crypto.randomUUID(), isCurrent: () => alive.current,
    navigate: (target: string) => { approved.current = target; },
  }), [services, progress]);
  const registerLifecycle = useCallback((lifecycle: SessionLifecycle | null) => {
    cleanup.current?.(); cleanup.current = null;
    if (!lifecycle) return;
    cleanup.current = register?.(async destination => {
      const result = await lifecycle.requestExit(destination);
      return (result === 'closed' || result === 'saved') && alive.current ? approved.current : null;
    }) ?? null;
  }, [register]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; cleanup.current?.(); }; }, []);
  return <LessonSession {...props} sessionId={sessionId} lifecyclePorts={lifecyclePorts} registerLifecycle={registerLifecycle}
      syncStatus={<>{saveFailed && <p role="alert">Some practice results have not been saved. Keep this lesson open while the pending queue is recovered.</p>}{progress.status}</>}
      initialCallState={callState} endRestoredCall={async () => {
        if (!services.reconcileClose) throw new Error('Call cleanup is unavailable');
        await services.reconcileClose(sessionId);
      }} checkRestoredCall={async () => {
        const current = await services.current?.();
        return current?.session.sessionId === sessionId ? current.callState : 'none';
      }}
      renderLesson={(mode, lesson) => {
        const bound = { ...lesson, ...(progress.writtenPractice ? { writtenPractice: progress.writtenPractice } : {}), ...(progress.writtenActivity ? { writtenActivity: progress.writtenActivity } : {}), progressSink: progress.sink, canWrite: progress.canWrite, onProgressError: () => setSaveFailed(true) };
        return renderLesson?.(mode, bound);
      }} />;
}
