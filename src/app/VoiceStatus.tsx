import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { createSessionRuntime } from './session-runtime';

export function VoiceStatus({ runtime, status, ready, failed, controls, target }: {
  runtime: ReturnType<typeof createSessionRuntime>;
  status: string; ready: boolean; failed: boolean; controls: ReactNode;
  target: HTMLElement | null;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const button = trigger.current;
    runtime.hold('root-voice-status', true);
    element?.showModal();
    return () => {
      element?.close();
      runtime.hold('root-voice-status', false);
      if (button?.isConnected) button.focus();
      else document.getElementById('profile-preferences')?.focus();
    };
  }, [open, runtime]);
  const compact = failed && target;
  return <>
    {!compact && <section className="voice-call-bar" aria-label="Voice call">
      <p className="voice-call-status" role="status"><span aria-hidden="true" className={ready ? 'call-indicator active' : 'call-indicator'} />{status}</p>
      {controls}
    </section>}
    {target && (failed || open) && createPortal(<>
      <button ref={trigger} type="button" className={`voice-status-badge${failed ? ' voice-status-error' : ''}`}
        aria-label={failed ? 'Voice unavailable' : 'Voice call details'} title={failed ? 'Voice unavailable' : 'Voice call details'}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 5a3 3 0 0 1 6 0v6M9 9v2a3 3 0 0 0 5 2M5 10v1a7 7 0 0 0 12 5M19 10v1M12 18v4M8 22h8M3 3l18 18" />
        </svg>
        <span className="sr-only" role="status">{failed ? 'Voice unavailable. Open for details.' : 'Voice connection updated.'}</span>
      </button>
      <dialog ref={dialog} id={id} className="voice-details-dialog" aria-labelledby={`${id}-title`}
        onCancel={event => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)}>
        <div className="voice-details-heading"><h2 id={`${id}-title`}>Voice call details</h2>
          <button type="button" className="quiet-button" aria-label="Close voice details" onClick={() => setOpen(false)}>×</button>
        </div>
        <p className="voice-call-status" role="status">{status}</p>
        {controls}
      </dialog>
    </>, target)}
  </>;
}
