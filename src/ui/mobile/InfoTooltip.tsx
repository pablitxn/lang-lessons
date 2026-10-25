import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './info-tooltip.css';

export interface InfoTooltipProps {
  text: string;
  label: string;
  language?: string;
  id?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  holdId?: string;
  onHoldChange?: (id: string, held: boolean) => void;
  className?: string;
  buttonClassName?: string;
  tooltipClassName?: string;
  /** Related controls may open the same tooltip without being inside its anchor. */
  relatedTriggerSelector?: string;
  /** An error marker or input can own the floating help instead of the icon. */
  externalAnchor?: HTMLElement | null;
  portal?: boolean;
  placement?: 'above' | 'below';
  /** Use this surrounding box as the built-in icon's vertical boundary. */
  anchorBoundarySelector?: string;
  /** Portal placement must leave these visible learning surfaces uncovered. */
  avoidSelectors?: readonly string[];
  disabled?: boolean;
}

/** Shared hover/focus/tap help; the floating content never participates in cue layout. */
export function InfoTooltip(props: InfoTooltipProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = !props.disabled && (props.open ?? internalOpen);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(props); latest.current = props;
  const setOpen = useCallback((next: boolean) => {
    if (latest.current.open === undefined) setInternalOpen(next);
    latest.current.onOpenChange?.(next);
  }, []);
  const related = useCallback((target: EventTarget | null) => target instanceof Element
    && Boolean(latest.current.relatedTriggerSelector && target.closest(latest.current.relatedTriggerSelector)), []);
  const contains = useCallback((target: EventTarget | null) => target instanceof Node && Boolean(
    root.current?.contains(target) || tooltip.current?.contains(target) || latest.current.externalAnchor?.contains(target)), []);
  const containsFocus = useCallback(() => contains(document.activeElement) || related(document.activeElement), [contains, related]);
  const clearCloseTimer = useCallback(() => { clearTimeout(closeTimer.current); closeTimer.current = undefined; }, []);
  const leave = useCallback((target: EventTarget | null) => {
    if (contains(target) || related(target) || containsFocus()) return;
    clearCloseTimer();
    if (!latest.current.portal) { setOpen(false); return; }
    // The short grace period lets a pointer cross the gap into the floating text.
    closeTimer.current = setTimeout(() => { if (!containsFocus()) setOpen(false); }, 120);
  }, [clearCloseTimer, contains, containsFocus, related, setOpen]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);
  useEffect(() => { if (props.disabled) setOpen(false); }, [props.disabled, setOpen]);

  useLayoutEffect(() => {
    if (!open || !props.holdId) return;
    const holdId = props.holdId;
    const onHoldChange = props.onHoldChange;
    onHoldChange?.(holdId, true);
    return () => onHoldChange?.(holdId, false);
  }, [open, props.holdId, props.onHoldChange]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!contains(event.target) && !related(event.target)) setOpen(false);
    };
    const blur = (event: FocusEvent) => { if (!contains(event.target) && !related(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', blur);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', blur); document.removeEventListener('keydown', escape); };
  }, [open, contains, related, setOpen]);

  useEffect(() => {
    const anchor = props.externalAnchor;
    if (!open || !anchor) return;
    const pointerLeave = (event: PointerEvent) => leave(event.relatedTarget);
    anchor.addEventListener('pointerenter', clearCloseTimer);
    anchor.addEventListener('pointerleave', pointerLeave);
    return () => { anchor.removeEventListener('pointerenter', clearCloseTimer); anchor.removeEventListener('pointerleave', pointerLeave); };
  }, [open, props.externalAnchor, clearCloseTimer, leave]);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      if (!button.current || !tooltip.current || !root.current) return;
      if (props.portal) {
        const anchor = props.externalAnchor ?? button.current;
        const boundary = !props.externalAnchor && props.anchorBoundarySelector
          ? button.current.closest(props.anchorBoundarySelector) ?? anchor : anchor;
        positionPortal(tooltip.current, anchor, boundary, props.placement ?? 'above', props.avoidSelectors ?? []);
        return;
      }
      let top = (window.visualViewport?.offsetTop ?? 0) + 8;
      // Respect the exercise's scroll viewport as well as the browser viewport.
      for (let ancestor = root.current.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (/(auto|scroll|hidden|clip)/u.test(getComputedStyle(ancestor).overflowY)) {
          top = Math.max(top, ancestor.getBoundingClientRect().top + ancestor.clientTop + 8);
        }
      }
      const available = Math.max(0, button.current.getBoundingClientRect().top - top);
      tooltip.current.style.maxHeight = `${available}px`;
      tooltip.current.style.visibility = available < 24 ? 'hidden' : '';
    };
    position();
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    const observer = new ResizeObserver(position);
    if (button.current) observer.observe(button.current);
    if (props.externalAnchor) observer.observe(props.externalAnchor);
    return () => {
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      observer.disconnect();
    };
  }, [open, props.text, props.portal, props.externalAnchor, props.placement, props.anchorBoundarySelector, props.avoidSelectors]);

  const content = open && <span ref={tooltip} id={id} role="tooltip" lang={props.language ?? 'en'}
    className={`ll-info-tooltip${props.portal ? ' ll-info-tooltip-portal' : ''}${props.tooltipClassName ? ` ${props.tooltipClassName}` : ''}`}
    onMouseEnter={clearCloseTimer} onMouseLeave={event => leave(event.relatedTarget)}>{props.text}</span>;

  return <span ref={root} className={`ll-info-tooltip-root${props.className ? ` ${props.className}` : ''}`}
    onMouseEnter={clearCloseTimer} onMouseLeave={event => leave(event.relatedTarget)}
    onFocus={() => { if (!props.disabled) setOpen(true); }}
    onBlur={event => { if (!contains(event.relatedTarget) && !related(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}>
    <button ref={button} type="button" className={`ll-button ll-info-button${props.buttonClassName ? ` ${props.buttonClassName}` : ''}`}
      aria-label={props.label} aria-expanded={open} aria-describedby={open ? id : undefined}
      disabled={props.disabled} onMouseEnter={() => { if (!props.disabled) setOpen(true); }} onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" />
      </svg>
    </button>
    {props.portal && content ? createPortal(content, document.body) : content}
  </span>;
}

/** Choose nearby free vertical space without covering the prompt or answer input. */
function positionPortal(element: HTMLElement, anchor: HTMLElement, boundary: Element, placement: 'above' | 'below', avoidSelectors: readonly string[]) {
  const viewport = window.visualViewport;
  const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
  const topEdge = (viewport?.offsetTop ?? 0) + 8;
  const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
  const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
  const anchorBox = anchor.getBoundingClientRect();
  const boundaryBox = boundary.getBoundingClientRect();
  element.style.visibility = 'hidden';
  if (!anchor.isConnected || anchorBox.bottom <= topEdge || anchorBox.top >= bottomEdge) return;
  // A portal must not linger when its anchor has scrolled out of the exercise.
  for (let ancestor = anchor.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (!/(auto|scroll|hidden|clip)/u.test(getComputedStyle(ancestor).overflowY)) continue;
    const box = ancestor.getBoundingClientRect();
    if (anchorBox.bottom <= box.top || anchorBox.top >= box.bottom) return;
  }
  element.style.maxWidth = `${Math.max(0, Math.min(360, rightEdge - leftEdge))}px`;
  element.style.maxHeight = 'none';
  const width = element.getBoundingClientRect().width;
  const height = element.getBoundingClientRect().height;
  const left = Math.max(leftEdge, Math.min(anchorBox.left, rightEdge - width));
  let spaces = [{ top: topEdge, bottom: bottomEdge }];
  for (const selector of avoidSelectors) for (const protectedElement of document.querySelectorAll(selector)) {
    const box = protectedElement.getBoundingClientRect();
    if (!box.width || !box.height || box.right <= left || box.left >= left + width || getComputedStyle(protectedElement).visibility === 'hidden') continue;
    const top = box.top - 8; const bottom = box.bottom + 8;
    spaces = spaces.flatMap(space => bottom <= space.top || top >= space.bottom ? [space]
      : [{ top: space.top, bottom: Math.min(top, space.bottom) }, { top: Math.max(bottom, space.top), bottom: space.bottom }].filter(item => item.bottom > item.top));
  }
  const candidates = spaces.flatMap(space => {
    const belowTop = Math.max(space.top, boundaryBox.bottom + 8);
    const aboveBottom = Math.min(space.bottom, boundaryBox.top - 8);
    return [
      { placement: 'below', top: belowTop, bottom: space.bottom, distance: Math.max(0, belowTop - boundaryBox.bottom) },
      { placement: 'above', top: space.top, bottom: aboveBottom, distance: Math.max(0, boundaryBox.top - aboveBottom) },
    ].filter(item => item.bottom - item.top >= Math.min(40, height));
  });
  candidates.sort((a, b) => {
    const aFits = a.bottom - a.top >= height; const bFits = b.bottom - b.top >= height;
    return Number(bFits) - Number(aFits) || Number(b.placement === placement) - Number(a.placement === placement) || a.distance - b.distance;
  });
  const selected = candidates[0];
  if (!selected) return;
  const available = selected.bottom - selected.top;
  element.style.maxHeight = `${available}px`;
  const top = selected.placement === 'below' ? selected.top : selected.bottom - Math.min(height, available);
  element.style.left = `${left}px`; element.style.top = `${top}px`;
  element.dataset.placement = selected.placement;
  element.style.visibility = '';
}
