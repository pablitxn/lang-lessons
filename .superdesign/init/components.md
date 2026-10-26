# Shared UI components

Generated 2026-10-24 from the local working tree on `codex/exercise-feedback`, base `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. This discovery snapshot includes in-progress changes. It is design context, not a release or runtime receipt. No secrets, local account configuration, model generation, or external assets were inspected.

React 19.3 with TypeScript and Vite 8.3; custom React primitives, native dialogs and ordinary imported CSS. There is no Tailwind, component framework, external font dependency or icon package. Use the existing local inline SVG icon conventions.

## `src/ui/mobile/components.tsx`

Full shared primitives: PracticeLayout, ExerciseCue, ObligationProgress, LessonDialog, ProgressDialog, ReferenceTable and SentencePrompt. Layout accepts children/controls; dialog helpers preserve current identity and hold presentation while open.

SHA-256: `5b83a57a4bc887cd1c615db71ddccfccd8f6b7ada2b06dae444c1863a18248e1`

```tsx
import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { EvidenceLedger, ExerciseIdentity, LessonMode, SentenceStage, LearningLanguage } from '../../contracts';
import { LessonToolsVisible } from './lesson-tools-context';
import { progressItems, STATUS_TEXT } from './presentation';

export function PracticeLayout({ children, controls }: {
  children: ReactNode; controls?: ReactNode;
}) {
  const showTools = useContext(LessonToolsVisible);
  return <div className="ll-mobile">
    <div className="ll-exercise">{children}</div>
    {showTools && controls && <footer className="ll-dock" aria-label="Lesson tools">{controls}</footer>}
  </div>;
}

export function ExerciseCue({ image, base, spanish, imageInfo }: {
  image?: { src: string; alt: string; attribution?: string };
  base?: string; spanish?: string; imageInfo?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image?.src]);
  return <div className="ll-cue">
    {image && <figure>{!failed ? <img src={image.src} alt={image.alt} onError={() => setFailed(true)} />
      : <p role="status">The picture is unavailable. Your progress is safe.</p>}
      {imageInfo && <figcaption>{imageInfo}</figcaption>}</figure>}
    {base !== undefined && <><p className="ll-kicker">Supplied base form</p><p className="ll-base">{base}</p></>}
    {spanish !== undefined && <p className="ll-spanish" lang="es">{spanish}</p>}
  </div>;
}

export function ObligationProgress({ mode, identity, evidence, language = 'en' }: { mode: LessonMode; identity: ExerciseIdentity; evidence: EvidenceLedger; language?: LearningLanguage }) {
  const text = (en: string, es: string) => language === 'fr' ? es : en;
  const statuses = language === 'fr' ? { 'not-attempted': 'Pendiente', processing: 'Comprobando', uncertain: 'Necesita aclaración', incorrect: 'Intentá de nuevo', accepted: 'Hecho' } : STATUS_TEXT;
  const items = progressItems(mode, identity, evidence, language);
  const accepted = items.filter(item => item.status === 'accepted').length;
  const groups = mode === 'sentence' ? [{ title: text('Translation and explanation', 'Traducción y explicación'), items }]
    : [
      { title: text('Meaning', 'Significado'), items: items.filter(item => item.obligation === 'meaning') },
      { title: text('Pronunciation', 'Pronunciación'), items: items.filter(item => item.obligation.startsWith('pronunciation:')) },
      { title: text('Original sentences', 'Oraciones propias'), items: items.filter(item => item.obligation.startsWith('sentence:')) },
      { title: text('Spelling', 'Escritura'), items: items.filter(item => item.obligation.startsWith('spelling:')) },
    ];
  return <section className="ll-progress" aria-label="Your progress">
    <h3>{text('Your progress', 'Tu progreso')}</h3>
    <p className="ll-progress-count">{accepted} <span>{text('of', 'de')} {items.length} {text('requirements accepted', 'requisitos aceptados')}</span></p>
    <progress value={accepted} max={items.length} aria-label="Accepted requirements" />
    {groups.map(group => <details key={group.title} className="ll-obligations"><summary>{group.title}
      <span>{group.items.filter(item => item.status === 'accepted').length} / {group.items.length}</span></summary>
      <ul>{group.items.map(item => <li key={item.obligation}>
        <span className={item.status === 'accepted' ? 'll-correct' : undefined} aria-hidden="true">{item.status === 'accepted' ? '✓' : item.status === 'incorrect' ? '!' : item.status === 'uncertain' ? '?' : '○'}</span>
        <div>{item.label}<span className="ll-obligation-state">{statuses[item.status]}</span>
          {item.feedback && <p>{item.feedback}</p>}</div>
      </li>)}</ul>
    </details>)}
  </section>;
}

export interface ReferenceTableProps {
  language?: LearningLanguage;
  title: string;
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  onHoldChange: (id: string, held: boolean) => void;
  /** Passed session controls remain reachable inside the modal sheet. */
  controls?: ReactNode;
}

export interface LessonDialogProps {
  title: string;
  triggerLabel: string;
  closeLabel: string;
  children: ReactNode;
  onHoldChange: (id: string, held: boolean) => void;
  controls?: ReactNode;
  triggerIcon?: 'progress' | 'reference';
  triggerText?: string;
}

function ToolIcon({ kind }: { kind: 'progress' | 'reference' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'progress' ? <path d="M4 3v18h17M9 15v-4M14 15V7M19 15V4" />
      : <><path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z" /><path d="M12 5v15" /></>}
  </svg>;
}

export function LessonDialog({ title, triggerLabel, closeLabel, children, onHoldChange, controls, triggerIcon, triggerText }: LessonDialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const latestHold = useRef(onHoldChange);
  latestHold.current = onHoldChange;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    latestHold.current(id, true);
    dialog.current?.showModal();
    return () => { dialog.current?.close(); latestHold.current(id, false); };
  }, [open, id]);
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }
  return <div className="ll-reference">
    <button ref={trigger} type="button" className={triggerIcon ? 'll-button ll-tool-button' : 'll-button'} aria-label={triggerLabel}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      onClick={() => { latestHold.current(id, true); setOpen(true); }}>
      {triggerIcon && <span className="ll-tool-icon"><ToolIcon kind={triggerIcon} /></span>}
      <span>{triggerText ?? triggerLabel}</span>
    </button>
    <dialog className="ll-sheet" ref={dialog} id={id} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); close(); }}
      onClose={() => { setOpen(false); trigger.current?.focus(); }}>
      <div className="ll-sheet-heading"><h3 id={`${id}-title`}>{title}</h3><button type="button" className="ll-button" onClick={close}>{closeLabel}</button></div>
      {children}
      {controls && <div className="ll-sheet-controls">{controls}</div>}
    </dialog>
  </div>;
}

export function ProgressDialog({ mode, identity, evidence, onHoldChange, controls, children, language = 'en' }: {
  mode: LessonMode; identity: ExerciseIdentity; evidence: EvidenceLedger; language?: LearningLanguage;
  onHoldChange: LessonDialogProps['onHoldChange']; controls?: ReactNode; children?: ReactNode;
}) {
  return <LessonDialog title={language === 'fr' ? 'Progreso de la clase' : 'Lesson progress'} triggerLabel={language === 'fr' ? 'Tu progreso' : 'Your progress'} triggerText={language === 'fr' ? 'Progreso' : 'Progress'} triggerIcon="progress"
    closeLabel={language === 'fr' ? 'Cerrar progreso' : 'Close progress'} onHoldChange={onHoldChange} controls={controls}>
    {children}
    <ObligationProgress language={language} mode={mode} identity={identity} evidence={evidence} />
  </LessonDialog>;
}

export function ReferenceTable({ title, caption, columns, rows, onHoldChange, controls, language = 'en' }: ReferenceTableProps) {
  return <LessonDialog title={title} triggerLabel={language === 'fr' ? 'Tabla de referencia' : 'Reference table'} triggerText={language === 'fr' ? 'Referencia' : 'Reference'} triggerIcon="reference"
    closeLabel={language === 'fr' ? 'Cerrar tabla' : 'Close table'} onHoldChange={onHoldChange} controls={controls}>
      <div className="ll-table-scroll" role="region" aria-label={caption} tabIndex={0}>
        <table><caption>{caption}</caption><thead><tr>{columns.map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0
            ? <th scope="row" key={column}>{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table>
      </div>
  </LessonDialog>;
}

export function SentencePrompt({ stage, onHint, onNext, showHint = true, language = 'en' }: { stage: SentenceStage; onHint: () => void; onNext: () => void; showHint?: boolean; language?: LearningLanguage }) {
  const text = (en: string, es: string) => language === 'fr' ? es : en;
  if (stage === 'translation' && !showHint) return null;
  return <section className="ll-sentence-stage" aria-label="Current sentence stage">
    {stage !== 'translation' && <p role="status">{stage === 'explanation'
      ? text('Translation accepted. Name the tense and explain its structure, meaning, and why it fits.', 'Traducción aceptada. Nombrá el tiempo y explicá su estructura, significado y por qué corresponde.') : text('Translation and explanation accepted.', 'Traducción y explicación aceptadas.')}</p>}
    {stage === 'complete' ? <button type="button" className="ll-button ll-primary ll-next" aria-label="Next exercise" title="Next exercise" onClick={onNext}><span aria-hidden="true">→</span></button>
      : showHint && <button type="button" className="ll-button" onClick={onHint}>{text('Ask voice coach for a hint', 'Pedir una pista al tutor')}</button>}
  </section>;
}
```

## `src/ui/mobile/SpellingField.tsx`

Accessible typed form with debounced verification, IME handling, feedback and optional sound guidance. Props include current identity, form guidance and finalization callbacks.

SHA-256: `e2af44dc4675dde48f5b15a67ee5480f9986f071454a5b5286fa53c6e1b282e9`

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { TIMING } from '../../contracts';
import type { AttemptRef, EvidenceResult, FormGuidance, LearningLanguage } from '../../contracts';
import { attemptKey, currentSpellingResult, spellingSegments } from './presentation';

export interface SpellingFieldProps {
  language?: LearningLanguage;
  label: string;
  value: string;
  /** Allocate a new current attempt on every draft change, before assessment. */
  attempt?: AttemptRef;
  result?: EvidenceResult;
  processing?: boolean;
  helpEnabled?: boolean;
  untimedHelp?: boolean;
  guidance?: Pick<FormGuidance, 'ipa' | 'spanishSoundGuide'> | undefined;
  onChange: (value: string) => void;
  onFinalize: (value: string) => void;
  onActivity?: (activity: { inputFocused: boolean; compositionActive: boolean }) => void;
  onHoldChange?: (id: string, held: boolean) => void;
}

export function SpellingField(props: SpellingFieldProps) {
  const { label, value, attempt, result, processing = false, helpEnabled = false, untimedHelp = false, guidance } = props;
  const text = (en: string, es: string) => props.language === 'fr' ? es : en;
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

  const status = processing ? text('Checking…', 'Comprobando…') : accepted ? text('Correct form', 'Forma correcta') : error ? props.language === 'fr' ? 'Revisá las letras resaltadas o las marcas de letras faltantes.' : current?.feedback || 'Check the highlighted letters or gap markers.'
    : current?.status === 'uncertain' ? text('Needs clarification. Try checking again.', 'Necesita aclaración. Volvé a comprobar.') : '';

  return <div className="ll-field" ref={group}
    onFocusCapture={event => {
      focused.current = true;
      setEngaged(Boolean((event.target as HTMLElement).closest('.ll-sound-help')));
      latest.current.onActivity?.({ inputFocused: true, compositionActive: composing.current });
    }}
    onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        focused.current = false; setEngaged(false);
        closeGuide();
        latest.current.onActivity?.({ inputFocused: false, compositionActive: composing.current });
      }
    }} onKeyDown={event => {
      if (event.key === 'Escape' && guideOpen) { event.preventDefault(); event.stopPropagation(); closeGuide(); }
    }}>
    <label htmlFor={id}>{label}</label>
    <div className="ll-field-controls">
      <input id={id} lang={props.language ?? 'en'} value={value} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
        aria-invalid={error || undefined} aria-describedby={`${id}-status${eligible ? ` ${id}-help-shortcut` : ''}${guideOpen && eligible ? ` ${id}-guide` : ''}`}
        aria-keyshortcuts={eligible ? 'Alt+ArrowDown' : undefined}
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
          if (eligible && event.altKey && event.key === 'ArrowDown' && !event.nativeEvent.isComposing && !composing.current) {
            event.preventDefault(); setOffered(true); if (guideOpen) closeGuide(); else showGuide();
          }
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && !composing.current) { event.preventDefault(); offerHelp(); finalize(); }
        }} />
    </div>
    {current && (accepted || error) && <div className="ll-spelling-feedback">
      <div className={`ll-spelling ${accepted ? 'll-correct' : ''}`} aria-hidden="true" tabIndex={-1}>
        <span className="ll-outcome-icon">{accepted ? '✓' : '!'}</span>
        {spellingSegments(current).map((segment, index) => <span key={index} className={!accepted && segment.incorrect ? 'll-incorrect' : undefined}
          data-gap={segment.gap || undefined}>{segment.text}</span>)}
      </div>
      {eligible && (offered || guideOpen) && <span ref={help} className="ll-sound-help"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); if (!help.current?.contains(document.activeElement)) closeGuide(); }}
        onFocus={showGuide} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) closeGuide(); }}>
        <button className="ll-sound-help-trigger" type="button" aria-label={`${text('Sound help for', 'Ayuda de pronunciación para')} ${label}`} tabIndex={-1} title={text('Sound help (Alt+↓ from the answer)', 'Ayuda de pronunciación (Alt+↓ desde la respuesta)')}
          aria-describedby={guideOpen ? `${id}-guide` : undefined} onMouseEnter={showGuide} onClick={showGuide}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01" />
          </svg>
        </button>
        {guideOpen && <span id={`${id}-guide`} className="ll-guide ll-sound-tooltip" role="tooltip">
          {guidance ? <><span className="ll-sound-tooltip-line"><span className="ll-muted">{text('Phonetics', 'Fonética')}</span><span className="ll-sound-quote">{guidance.ipa}</span></span>
            <span className="ll-sound-tooltip-line"><span className="ll-muted">{text('Pronunciation (approx.)', 'Pronunciación aproximada')}</span><span className="ll-sound-quote" lang="es">{guidance.spanishSoundGuide}</span></span></>
            : <span>{text('Sound guidance is unavailable. You can ask your coach.', 'La guía de pronunciación no está disponible. Podés consultar al tutor.')}</span>}
        </span>}
      </span>}
    </div>}
    {eligible && <span id={`${id}-help-shortcut`} className="ll-sr-only">{text('Press Alt+Down Arrow for sound help. Press Escape to close it.', 'Presioná Alt+Flecha abajo para ver la pronunciación y Escape para cerrar.')}</span>}
    <p className={`ll-field-status${error || accepted || !status ? ' ll-sr-only' : ''}`} id={`${id}-status`} role="status" tabIndex={-1}>{status}{props.language !== 'fr' && !error && current?.feedback ? ` ${current.feedback}` : ''}</p>
  </div>;
}
```

## `src/ui/mobile/lesson-tools-context.ts`

Shared visibility context for the optional lesson footer.

SHA-256: `b01eece3cb5bbe228fc795475c131b1cd6c8dd5d5c8fbce7790d439e903d5cf0`

```ts
import { createContext } from 'react';
/** Standalone diagnostic fixtures keep tools; the production root suppresses lesson navigation. */
export const LessonToolsVisible = createContext(true);
```

## `src/ui/mobile/index.ts`

Public UI entry point and style import.

SHA-256: `69b79d8c1d9d8d6d935352168e2c380d10a3db09a5672602fa4ad4764132c97e`

```ts
import './mobile.css';

export { PracticeLayout, ExerciseCue, ObligationProgress, ProgressDialog, LessonDialog, ReferenceTable, SentencePrompt } from './components';
export type { LessonDialogProps, ReferenceTableProps } from './components';
export { SpellingField } from './SpellingField';
export type { SpellingFieldProps } from './SpellingField';
export { currentSpellingResult, spellingSegments, progressItems } from './presentation';
```
