import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LearnerSettings, LessonMode, ProgressSink, SessionCommands, SessionSnapshot } from '../contracts';
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
  reconcileClose?(sessionId: string): Promise<void>;
  reportCall?(segment: import('../contracts').CallSegmentRef, intervals: readonly { start: string; end: string }[]): Promise<void>;
  progress(sessionId: string, mode?: LessonMode): SessionProgressBinding | Promise<SessionProgressBinding>;
}
/** Root creates canonical sessions before mounting any producer. Stable operation ID survives explicit retry. */
export function PersistedLesson({ mode, services, resumedSession, ...props }: {
  resumedSession?: import('./session-recovery').RecoveryRecord;
  mode: LessonMode; services: PersistedSessionServices; settings: LearnerSettings; preferencesOpen: boolean;
  voiceStatusTarget: HTMLElement | null; renderLesson?: LessonRenderer | undefined; fallback: ReactNode;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [attempt, setAttempt] = useState(0);
  const [prepared, setPrepared] = useState<{ session: SessionSnapshot; progress: SessionProgressBinding } | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = useRef<Promise<{ session: SessionSnapshot; progress: SessionProgressBinding }> | null>(null);
  const lifetime = useRef(0);
  useEffect(() => {
    let current = true; const generation = ++lifetime.current; setFailed(false);
    pending.current ??= (resumedSession ? services.commands.read(resumedSession.sessionId) : services.commands.create({ mode, operationId })).then(async session => {
      if (session.mode !== mode || session.status !== 'open' || !session.sessionId) throw new Error('Canonical session mismatch');
      return { session, progress: await services.progress(session.sessionId, mode) };
    });
    const work = pending.current;
    void work.then(({ session: value, progress }) => {
      if (value.mode !== mode || value.status !== 'open' || !value.sessionId) throw new Error('Canonical session mismatch');
      if (current) setPrepared({ session: value, progress });
    }).catch(() => { if (current) { pending.current = null; setFailed(true); } });
    return () => { current = false; queueMicrotask(() => {
      if (generation === lifetime.current) void work.then(value => value.progress.dispose?.()).catch(() => {});
    }); };
  }, [services, mode, operationId, attempt, resumedSession]);
  if (!prepared) return failed ? <div role="alert"><p>The lesson could not be opened. Your previous work has not been discarded.</p>
    <button onClick={() => setAttempt(value => value + 1)}>Try opening lesson again</button></div> : <p role="status">Opening lesson…</p>;
  return <BoundLesson key={prepared.session.sessionId} mode={mode} sessionId={prepared.session.sessionId} services={services} progress={prepared.progress} hadConnectedCall={resumedSession ? resumedSession.hadConnectedCall : false} {...props} />;
}
function BoundLesson({ sessionId, services, progress, hadConnectedCall, renderLesson, ...props }: {
  sessionId: string; hadConnectedCall: boolean | null; services: PersistedSessionServices; progress: SessionProgressBinding; mode: LessonMode; settings: LearnerSettings; preferencesOpen: boolean;
  voiceStatusTarget: HTMLElement | null; renderLesson?: LessonRenderer | undefined; fallback: ReactNode;
}) {
  const register = useRootExitRegistration();
  const alive = useRef(true); const approved = useRef<string | null>(null); const cleanup = useRef<(() => void) | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const lifecyclePorts = useMemo(() => ({ ...(services.reportCall ? { reportCall: services.reportCall } : {}), ...(services.reconcileClose ? { reconcileClose: () => services.reconcileClose!(sessionId) } : {}), hadConnectedCall, sessions: services.commands, progress: progress.sink,
    freezeWrites: progress.freezeWrites, releasePreparation: progress.releasePreparation,
    operationId: () => crypto.randomUUID(), isCurrent: () => alive.current,
    navigate: (target: string) => { approved.current = target; },
  }), [services, progress, hadConnectedCall]);
  const registerLifecycle = useCallback((lifecycle: SessionLifecycle | null) => {
    cleanup.current?.(); cleanup.current = null;
    if (!lifecycle) return;
    cleanup.current = register?.(async destination => {
      const result = await lifecycle.requestExit(destination);
      return result === 'closed' && alive.current ? approved.current : null;
    }) ?? null;
  }, [register]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; cleanup.current?.(); }; }, []);
  return <>{saveFailed && <p role="alert">Some practice results have not been saved. Keep this lesson open while the pending queue is recovered.</p>}
    <LessonSession {...props} sessionId={sessionId} lifecyclePorts={lifecyclePorts} registerLifecycle={registerLifecycle}
      renderLesson={(mode, lesson) => {
        const bound = { ...lesson, ...(progress.writtenPractice ? { writtenPractice: progress.writtenPractice } : {}), ...(progress.writtenActivity ? { writtenActivity: progress.writtenActivity } : {}), progressSink: progress.sink, canWrite: progress.canWrite, onProgressError: () => setSaveFailed(true) };
        return renderLesson?.(mode, bound);
      }} />{progress.status}</>;
}
