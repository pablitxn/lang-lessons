import { useEffect, useId, useRef, useState } from 'react';

/** A hover/focus tooltip with tap support; reading it holds the current exercise. */
export function PictureInfo({ text, holdId, onHoldChange, label = 'Picture information' }: {
  text: string; holdId: string; onHoldChange: (id: string, held: boolean) => void; label?: string;
}) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  function show() { onHoldChange(holdId, true); setOpen(true); }
  function hide() { onHoldChange(holdId, false); setOpen(false); }
  useEffect(() => () => onHoldChange(holdId, false), [holdId, onHoldChange]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) hide();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, holdId, onHoldChange]);
  return <span ref={root} className="verbs-picture-info"
    onMouseLeave={() => { if (!root.current?.contains(document.activeElement)) hide(); }}
    onFocus={show} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); } }}>
    <button type="button" className="ll-button verbs-info-button" aria-label={label}
      aria-describedby={open ? id : undefined} onMouseEnter={show} onClick={show}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" />
      </svg>
    </button>
    {open && <span id={id} role="tooltip" lang="en" className="verbs-info-tooltip">{text}</span>}
  </span>;
}
