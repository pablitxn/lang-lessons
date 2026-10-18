import { useEffect, useId, useRef, useState } from 'react';
import { TIMING } from '../../contracts';
import type { AttemptRef, EvidenceResult, FormGuidance } from '../../contracts';
import { attemptKey, currentSpellingResult, spellingSegments } from './presentation';

export interface SpellingFieldProps {
  label: string;
  value: string;
  /** Allocate a new current attempt on every draft change, before assessment. */
  attempt?: AttemptRef;
  result?: EvidenceResult;
  processing?: boolean;
  helpEnabled?: boolean;
  untimedHelp?: boolean;
  guidance?: Pick<FormGuidance, 'ipa' | 'spanishSoundGuide'>;
  onChange: (value: string) => void;
  onFinalize: (value: string) => void;
  onActivity?: (activity: { inputFocused: boolean; compositionActive: boolean }) => void;
  onHoldChange?: (id: string, held: boolean) => void;
}

export function SpellingField(props: SpellingFieldProps) {
  const { label, value, attempt, result, processing = false, helpEnabled = false, untimedHelp = false, guidance } = props;
  const id = useId();
  const group = useRef<HTMLDivElement>(null);
  const help = useRef<HTMLSpanElement>(null);
  const composing = useRef(false);
  const focused = useRef(false);
  const [compositionActive, setCompositionActive] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [offered, setOffered] = useState(false);
  const remaining = useRef<number>(TIMING.helpOfferMs);
  const finalized = useRef('');
  const latest = useRef(props);
  latest.current = props;
  const key = `${attemptKey(attempt)}:${value}`;
  const current = !processing && !compositionActive ? currentSpellingResult(attempt, result, value) : undefined;
  const error = current?.status === 'incorrect';
  const accepted = current?.status === 'accepted';
  const eligible = helpEnabled && error;
  const offerKey = eligible ? `${attemptKey(current.ref)}:${current.spelling?.submittedText}` : '';

  function finalize() {
    if (`${attemptKey(latest.current.attempt)}:${latest.current.value}` !== key) return;
    if (composing.current || !value.trim() || finalized.current === key) return;
    finalized.current = key;
    latest.current.onFinalize(value);
  }

  function offerHelp() {
    if (eligible && !offered) {
      remaining.current = TIMING.helpOfferMs;
      setOffered(true);
    }
  }

  useEffect(() => {
    if (!value.trim() || compositionActive) return;
    const timer = setTimeout(finalize, TIMING.typingDebounceMs);
    return () => clearTimeout(timer);
    // Callback identity changes do not restart the typing clock.
  }, [key, compositionActive]);

  useEffect(() => {
    remaining.current = TIMING.helpOfferMs;
    setOffered(Boolean(offerKey));
    setGuideOpen(false);
  }, [offerKey]);

  useEffect(() => {
    if (untimedHelp && eligible) setOffered(true);
  }, [untimedHelp, offerKey]);

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!eligible || !offered || untimedHelp || guideOpen || engaged || hovered || hidden) return;
    const start = performance.now();
    const timer = setTimeout(() => setOffered(false), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - start));
    };
  }, [offerKey, eligible, offered, untimedHelp, guideOpen, engaged, hovered, hidden]);

  useEffect(() => {
    if (!guideOpen || !eligible) return;
    const hold = `${id}-sound-guide`;
    latest.current.onHoldChange?.(hold, true);
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !help.current?.contains(event.target)) closeGuide();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => {
      latest.current.onHoldChange?.(hold, false);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [id, guideOpen, eligible]);

  useEffect(() => () => latest.current.onActivity?.({ inputFocused: false, compositionActive: false }), []);

  function showGuide() {
    latest.current.onHoldChange?.(`${id}-sound-guide`, true);
    setGuideOpen(true);
  }

  function closeGuide() {
    latest.current.onHoldChange?.(`${id}-sound-guide`, false);
    setGuideOpen(false);
  }

  const status = processing ? 'Checking…' : accepted ? 'Correct form' : error ? current?.feedback || 'Check the highlighted letters or gap markers.'
    : current?.status === 'uncertain' ? 'Needs clarification. Try checking again.' : '';

  return <div className="ll-field" ref={group}
    onFocusCapture={event => {
      focused.current = true;
      setEngaged(Boolean((event.target as HTMLElement).closest('.ll-sound-help')));
      latest.current.onActivity?.({ inputFocused: true, compositionActive: composing.current });
    }}
    onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        focused.current = false; setEngaged(false);
        latest.current.onActivity?.({ inputFocused: false, compositionActive: composing.current });
      }
    }} onKeyDown={event => {
      if (event.key === 'Escape' && guideOpen) { event.preventDefault(); event.stopPropagation(); closeGuide(); }
    }}>
    <label htmlFor={id}>{label}</label>
    <div className="ll-field-controls">
      <input id={id} value={value} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
        aria-invalid={error || undefined} aria-describedby={`${id}-status${guideOpen && eligible ? ` ${id}-guide` : ''}`}
        onFocus={offerHelp}
        onChange={event => { finalized.current = ''; props.onChange(event.target.value); }}
        onCompositionStart={() => {
          composing.current = true; setCompositionActive(true);
          latest.current.onActivity?.({ inputFocused: focused.current, compositionActive: true });
        }}
        onCompositionEnd={() => {
          composing.current = false; setCompositionActive(false);
          latest.current.onActivity?.({ inputFocused: focused.current, compositionActive: false });
        }}
        onBlur={finalize}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && !composing.current) { event.preventDefault(); offerHelp(); finalize(); }
        }} />
    </div>
    {current && (accepted || error) && <div className="ll-spelling-feedback">
      <div className={`ll-spelling ${accepted ? 'll-correct' : ''}`} aria-hidden="true">
        <span className="ll-outcome-icon">{accepted ? '✓' : '!'}</span>
        {spellingSegments(current).map((segment, index) => <span key={index} className={!accepted && segment.incorrect ? 'll-incorrect' : undefined}
          data-gap={segment.gap || undefined}>{segment.text}</span>)}
      </div>
      {eligible && (offered || guideOpen) && <span ref={help} className="ll-sound-help"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); if (!help.current?.contains(document.activeElement)) closeGuide(); }}
        onFocus={showGuide} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) closeGuide(); }}>
        <button className="ll-sound-help-trigger" type="button" aria-label={`Sound help for ${label}`}
          aria-describedby={guideOpen ? `${id}-guide` : undefined} onMouseEnter={showGuide} onClick={showGuide}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01" />
          </svg>
        </button>
        {guideOpen && <span id={`${id}-guide`} className="ll-guide ll-sound-tooltip" role="tooltip">
          {guidance ? <><span className="ll-sound-tooltip-line"><span className="ll-muted">Phonetics</span><span className="ll-sound-quote">{guidance.ipa}</span></span>
            <span className="ll-sound-tooltip-line"><span className="ll-muted">Pronunciation (approx.)</span><span className="ll-sound-quote" lang="es">{guidance.spanishSoundGuide}</span></span></>
            : <span>Sound guidance is unavailable. You can ask your coach.</span>}
        </span>}
      </span>}
    </div>}
    <p className={`ll-field-status${error || accepted || !status ? ' ll-sr-only' : ''}`} id={`${id}-status`} role="status">{status}{!error && current?.feedback ? ` ${current.feedback}` : ''}</p>
  </div>;
}
