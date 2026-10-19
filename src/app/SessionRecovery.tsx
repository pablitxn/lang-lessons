import { useRef, useSyncExternalStore } from 'react';
import type { FeedbackState } from '../contracts';
import type { SessionRecovery as RecoveryController } from './session-recovery';
import { SessionExitDialog } from './SessionExitDialog';

const feedbackText: Record<FeedbackState, string> = {
  'not-requested': 'No tutor comment was requested.',
  pending: 'Your tutor comment is pending.',
  running: 'Your tutor comment is being prepared.',
  succeeded: 'Your tutor comment is saved.',
  failed: 'Your tutor comment is still pending because preparation failed. You can retry manually.',
  'insufficient-evidence': 'There was not enough observed interaction to prepare a tutor comment.',
};
/** Root owns controller lifetime and calls load after authenticating the returning account. */
export function SessionRecovery({ recovery, exitTarget, compact = false }: { recovery: RecoveryController; exitTarget: string; compact?: boolean }) {
  const finalizeButton = useRef<HTMLButtonElement>(null);
  const state = useSyncExternalStore(recovery.subscribe, recovery.getSnapshot);
  if (state.phase === 'invalidated' || state.phase === 'resumed') return null;
  return <section aria-label="Interrupted session recovery" aria-busy={state.busy}>
    {!compact && <h2>{state.record?.session.status === 'closed' ? 'Session finalized' : 'Continue your practice'}</h2>}
    {state.error && <p role="alert">{state.error}</p>}
    {!state.record && <p role="status">{state.busy ? 'Checking your saved session…' : 'Check for your saved session.'}</p>}
    {state.record?.session.status === 'open' && <>
      {state.record.hadConnectedCall === null && (compact ? <details><summary>About this saved session</summary><p>Previous call observations are unavailable. Finalizing will clean up the call and may have insufficient evidence for a tutor comment.</p></details>
        : <p>Previous call observations are unavailable. Finalizing will clean up the call and may have insufficient evidence for a tutor comment.</p>)}
      <p>{compact ? 'Your progress is saved. Pick up where you left off.' : 'Your previous session is still open. Resume it, or finalize it after saving pending progress.'}</p>
      <button type="button" disabled={state.busy} onClick={() => { void recovery.resume(); }}>Resume session</button>
      <button ref={finalizeButton} type="button" disabled={state.busy} onClick={() => { void recovery.finalize(exitTarget); }}>Finalize session</button>
    </>}
    {state.record?.session.status === 'closed' && <>
      <p role="status">{feedbackText[state.record.feedback]}</p>
      {state.record.hadConnectedCall && state.record.feedback === 'failed' && <button type="button" disabled={state.busy}
        onClick={() => { void recovery.retryFeedback(); }}>Retry tutor comment</button>}
    </>}
    <button type="button" disabled={state.busy} onClick={() => { void recovery.load(); }}>Check session status</button>
    {state.lifecycle && <SessionExitDialog lifecycle={state.lifecycle} returnFocus={finalizeButton} onRetry={() => { void recovery.retryFinalize(); }} />}
  </section>;
}
