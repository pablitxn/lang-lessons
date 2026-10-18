import type { CallSegmentRef, FeedbackState, ProgressFence, SessionSnapshot } from '../contracts';
import type { SessionLifecycle } from './session-lifecycle';

/** P4 integration ports; P2 owns authenticated reads and retry idempotency. */
export interface RecoveryIdentity { readonly accountId: string; readonly sessionId: string }
export interface RecoveryRecord extends RecoveryIdentity {
  readonly session: SessionSnapshot;
  readonly hadConnectedCall: boolean;
  readonly feedback: FeedbackState;
  readonly progress?: ProgressFence;
  readonly activeSegments?: readonly CallSegmentRef[];
  readonly feedbackJob?: { readonly jobId: string; readonly state: FeedbackState; readonly retryRevision: number } | null;
}
export interface RecoveryPractice {
  readonly lifecycle: SessionLifecycle;
  /** Detach account-scoped handles only. Never delete durable pending/history records. */
  release(): void;
}
export interface SessionRecoveryPorts {
  identity: RecoveryIdentity;
  isCurrent(): boolean;
  /** Root calls the listener synchronously when authentication/session ownership changes. */
  subscribeInvalidation(listener: () => void): () => void;
  read(identity: RecoveryIdentity, signal: AbortSignal): Promise<RecoveryRecord>;
  /** P5 restores the IndexedDB queue; root creates lifecycle with record.hadConnectedCall. No audio start. */
  preparePractice(record: RecoveryRecord, signal: AbortSignal): Promise<RecoveryPractice>;
  /** Mount the same canonical session and restored exercise/drafts; no automatic tutor start. */
  resume(record: RecoveryRecord): void | Promise<void>;
  retryFeedback(input: RecoveryIdentity & { operationId: string }, signal: AbortSignal): Promise<RecoveryRecord>;
  operationId(): string;
}
interface RecoverySnapshot {
  phase: 'idle' | 'loading' | 'available' | 'resumed' | 'invalidated';
  record: RecoveryRecord | null;
  lifecycle: SessionLifecycle | null;
  busy: boolean;
  error: string;
}
const feedbackStates = new Set<FeedbackState>(['not-requested', 'pending', 'running', 'succeeded', 'failed', 'insufficient-evidence']);

/** No local persistence or provider calls. Every mutation is an explicit user action. */
export function createSessionRecovery(ports: SessionRecoveryPorts) {
  const identity = { ...ports.identity };
  const abort = new AbortController();
  let disposed = false;
  let snapshot: RecoverySnapshot = { phase: 'idle', record: null, lifecycle: null, busy: false, error: '' };
  let practice: RecoveryPractice | null = null;
  let pending: Promise<void> | null = null;
  let retryOperation: string | null = null;
  const listeners = new Set<() => void>();
  const current = () => !disposed && !abort.signal.aborted && ports.isCurrent();
  const update = (patch: Partial<RecoverySnapshot>) => {
    snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener());
  };
  function validate(record: RecoveryRecord): RecoveryRecord {
    if (record.accountId !== identity.accountId || record.sessionId !== identity.sessionId
      || record.session.sessionId !== identity.sessionId || !feedbackStates.has(record.feedback)
      || typeof record.hadConnectedCall !== 'boolean'
      || !['open', 'closed'].includes(record.session.status)) throw new Error('Recovery identity mismatch');
    return { ...record, session: { ...record.session } };
  }
  function releasePractice() {
    const previous = practice; practice = null;
    previous?.lifecycle.dispose(); previous?.release();
  }
  function invalidate() {
    if (disposed) return;
    disposed = true; abort.abort(); retryOperation = null;
    update({ phase: 'invalidated', record: null, lifecycle: null, busy: false, error: '' });
    releasePractice();
  }
  const unsubscribe = ports.subscribeInvalidation(invalidate);
  function run(action: () => Promise<void>, message: string): Promise<void> {
    if (!current()) { invalidate(); return Promise.resolve(); }
    if (pending) return pending;
    // Assign pending before invoking injected code or notifying again.
    pending = Promise.resolve().then(() => { if (current()) return action(); }).catch(() => {
      if (current()) update({ error: message });
    }).finally(() => {
      pending = null;
      if (!current()) invalidate();
      else update({ busy: false });
    });
    update({ busy: true, error: '' });
    return pending;
  }
  async function read() {
    const record = validate(await ports.read(identity, abort.signal));
    if (!current()) return;
    if (record.session.status === 'closed') releasePractice();
    update({ phase: 'available', record, lifecycle: practice?.lifecycle ?? null });
  }
  async function prepare(record: RecoveryRecord) {
    if (practice) return practice;
    const next = await ports.preparePractice(record, abort.signal);
    if (!current()) { next.lifecycle.dispose(); next.release(); return null; }
    practice = next; update({ lifecycle: next.lifecycle });
    return next;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load() { return run(async () => { update({ phase: 'loading' }); await read(); }, 'Recovery status could not be loaded. Your saved progress has not been removed.'); },
    resume() { return run(async () => {
      const record = snapshot.record;
      if (!record || record.session.status !== 'open') return;
      const prepared = await prepare(record);
      if (!prepared || !current()) return;
      // A close already dispatched cannot be resumed until its authoritative state is reconciled.
      if (prepared.lifecycle.getSnapshot().frozen) throw new Error('Close is unresolved');
      await ports.resume(record);
      if (current()) update({ phase: 'resumed' });
    }, 'This session could not be resumed. Your saved progress has not been removed.'); },
    finalize(target: string) { return run(async () => {
      const record = snapshot.record;
      if (!record || record.session.status !== 'open') return;
      const prepared = await prepare(record);
      if (!prepared || !current()) return;
      const result = await prepared.lifecycle.requestExit(target);
      if (!current()) return;
      if (result === 'closed') await read();
      // Lifecycle surfaces confirmation, rejected progress and ambiguous close errors itself.
    }, 'This session could not be finalized. Your saved progress has not been removed.'); },
    retryFinalize() { return run(async () => {
      const result = await practice?.lifecycle.retryExit();
      if (current() && result === 'closed') await read();
    }, 'Finalization could not be confirmed. Your saved progress has not been removed.'); },
    retryFeedback() { return run(async () => {
      const record = snapshot.record;
      if (!record || record.session.status !== 'closed' || !record.hadConnectedCall || record.feedback !== 'failed') return;
      retryOperation ??= ports.operationId();
      const response = validate(await ports.retryFeedback({ ...identity, operationId: retryOperation }, abort.signal));
      if (response.session.status !== 'closed' || !response.hadConnectedCall) throw new Error('Invalid feedback retry result');
      if (!current()) return;
      retryOperation = null; update({ record: response });
    }, 'Feedback retry could not be confirmed. The comment is still pending; retry manually or check status.'); },
    dispose() { invalidate(); unsubscribe(); listeners.clear(); },
  };
}
export type SessionRecovery = ReturnType<typeof createSessionRecovery>;
