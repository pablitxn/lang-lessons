import { useEffect, useId, useRef, useState } from 'react';
import { TIMING, type SentenceEntry } from '../../contracts';
import { compareWrittenTranslation, MAX_WRITTEN_TRANSLATION_LENGTH, type WrittenComparisonResult } from './written-comparison';
import './written-translation.css';

export interface WrittenTranslationProps {
  sentence: SentenceEntry;
  onResultChange: (result: WrittenComparisonResult | undefined) => void;
  helpEnabled: boolean;
  hint: { status: 'loading' | 'ready' | 'unavailable'; text: string } | undefined;
}

/** Written comparison is independent of the lesson's audio evidence. */
export function WrittenTranslation(props: WrittenTranslationProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<WrittenComparisonResult>();
  const [compositionActive, setCompositionActive] = useState(false);
  const composing = useRef(false);
  const revision = useRef(0);
  const checkedRevision = useRef(-1);
  const currentDraft = useRef(draft);
  const latest = useRef(props);
  latest.current = props;
  currentDraft.current = draft;

  function clearResult() {
    setResult(undefined);
    latest.current.onResultChange(undefined);
  }

  function finalize() {
    const text = currentDraft.current;
    if (composing.current || !text.trim() || checkedRevision.current === revision.current) return;
    checkedRevision.current = revision.current;
    const comparison = compareWrittenTranslation(text, latest.current.sentence.alternatives);
    const next = comparison.status === 'empty' ? undefined : comparison;
    setResult(next);
    latest.current.onResultChange(next);
  }

  useEffect(() => {
    if (!draft.trim() || compositionActive) return;
    const scheduledRevision = revision.current;
    const timer = setTimeout(() => {
      if (scheduledRevision === revision.current) finalize();
    }, TIMING.typingDebounceMs);
    return () => clearTimeout(timer);
    // Parent callbacks and voice events do not restart the typing clock.
  }, [draft, compositionActive]);

  const current = compositionActive ? undefined : result;

  return <section className="sentences-written ll-field" data-status={current?.status ?? 'empty'} aria-label="Written translation">
    <label htmlFor={id} className="ll-sr-only">English translation</label>
    <div className="sentences-written-controls">
      <input id={id} type="text" value={draft} maxLength={MAX_WRITTEN_TRANSLATION_LENGTH}
        placeholder="Write your translation…" autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false}
        aria-describedby={current ? `${id}-feedback` : undefined}
        onChange={event => {
          const value = event.target.value;
          currentDraft.current = value;
          revision.current += 1;
          setDraft(value);
          clearResult();
        }}
        onCompositionStart={() => {
          composing.current = true;
          revision.current += 1;
          setCompositionActive(true);
          clearResult();
        }}
        onCompositionEnd={() => { composing.current = false; setCompositionActive(false); }}
        onBlur={event => {
          if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-skip-written-check]')) return;
          finalize();
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !composing.current) {
            event.preventDefault();
            finalize();
          }
        }} />
    </div>
    {current && <div id={`${id}-feedback`} role="status" aria-label="Written translation feedback">
      <WrittenFeedback key={current.submittedText} result={current} helpEnabled={props.helpEnabled} hint={props.hint} />
    </div>}
  </section>;
}

/** The error itself opens the same hover, keyboard and tap interaction as picture information. */
function WrittenFeedback({ result, helpEnabled, hint }: Pick<WrittenTranslationProps, 'helpEnabled' | 'hint'> & { result: WrittenComparisonResult }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const matched = result.status === 'matched';
  const different = result.status === 'different';
  const canHelp = helpEnabled && different;
  const visible = canHelp && open;
  useEffect(() => { if (!canHelp) setOpen(false); }, [canHelp]);
  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [visible]);
  const groups: { different: boolean; segments: WrittenComparisonResult['segments'] }[] = [];
  for (const segment of result.segments) {
    const previous = groups.at(-1);
    if (previous?.different === segment.different) previous.segments.push(segment);
    else groups.push({ different: segment.different, segments: [segment] });
  }
  return <div ref={root} className={`sentences-written-feedback${visible ? ' sentences-hint-open' : ''}`}
    onPointerLeave={event => { if (event.pointerType === 'mouse' && !root.current?.contains(document.activeElement)) setOpen(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}>
    {(matched || different) && <div className={`ll-spelling${matched ? ' ll-correct' : ''}`}>
      {matched && <span className="ll-outcome-icon" aria-hidden="true">✓</span>}
      {groups.map((group, index) => {
        const content = group.segments.map((segment, position) => <span key={position} data-gap={segment.gap || undefined}>{segment.gap ? '▴' : segment.text}</span>);
        return canHelp && group.different
          ? <button key={index} type="button" className="sentences-error-trigger ll-incorrect" aria-label="Translation hint"
            aria-describedby={visible ? id : undefined} aria-expanded={visible}
            onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}>{content}</button>
          : <span key={index} className={different && group.different ? 'll-incorrect' : undefined}>{content}</span>;
      })}
    </div>}
    {visible && <span id={id} role="tooltip" lang={hint?.status === 'ready' ? 'es' : 'en'} className="ll-written-hint sentences-error-tooltip">
      {!hint || hint.status === 'loading' ? 'Preparing a hint…' : hint.text}
    </span>}
    {matched && <span className="ll-sr-only">Translation checked.</span>}
    {different && <span className="ll-sr-only">Differences from a reference translation are highlighted; other wording may also be valid.</span>}
    {result.status === 'too-long' && <p className="ll-field-status">Use {MAX_WRITTEN_TRANSLATION_LENGTH.toLocaleString('en')} characters or fewer.</p>}
  </div>;
}
