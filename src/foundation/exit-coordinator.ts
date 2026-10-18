import type { CloseResult, ConfirmCloseRequest, ExitPreparation, SessionCommands } from '../contracts/session';
import type { ProgressSink } from '../contracts/progress';

/** Root supplies navigation; P4 owns decisions/freeze. No browser history or UI policy here. */
export function createExitCoordinator<T>(ports: {
  exit: ExitPreparation; progress: Pick<ProgressSink, 'flush'>;
  sessions: Pick<SessionCommands, 'read' | 'confirmClose'>;
  operationId(): string; isCurrent(): boolean; navigate(target: T): void;
}) {
  let pending: Promise<'cancelled' | 'closed' | 'stale'> | null = null;
  let prepared: { request: ConfirmCloseRequest; target: T } | null = null;
  let completed: CloseResult | null = null;
  async function perform(target: T): Promise<'cancelled' | 'closed' | 'stale'> {
    if (!ports.isCurrent()) return 'stale';
    if (completed) return 'closed';
    if (!prepared) {
      if (await ports.exit.requestExit() === 'cancel') return 'cancelled';
      if (!ports.isCurrent()) return 'stale';
      ports.exit.freezeWrites();
      try {
        const finalProgress = await ports.progress.flush();
        if (!ports.isCurrent()) { ports.exit.releasePreparation(); return 'stale'; }
        if (finalProgress.sessionId !== ports.exit.sessionId) throw new Error('Progress session mismatch');
        const session = await ports.sessions.read(ports.exit.sessionId);
        if (!ports.isCurrent()) { ports.exit.releasePreparation(); return 'stale'; }
        if (session.sessionId !== ports.exit.sessionId || session.status !== 'open') throw new Error('Session not open');
        prepared = { target, request: { sessionId: session.sessionId, operationId: ports.operationId(),
          expectedRevision: session.revision, finalProgress: { ...finalProgress } } };
      } catch (error) { ports.exit.releasePreparation(); throw error; }
    }
    // After ambiguous dispatch failure, retain the same payload/key and write freeze for explicit retry.
    const result = await ports.sessions.confirmClose(prepared.request);
    if (result.sessionId !== prepared.request.sessionId || result.operationId !== prepared.request.operationId
      || result.status !== 'closed') throw new Error('Close response mismatch');
    completed = result;
    if (!ports.isCurrent()) return 'stale';
    ports.navigate(prepared.target);
    return 'closed';
  }
  return {
    request(target: T) {
      if (pending) return pending;
      pending = perform(target).finally(() => { pending = null; });
      return pending;
    },
  };
}
