import type { CallSegmentRef, ProgressSink, SessionCommands } from '../contracts';
import { createExitCoordinator } from '../foundation/exit-coordinator';
import type { createSessionRuntime } from './session-runtime';

export interface SessionLifecyclePorts {
  /** Historical metadata only; previous calls never determine an exit confirmation. */
  hadConnectedCall?: boolean | null;
  sessions: SessionCommands;
  reconcileClose?(): Promise<void>;
  reportCall?(segment: CallSegmentRef, intervals: readonly { start: string; end: string }[]): Promise<void>;
  progress: Pick<ProgressSink, 'flush'>;
  freezeWrites(): void;
  releasePreparation(): void;
  operationId(): string;
  isCurrent(): boolean;
  navigate(target: string): void;
}

/** Memory-only UI coordination. Server commands remain the authority for lifecycle revisions. */
export function createSessionLifecycle(runtime: ReturnType<typeof createSessionRuntime>, ports: SessionLifecyclePorts, options: {
  /** Readiness only: this must not allocate a call or request microphone access. */
  prepareConnection?: (signal: AbortSignal) => Promise<void>;
} = {}) {
  let snapshot = { confirming: false, callStarting: false, busy: false, frozen: false, error: '', callError: '', uncertainClose: false, canRetryExit: false };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<typeof snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
  let decision: ((choice: 'cancel' | 'confirm') => void) | null = null;
  let segment: CallSegmentRef | null = null;
  let intervals: { start: string; end: string }[] = [];
  let connectedAt: number | null = null;
  const observe = () => {
    const ready = runtime.getSnapshot().state === 'ready';
    if (segment && ready && connectedAt === null) connectedAt = Date.now();
    if (!ready && connectedAt !== null) { intervals.push({ start: new Date(connectedAt).toISOString(), end: new Date(Math.max(connectedAt, Date.now())).toISOString() }); connectedAt = null; }
  };
  let unsubscribe: (() => void) | null = runtime.subscribe(observe);
  let callOperation: Promise<void> | null = null;
  let preparation: AbortController | null = null;
  let epoch = 0;
  let disposed = false;
  let exitTarget: string | null = null;
  let exitKind: 'save' | 'close' | null = null;
  let exitOperation: Promise<'saved' | 'closed' | 'cancelled' | 'stale' | undefined> | null = null;
  let saved = false;
  let pendingCallCleanup = false;
  const current = () => !disposed && ports.isCurrent();
  async function prepareConnection(signal: AbortSignal) {
    let onAbort!: () => void;
    try {
      await Promise.race([
        Promise.resolve().then(() => { signal.throwIfAborted(); return options.prepareConnection?.(signal); }),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(signal.reason);
          signal.addEventListener('abort', onAbort, { once: true });
          if (signal.aborted) onAbort();
        }),
      ]);
      signal.throwIfAborted();
    } finally { signal.removeEventListener('abort', onAbort); }
  }
  async function mutation() {
    const session = await ports.sessions.read(runtime.sessionId);
    if (!current() || session.sessionId !== runtime.sessionId || session.status !== 'open') throw new Error('Session is no longer active.');
    return { sessionId: runtime.sessionId, operationId: ports.operationId(), expectedRevision: session.revision };
  }
  async function endSegment() {
    if (!segment) return;
    observe();
    const ending = segment;
    if (ports.reportCall) { try { await ports.reportCall(ending, intervals); } catch { /* Missing metrics stay unavailable; never prevent safe cleanup. */ } }
    const result = await ports.sessions.stopCall({ ...await mutation(), segment: ending });
    if (result.sessionId !== runtime.sessionId || result.status !== 'open') throw new Error('Call stop response mismatch.');
    if (segment === ending) segment = null;
  }
  async function settleCall() {
    if (callOperation && snapshot.callStarting && runtime.getSnapshot().state !== 'ready') {
      epoch++; preparation?.abort(); runtime.pause();
    }
    if (callOperation) await callOperation;
    if (current() && snapshot.error) throw new Error('Call lifecycle needs reconciliation.');
  }
  function freezeWrites() { ports.freezeWrites(); update({ frozen: true }); runtime.hold('session-exit', true); }
  function releasePreparation() { ports.releasePreparation(); update({ frozen: false }); runtime.hold('session-exit', false); }
  function confirmCallExit(): Promise<'cancel' | 'confirm'> {
    if (!current()) return Promise.resolve('cancel');
    if (snapshot.error) return Promise.reject(new Error('Call lifecycle needs reconciliation.'));
    if (runtime.getSnapshot().state !== 'ready') return Promise.resolve('confirm');
    runtime.hold('session-exit', true);
    update({ confirming: true });
    return new Promise(resolve => { decision = resolve; });
  }
  const coordinator = createExitCoordinator({
    exit: {
      sessionId: runtime.sessionId,
      requestExit: confirmCallExit,
      freezeWrites, releasePreparation,
    },
    progress: { async flush() {
      // Stop media only after confirmation. Finish lifecycle writes before reading the close revision.
      runtime.pause();
      await endSegment();
      await ports.reconcileClose?.();
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
  async function saveWritten(target: string): Promise<'saved' | 'cancelled' | 'stale'> {
    if (await confirmCallExit() === 'cancel') return 'cancelled';
    if (!current()) return 'stale';
    pendingCallCleanup ||= Boolean(segment) || runtime.getSnapshot().state === 'ready';
    freezeWrites();
    try {
      runtime.pause(); await endSegment();
      if (!current()) { releasePreparation(); return 'stale'; }
      if (pendingCallCleanup) {
        await ports.reconcileClose?.();
        if (!current()) { releasePreparation(); return 'stale'; }
        pendingCallCleanup = false;
      }
      const receipt = await ports.progress.flush();
      if (!current()) { releasePreparation(); return 'stale'; }
      if (receipt.sessionId !== runtime.sessionId || !Number.isSafeInteger(receipt.journalRevision) || receipt.journalRevision < 0) throw new Error('Progress receipt mismatch');
      saved = true;
      ports.navigate(target);
      return 'saved';
    } catch (error) { releasePreparation(); throw error; }
  }
  function requestExit(target: string, finalize = false): Promise<'saved' | 'closed' | 'cancelled' | 'stale' | undefined> {
    if (exitOperation) return exitOperation;
    if (!current() || snapshot.uncertainClose || snapshot.error) return Promise.resolve(undefined);
    if (saved) return Promise.resolve('saved');
    exitTarget ??= target;
    // Assign before notifying subscribers: repeated clicks share one save/close operation.
    exitOperation = Promise.resolve().then(async () => {
      await settleCall();
      if (!current()) return 'stale' as const;
      exitKind ??= finalize ? 'close' : 'save';
      const result = exitKind === 'close' ? await coordinator.request(exitTarget!) : await saveWritten(exitTarget!);
      if (result === 'cancelled') { exitKind = null; exitTarget = null; }
      return result;
    }).catch(() => {
      if (current()) update({ canRetryExit: true, error: snapshot.frozen
        ? 'Session close could not be confirmed. Your session is held for reconciliation.'
        : 'Progress could not be saved. Your session remains open.' });
      return undefined;
    }).finally(() => { exitOperation = null; if (current()) update({ busy: false }); });
    update({ busy: true });
    return exitOperation;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** A successful readiness read clears only the transient preflight notice. */
    clearCallError() { if (current() && snapshot.callError) update({ callError: '' }); },
    start(): Promise<void> {
      if (callOperation) return callOperation;
      if (!current() || snapshot.busy || snapshot.confirming || snapshot.frozen || snapshot.error) return Promise.resolve();
      const state = runtime.getSnapshot().state;
      if (segment && state !== 'offline' && state !== 'error') return Promise.resolve();
      const token = ++epoch;
      update({ busy: true, callStarting: true, error: '', callError: '' });
      callOperation = (async () => {
        // A transport disconnect is not a server stop receipt. Reconcile before replacement.
        if (segment) { runtime.stop(); await endSegment(); }
        if (!current() || token !== epoch) return;
        if (options.prepareConnection) {
          const pending = new AbortController(); preparation = pending;
          try { await prepareConnection(pending.signal); }
          catch (error) {
            // A readiness failure has no server mutation to reconcile. Keep it
            // retryable and allow written-only exit without a lifecycle fence.
            if (current() && token === epoch && !pending.signal.aborted) update({ callError: error instanceof Error ? error.message : 'Tutor calls are unavailable. Please try again.' });
            return;
          } finally { if (preparation === pending) preparation = null; }
        }
        if (!current() || token !== epoch) return;
        const command = await mutation();
        if (!current() || token !== epoch) return;
        const result = await ports.sessions.startCall(command);
        if (result.session.sessionId !== runtime.sessionId || result.segment.sessionId !== runtime.sessionId
          || result.session.status !== 'open') throw new Error('Call start response mismatch.');
        segment = result.segment; intervals = []; connectedAt = null;
        if (!current()) return;
        if (token !== epoch) { await endSegment(); return; }
        try { await runtime.start(segment); }
        catch {
          // Media failure/cancellation is recoverable after an authoritative stop
          // receipt. The runtime retains its transport error for explicit retry.
          // A failed stop still reaches the outer unresolved-lifecycle fence.
          await endSegment();
        }
      })().catch(() => { if (current()) update({ error: 'The tutor call could not be started. Session state needs checking.' }); })
        .finally(() => { callOperation = null; if (current()) update({ busy: Boolean(exitOperation), callStarting: false }); });
      return callOperation;
    },
    stop(): Promise<void> {
      epoch++; preparation?.abort(); runtime.pause();
      if (callOperation) return callOperation;
      update({ busy: true, error: '', callError: '' });
      callOperation = endSegment().catch(() => { if (current()) update({ error: 'Audio stopped. The call record could not be confirmed.' }); })
        .finally(() => { callOperation = null; if (current()) update({ busy: Boolean(exitOperation) }); });
      return callOperation;
    },
    decide(choice: 'cancel' | 'confirm') {
      const resolve = decision; decision = null;
      update({ confirming: false });
      if (choice === 'cancel') runtime.hold('session-exit', false);
      resolve?.(choice);
    },
    requestExit(target: string) { return requestExit(target); },
    /** Explicit legacy recovery maintenance; ordinary navigation preserves written practice. */
    finalize(target: string) { return requestExit(target, true); },
    retryExit() {
      if (!snapshot.canRetryExit || snapshot.busy || exitTarget === null || !current()) return Promise.resolve();
      update({ error: '', uncertainClose: false, canRetryExit: false });
      return requestExit(exitTarget);
    },
    activate() {
      disposed = false;
      if (!unsubscribe) unsubscribe = runtime.subscribe(observe);
      observe();
    },
    dispose() {
      disposed = true; epoch++; preparation?.abort(); decision?.('cancel'); decision = null;
      // Observe the final offline transition before detaching so cleanup ends measured time.
      runtime.stop(); observe();
      unsubscribe?.(); unsubscribe = null; listeners.clear();
    },
  };
}
export type SessionLifecycle = ReturnType<typeof createSessionLifecycle>;
