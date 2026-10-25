import { InfoTooltip } from '../../ui/mobile/InfoTooltip';

const protectedSurfaces = ['.sentence-cue-help', '.sentences-written-controls', '.sentences-written .ll-spelling', '.ll-dock'] as const;

/** The prompt shares the same floating information control as both verb exercises. */
export function SentenceCueHelp({ spanish, hint, id, open, setOpen, anchor, setAnchor, disabled = false }: {
  spanish: string; hint: string; id: string; open: boolean; setOpen(open: boolean): void;
  anchor?: HTMLElement | null; setAnchor?: (anchor: HTMLElement | null) => void; disabled?: boolean;
}) {
  return <div className="ll-cue sentence-cue-help">
    <p className="ll-spanish" lang="es">{spanish}</p>
    <div className="sentence-cue-information" onPointerEnter={event => { if (event.currentTarget.contains(event.target as Node)) setAnchor?.(null); }}
      onFocusCapture={event => { if (event.currentTarget.contains(event.target as Node)) setAnchor?.(null); }}
      onClickCapture={event => { if (event.currentTarget.contains(event.target as Node)) setAnchor?.(null); }}>
      <InfoTooltip text={hint} label="Ayuda para traducir" language="es" id={id} open={open} onOpenChange={setOpen}
        buttonClassName="sentences-help-button" relatedTriggerSelector=".sentences-error-trigger"
        externalAnchor={anchor ?? null} portal placement={anchor ? 'below' : 'above'} anchorBoundarySelector=".sentence-cue-help"
        avoidSelectors={protectedSurfaces} disabled={disabled} />
    </div>
  </div>;
}
