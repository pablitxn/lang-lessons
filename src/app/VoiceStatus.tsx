import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** The header has one call action; status and microphone controls stay beside the exercise. */
export function VoiceStatus({ status, ready, active, controls, toggle, target }: {
  status: string; ready: boolean; active: boolean; controls: ReactNode; toggle: ReactNode;
  target: HTMLElement | null;
}) {
  return <>
    {target && createPortal(toggle, target)}
    {(active || !target) && <section className="voice-call-bar" aria-label="Voice call">
      <p className="voice-call-status" role="status"><span aria-hidden="true" className={ready ? 'call-indicator active' : 'call-indicator'} />{status}</p>
      <div className="voice-call-actions">{!target && toggle}{controls}</div>
    </section>}
  </>;
}
