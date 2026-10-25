import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { TIMING, type ExerciseIdentity, type LearningLanguage, type SentenceEntry } from '../../contracts';
import { compareWrittenTranslation, MAX_WRITTEN_TRANSLATION_LENGTH, reviewedFeedbackSegments, type WrittenComparisonResult } from './written-comparison';
import type { WrittenHintState } from './use-written-hint';
import './written-translation.css';
import { SentenceCueHelp } from './SentenceCueHelp';
import { SentenceDictionaryCard } from './SentenceDictionaryCard';

export interface WrittenTranslationProps {
  sentence: SentenceEntry;
  identity: ExerciseIdentity;
  navigation?: ReactNode;
  language?: LearningLanguage;
  initialDraft?: string;
  initialFinalized?: boolean;
  onDraftChange?: (draft: string) => void;
  onResultChange: (result: WrittenComparisonResult | undefined) => void;
  helpEnabled: boolean;
  hint: Omit<WrittenHintState, 'key'> | undefined;
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
  const [hintAnchor, setHintAnchor] = useState<HTMLElement | null>(null);
  const [dictionaryEnabled, setDictionaryEnabled] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const composing = useRef(false);
  const revision = useRef(0);
  const checkedRevision = useRef(props.initialFinalized ? 0 : -1);
  const currentDraft = useRef(draft);
  const latest = useRef(props);
  latest.current = props;
  currentDraft.current = draft;

  function clearResult() {
    setHintOpen(false);
    setHintAnchor(null);
    setSelectedWord(null);
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
  const reviewedAccepted = current?.status === 'different' && props.hint?.review?.status === 'accepted';
  const canHelp = !compositionActive;
  useEffect(() => { setHintOpen(false); }, [props.helpEnabled]);
  const guidance = reviewedAccepted ? 'Tu traducción es válida. Ahora podés identificar su tiempo verbal.' : current?.status === 'matched'
    ? 'La traducción coincide con una opción de referencia. Podés identificar el tiempo verbal y explorar otras maneras de decirlo.'
    : 'Leé la frase completa: ¿quién realiza la acción y cuándo ocurre? Traducí su significado sin copiar el orden de las palabras del español.';
  const hintText = hintAnchor?.dataset.translationHint ?? (props.helpEnabled && current?.status === 'different'
    ? !props.hint || props.hint.status === 'loading' ? 'Preparando una pista…'
      : props.hint.text
    : guidance);

  return <>
    <SentenceCueHelp spanish={props.sentence.spanish} hint={hintText} id={`${id}-hint`} open={hintOpen} setOpen={setHintOpen}
      anchor={hintAnchor} setAnchor={setHintAnchor} disabled={!canHelp} />
    <section className="sentences-written ll-field" data-status={reviewedAccepted ? 'matched' : current?.status ?? 'empty'} aria-label={localize("Written translation", "Traducción escrita")}>
    <label htmlFor={id} className="ll-sr-only">{localize("English translation", "Traducción al francés")}</label>
    <div className="sentences-navigation">
    <div className="sentences-written-controls">
      <input id={id} lang={language} type="text" value={draft} maxLength={MAX_WRITTEN_TRANSLATION_LENGTH}
        placeholder={localize("Write your translation…", "Escribí tu traducción…")} autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false}
        aria-describedby={[current ? `${id}-feedback` : '', canHelp ? `${id}-help-shortcut` : '', hintOpen ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined}
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
          if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-skip-written-check]')) return;
          finalize();
        }}
        onKeyDown={event => {
          if (event.key === 'Tab') setHintOpen(false);
          if (canHelp && event.altKey && event.key === 'ArrowDown' && !event.nativeEvent.isComposing && !composing.current) {
            event.preventDefault(); setHintAnchor(event.currentTarget); setHintOpen(previous => !previous);
          }
          if (event.key === 'Escape' && hintOpen) { event.preventDefault(); event.stopPropagation(); setHintOpen(false); }
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !composing.current) {
            event.preventDefault();
            finalize();
          }
        }} />
    </div>
    {props.navigation}
    </div>
    {canHelp && <span id={`${id}-help-shortcut`} className="ll-sr-only">{localize('Press Alt+Down Arrow for a translation hint. Press Escape to close it.', 'Presioná Alt+Flecha abajo para ver una pista. Escape la cierra.')}</span>}
    <WrittenFeedback language={language} feedbackId={`${id}-feedback`} hintId={`${id}-hint`} result={current} helpEnabled={props.helpEnabled} hint={props.hint} open={hintOpen} setOpen={setHintOpen}
      onHintAnchor={setHintAnchor} hintAnchor={hintAnchor}
      dictionaryEnabled={dictionaryEnabled} onDictionaryToggle={() => { setDictionaryEnabled(value => !value); setSelectedWord(null); setHintOpen(false); }}
      selectedWord={selectedWord} onSelectWord={word => { setSelectedWord(word); setHintOpen(false); }} />
    </section>
    {selectedWord && dictionaryEnabled && current && <SentenceDictionaryCard key={`${current.submittedText}:${selectedWord}`}
      word={selectedWord} identity={props.identity} sentence={props.sentence} onClose={() => setSelectedWord(null)} />}
  </>;
}

/** Annotation retains the submitted wording; dictionary mode turns whole words into controls. */
function WrittenFeedback({ result, feedbackId, hintId: id, helpEnabled, hint, open, setOpen, onHintAnchor, hintAnchor, language = 'en', dictionaryEnabled, onDictionaryToggle, selectedWord, onSelectWord }: Pick<WrittenTranslationProps, 'helpEnabled' | 'hint' | 'language'> & {
  result: WrittenComparisonResult | undefined; feedbackId: string; hintId: string; open: boolean; setOpen(open: boolean): void;
  onHintAnchor(anchor: HTMLElement): void;
  hintAnchor: HTMLElement | null;
  dictionaryEnabled: boolean; onDictionaryToggle(): void; selectedWord: string | null; onSelectWord(word: string): void;
}) {
  const localize = (english: string, spanish: string) => language === 'fr' ? spanish : english;
  const review = result?.status === 'different' && hint?.status === 'ready' ? hint.review : undefined;
  const matched = result?.status === 'matched' || review?.status === 'accepted';
  const different = result?.status === 'different';
  const canHelp = helpEnabled && review?.status === 'needs-revision';
  const segments = result ? reviewedFeedbackSegments(result, review) : [];
  return <div className="sentences-written-feedback"
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}>
    {(matched || different) && <div className="sentences-feedback-heading">
      <button type="button" className="sentences-dictionary-toggle" lang="es" aria-label="Diccionario" title="Diccionario" aria-pressed={dictionaryEnabled} onClick={onDictionaryToggle}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M10 4v12M3 3.5c3-.7 5 .1 7 1.3 2-1.2 4-2 7-1.3v12c-3-.7-5 .1-7 1.3-2-1.2-4-2-7-1.3z" /></svg>
      </button>
    </div>}
    {result && <div id={feedbackId} role="status" aria-label={localize('Written translation feedback', 'Resultado de la traducción escrita')} tabIndex={-1}>
      {(matched || different) && <div className={`ll-spelling${matched ? ' ll-correct' : ''}`} tabIndex={-1}>
        {matched && <span className="ll-outcome-icon" aria-hidden="true">✓</span>}
        {segments.map((segment, index) => {
          const content = segment.gap ? <span className="sentences-missing-text" data-gap lang="es"><span aria-hidden="true">Falta</span><span className="ll-sr-only">Falta texto</span></span> : segment.text;
          if (dictionaryEnabled && !segment.gap) return <span key={index} className={different && segment.different ? 'll-incorrect' : undefined}>
            <DictionaryWords text={segment.text} selectedWord={selectedWord} onSelect={onSelectWord} />
          </span>;
          return canHelp && segment.different
            ? <button key={index} type="button" className={`sentences-error-trigger${segment.gap ? '' : ' ll-incorrect'}`} aria-label={localize('Translation hint', 'Pista para la traducción')} tabIndex={-1}
              data-translation-hint={segment.hint}
              data-translation-issue={index}
              aria-describedby={open && hintAnchor?.dataset.translationIssue === String(index) ? id : undefined}
              aria-expanded={open && hintAnchor?.dataset.translationIssue === String(index)}
              onPointerEnter={event => { if (event.pointerType === 'mouse') { onHintAnchor(event.currentTarget); setOpen(true); } }}
              onFocus={event => { onHintAnchor(event.currentTarget); setOpen(true); }}
              onClick={event => { onHintAnchor(event.currentTarget); setOpen(true); }}>{content}</button>
            : <span key={index} className={different && segment.different && !segment.gap ? 'll-incorrect' : undefined}>{content}</span>;
        })}
      </div>}
      {matched && <span className="ll-sr-only">{localize('Translation checked.', 'Traducción comprobada.')}</span>}
      {result.status === 'too-long' && <p className="ll-field-status">{localize(`Use ${MAX_WRITTEN_TRANSLATION_LENGTH.toLocaleString('en')} characters or fewer.`, `Usá ${MAX_WRITTEN_TRANSLATION_LENGTH.toLocaleString('es')} caracteres o menos.`)}</p>}
    </div>}
  </div>;
}

function DictionaryWords({ text, selectedWord, onSelect }: { text: string; selectedWord: string | null; onSelect(word: string): void }) {
  const parts: ReactNode[] = []; let offset = 0;
  for (const match of text.matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu)) {
    const index = match.index!; const word = match[0];
    parts.push(text.slice(offset, index));
    parts.push(word.length <= 80 ? <button type="button" key={index} className="sentence-dictionary-word" aria-label={`Consultar ${word}`} aria-pressed={selectedWord === word} onClick={() => onSelect(word)}>{word}</button> : word);
    offset = index + word.length;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}
