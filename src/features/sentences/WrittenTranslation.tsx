import { useEffect, useId, useRef, useState } from 'react';
import { TIMING, type LearningLanguage, type SentenceEntry } from '../../contracts';
import { compareWrittenTranslation, MAX_WRITTEN_TRANSLATION_LENGTH, type WrittenComparisonResult } from './written-comparison';
import './written-translation.css';

export interface WrittenTranslationProps {
  sentence: SentenceEntry;
  language?: LearningLanguage;
  initialDraft?: string;
  initialFinalized?: boolean;
  onDraftChange?: (draft: string) => void;
  onResultChange: (result: WrittenComparisonResult | undefined) => void;
  helpEnabled: boolean;
  hint: { status: 'loading' | 'ready' | 'unavailable'; text: string } | undefined;
}

/** Written comparison is independent of the lesson's audio evidence. */
export function WrittenTranslation(props: WrittenTranslationProps) {
  const language = props.language ?? props.sentence.language ?? 'en';
  const localize = (english: string, spanish: string) => language === 'fr' ? spanish : english;
  const id = useId();
  const [draft, setDraft] = useState(props.initialDraft ?? '');
  const [result, setResult] = useState<WrittenComparisonResult | undefined>(() => props.initialFinalized ? compareWrittenTranslation(props.initialDraft ?? '', props.sentence.alternatives, language) : undefined);
  const [compositionActive, setCompositionActive] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const composing = useRef(false);
  const revision = useRef(0);
  const checkedRevision = useRef(props.initialFinalized ? 0 : -1);
  const currentDraft = useRef(draft);
  const latest = useRef(props);
  latest.current = props;
  currentDraft.current = draft;

  function clearResult() {
    setHintOpen(false);
    setResult(undefined);
    latest.current.onResultChange(undefined);
  }

  function finalize() {
    const text = currentDraft.current;
    if (composing.current || !text.trim() || checkedRevision.current === revision.current) return;
    checkedRevision.current = revision.current;
    const comparison = compareWrittenTranslation(text, latest.current.sentence.alternatives, latest.current.language ?? latest.current.sentence.language);
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
  const canHelp = props.helpEnabled && current?.status === 'different';

  return <section className="sentences-written ll-field" data-status={current?.status ?? 'empty'} aria-label={localize("Written translation", "Traducción escrita")}>
    <label htmlFor={id} className="ll-sr-only">{localize("English translation", "Traducción al francés")}</label>
    <div className="sentences-written-controls">
      <input id={id} lang={language} type="text" value={draft} maxLength={MAX_WRITTEN_TRANSLATION_LENGTH}
        placeholder={localize("Write your translation…", "Escribí tu traducción…")} autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false}
        aria-describedby={current ? `${id}-feedback${canHelp ? ` ${id}-help-shortcut` : ''}` : undefined}
        aria-keyshortcuts={canHelp ? 'Alt+ArrowDown' : undefined}
        onChange={event => {
          const value = event.target.value;
          currentDraft.current = value;
          revision.current += 1;
          setDraft(value);
          latest.current.onDraftChange?.(value);
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
          setHintOpen(false);
          if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-skip-written-check]')) return;
          finalize();
        }}
        onKeyDown={event => {
          if (canHelp && event.altKey && event.key === 'ArrowDown' && !event.nativeEvent.isComposing && !composing.current) {
            event.preventDefault(); setHintOpen(previous => !previous);
          }
          if (event.key === 'Escape' && hintOpen) { event.preventDefault(); event.stopPropagation(); setHintOpen(false); }
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !composing.current) {
            event.preventDefault();
            finalize();
          }
        }} />
    </div>
    {canHelp && <span id={`${id}-help-shortcut`} className="ll-sr-only">{localize('Press Alt+Down Arrow for a translation hint. Press Escape to close it.', 'Presioná Alt+Flecha abajo para ver una pista. Escape la cierra.')}</span>}
    {current && <div id={`${id}-feedback`} role="status" aria-label={localize("Written translation feedback", "Resultado de la traducción escrita")} tabIndex={-1}>
      <WrittenFeedback language={language} key={current.submittedText} result={current} helpEnabled={props.helpEnabled} hint={props.hint} open={hintOpen} setOpen={setHintOpen} />
    </div>}
  </section>;
}

/** The error itself opens the same hover, keyboard and tap interaction as picture information. */
function WrittenFeedback({ result, helpEnabled, hint, open, setOpen, language = 'en' }: Pick<WrittenTranslationProps, 'helpEnabled' | 'hint' | 'language'> & {
  result: WrittenComparisonResult; open: boolean; setOpen(open: boolean): void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const localize = (english: string, spanish: string) => language === 'fr' ? spanish : english;
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
    {(matched || different) && <div className={`ll-spelling${matched ? ' ll-correct' : ''}`} tabIndex={-1}>
      {matched && <span className="ll-outcome-icon" aria-hidden="true">✓</span>}
      {groups.map((group, index) => {
        const content = group.segments.map((segment, position) => <span key={position} data-gap={segment.gap || undefined}>{segment.gap ? '▴' : segment.text}</span>);
        return canHelp && group.different
          ? <button key={index} type="button" className="sentences-error-trigger ll-incorrect" aria-label={localize("Translation hint", "Pista para la traducción")} tabIndex={-1} title={localize("Translation hint (Alt+↓ from the answer)", "Pista para la traducción (Alt+↓ desde la respuesta)")}
            aria-describedby={visible ? id : undefined} aria-expanded={visible}
            onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}>{content}</button>
          : <span key={index} className={different && group.different ? 'll-incorrect' : undefined}>{content}</span>;
      })}
    </div>}
    {visible && <span id={id} role="tooltip" lang={hint?.status === 'ready' || language === 'fr' ? 'es' : 'en'} className="ll-written-hint sentences-error-tooltip">
      {!hint || hint.status === 'loading' ? localize('Preparing a hint…', 'Preparando una pista…') : hint.text}
    </span>}
    {matched && <span className="ll-sr-only">{localize('Translation checked.', 'Traducción comprobada.')}</span>}
    {different && <span className="ll-sr-only">{localize('Differences from a reference translation are highlighted; other wording may also be valid.', 'Se resaltan las diferencias con una traducción de referencia; otras formulaciones también pueden ser válidas.')}</span>}
    {result.status === 'too-long' && <p className="ll-field-status">{localize(`Use ${MAX_WRITTEN_TRANSLATION_LENGTH.toLocaleString('en')} characters or fewer.`, `Usá ${MAX_WRITTEN_TRANSLATION_LENGTH.toLocaleString('es')} caracteres o menos.`)}</p>}
  </div>;
}
