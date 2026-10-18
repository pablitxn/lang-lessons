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
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.79a2 2 0 0 1-.45 2.11L8.08 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.33 1.83.56 2.79.69A2 2 0 0 1 22 16.92Z" />
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
