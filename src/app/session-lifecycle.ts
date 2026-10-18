import type { CallSegmentRef, ProgressSink, SessionCommands } from '../contracts';
import { createExitCoordinator } from '../foundation/exit-coordinator';
import type { createSessionRuntime } from './session-runtime';

export interface SessionLifecyclePorts {
  sessions: SessionCommands;
  progress: Pick<ProgressSink, 'flush'>;
  freezeWrites(): void;
  releasePreparation(): void;
  operationId(): string;
  isCurrent(): boolean;
  navigate(target: string): void;
}

/** Memory-only UI coordination. Server commands remain the authority for lifecycle revisions. */
export function createSessionLifecycle(runtime: ReturnType<typeof createSessionRuntime>, ports: SessionLifecyclePorts) {
  let snapshot = { confirming: false, callStarting: false, busy: false, frozen: false, error: '', uncertainClose: false };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<typeof snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
  let decision: ((choice: 'cancel' | 'confirm') => void) | null = null;
  let segment: CallSegmentRef | null = null;
  let callOperation: Promise<void> | null = null;
  let epoch = 0;
  let disposed = false;
  const current = () => !disposed && ports.isCurrent();
  async function mutation() {
    const session = await ports.sessions.read(runtime.sessionId);
    if (!current() || session.sessionId !== runtime.sessionId || session.status !== 'open') throw new Error('Session is no longer active.');
    return { sessionId: runtime.sessionId, operationId: ports.operationId(), expectedRevision: session.revision };
  }
  async function endSegment() {
    if (!segment) return;
    const ending = segment;
    const result = await ports.sessions.stopCall({ ...await mutation(), segment: ending });
    if (result.sessionId !== runtime.sessionId || result.status !== 'open') throw new Error('Call stop response mismatch.');
    if (segment === ending) segment = null;
  }
  const coordinator = createExitCoordinator({
    exit: {
      sessionId: runtime.sessionId,
      async requestExit() {
        if (callOperation) await callOperation;
        if (!current()) return 'cancel';
        if (snapshot.error) throw new Error('Call lifecycle needs reconciliation.');
        if (!runtime.getSnapshot().hadConnectedCall) return 'confirm';
        runtime.hold('session-exit', true);
        update({ confirming: true });
        return new Promise<'cancel' | 'confirm'>(resolve => { decision = resolve; });
      },
      freezeWrites() { ports.freezeWrites(); update({ frozen: true }); runtime.hold('session-exit', true); },
      releasePreparation() { ports.releasePreparation(); update({ frozen: false }); runtime.hold('session-exit', false); },
    },
    progress: { async flush() {
      // Stop media only after confirmation. Finish lifecycle writes before reading the close revision.
      runtime.pause();
      await endSegment();
      return ports.progress.flush();
    } },
    sessions: {
      read: ports.sessions.read.bind(ports.sessions),
      async confirmClose(request) {
        try { return await ports.sessions.confirmClose(request); }
        catch (error) { update({ uncertainClose: true }); throw error; }
      },
    },
    operationId: ports.operationId, isCurrent: current, navigate: ports.navigate,
  });
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start(): Promise<void> {
      if (callOperation) return callOperation;
      if (!current() || snapshot.busy || snapshot.confirming || snapshot.frozen || snapshot.error || segment) return Promise.resolve();
      const token = ++epoch;
      update({ busy: true, callStarting: true, error: '' });
      callOperation = (async () => {
        const result = await ports.sessions.startCall(await mutation());
        if (result.session.sessionId !== runtime.sessionId || result.segment.sessionId !== runtime.sessionId
          || result.session.status !== 'open') throw new Error('Call start response mismatch.');
        segment = result.segment;
        if (!current()) return;
        if (token !== epoch) { await endSegment(); return; }
        try { await runtime.start(); }
        catch (error) { await endSegment(); throw error; }
      })().catch(() => { if (current()) update({ error: 'The tutor call could not be started. Session state needs checking.' }); })
        .finally(() => { callOperation = null; if (current()) update({ busy: false, callStarting: false }); });
      return callOperation;
    },
    stop(): Promise<void> {
      epoch++; runtime.pause();
      if (callOperation) return callOperation;
      update({ busy: true, error: '' });
      callOperation = endSegment().catch(() => { if (current()) update({ error: 'Audio stopped. The call record could not be confirmed.' }); })
        .finally(() => { callOperation = null; if (current()) update({ busy: false }); });
      return callOperation;
    },
    decide(choice: 'cancel' | 'confirm') {
      const resolve = decision; decision = null;
      update({ confirming: false });
      if (choice === 'cancel') runtime.hold('session-exit', false);
      resolve?.(choice);
    },
    async requestExit(target: string) {
      // A failed dispatched close stays frozen until a Q12 reconciliation policy is supplied.
      if (snapshot.uncertainClose || snapshot.error) return;
      update({ busy: true });
      try { return await coordinator.request(target); }
      catch { if (current()) update({ error: snapshot.frozen
        ? 'Session close could not be confirmed. Your session is held for reconciliation.'
        : 'Progress could not be saved. Your session remains open.' }); }
      finally { if (current()) update({ busy: false }); }
    },
    activate() { disposed = false; },
    dispose() { disposed = true; epoch++; decision?.('cancel'); decision = null; runtime.stop(); listeners.clear(); },
  };
}
export type SessionLifecycle = ReturnType<typeof createSessionLifecycle>;
