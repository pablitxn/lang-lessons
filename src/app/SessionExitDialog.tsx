import { useEffect, useId, useRef, useSyncExternalStore, type RefObject } from 'react';
import type { SessionLifecycle } from './session-lifecycle';

export function SessionExitDialog({ lifecycle, returnFocus, onRetry }: { lifecycle: SessionLifecycle; returnFocus?: RefObject<HTMLButtonElement | null>; onRetry?: () => void }) {
  const state = useSyncExternalStore(lifecycle.subscribe, lifecycle.getSnapshot);
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (!state.confirming) return;
    const previous = returnFocus?.current ?? document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      requestAnimationFrame(() => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); });
    };
  }, [state.confirming, returnFocus]);
  return <>
    {state.error && <p role="alert">{state.error}</p>}
    {state.canRetryExit && <button type="button" disabled={state.busy}
      onClick={() => { if (onRetry) onRetry(); else void lifecycle.retryExit(); }}>Retry finalization</button>}
    <dialog ref={ref} aria-labelledby={id} onCancel={event => { event.preventDefault(); lifecycle.decide('cancel'); }}>
      <h2 id={id}>Leave this exercise session?</h2>
      <p>You used the tutor in this session. Leaving closes the session and requests a short tutor comment when eligible.</p>
      <button type="button" autoFocus onClick={() => lifecycle.decide('cancel')}>Keep practicing</button>
      <button type="button" onClick={() => lifecycle.decide('confirm')}>Leave session</button>
    </dialog>
  </>;
}
