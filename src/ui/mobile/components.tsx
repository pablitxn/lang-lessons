import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { EvidenceLedger, ExerciseIdentity, LessonMode, SentenceStage, VoiceState } from '../../contracts';
import { progressItems, STATUS_TEXT } from './presentation';

export function PracticeLayout({ children, controls, progress, coach, mock = false }: {
  children: ReactNode; controls?: ReactNode; progress?: ReactNode; coach?: ReactNode; mock?: boolean;
}) {
  return <div className="ll-mobile">
    {mock && <p className="ll-mock" role="note">Mock practice · simulated assessments, no microphone or provider requests</p>}
    <div className="ll-practice-grid"><div className="ll-exercise">{children}</div>
      {progress && <aside className="ll-progress-region" aria-label="Exercise requirements">{progress}</aside>}
    </div>
    {coach && <div className="ll-coach-region">{coach}</div>}
    {controls && <div className="ll-dock">{controls}</div>}
  </div>;
}

export function ExerciseCue({ image, base, spanish, onAlternateCue }: {
  image?: { src: string; alt: string; attribution?: string };
  base?: string; spanish?: string; onAlternateCue?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image?.src]);
  return <div className="ll-cue">
    {image && <figure>{!failed ? <img src={image.src} alt={image.alt} onError={() => setFailed(true)} />
      : <p role="status">The picture is unavailable. Your progress is safe.</p>}
      <figcaption>{image.attribution && <span>{image.attribution}</span>}
        {onAlternateCue && <button type="button" className="ll-button" onClick={onAlternateCue}>Use another cue</button>}
      </figcaption></figure>}
    {base !== undefined && <><p className="ll-kicker">Supplied base form</p><p className="ll-base">{base}</p></>}
    {spanish !== undefined && <><p className="ll-kicker">Translate out loud</p><p className="ll-spanish" lang="es">{spanish}</p></>}
  </div>;
}

export function ObligationProgress({ mode, identity, evidence }: { mode: LessonMode; identity: ExerciseIdentity; evidence: EvidenceLedger }) {
  const items = progressItems(mode, identity, evidence);
  const accepted = items.filter(item => item.status === 'accepted').length;
  const groups = mode === 'sentence' ? [{ title: 'Translation and explanation', items }]
    : [
      { title: 'Meaning', items: items.filter(item => item.obligation === 'meaning') },
      { title: 'Pronunciation', items: items.filter(item => item.obligation.startsWith('pronunciation:')) },
      { title: 'Original sentences', items: items.filter(item => item.obligation.startsWith('sentence:')) },
      { title: 'Spelling', items: items.filter(item => item.obligation.startsWith('spelling:')) },
    ];
  return <section className="ll-progress" aria-label="Your progress">
    <h3>Your progress</h3>
    <p className="ll-progress-count">{accepted} <span>of {items.length} requirements accepted</span></p>
    <progress value={accepted} max={items.length} aria-label="Accepted requirements" />
    {groups.map(group => <details key={group.title} className="ll-obligations"><summary>{group.title}
      <span>{group.items.filter(item => item.status === 'accepted').length} / {group.items.length}</span></summary>
      <ul>{group.items.map(item => <li key={item.obligation}>
        <span className={item.status === 'accepted' ? 'll-correct' : undefined} aria-hidden="true">{item.status === 'accepted' ? '✓' : item.status === 'incorrect' ? '!' : item.status === 'uncertain' ? '?' : '○'}</span>
        <div>{item.label}<span className="ll-obligation-state">{STATUS_TEXT[item.status]}</span>
          {item.feedback && <p>{item.feedback}</p>}</div>
      </li>)}</ul>
    </details>)}
  </section>;
}

export interface ReferenceTableProps {
  title: string;
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  onHoldChange: (id: string, held: boolean) => void;
  /** Passed session controls remain reachable inside the modal sheet. */
  controls?: ReactNode;
}

export function ReferenceTable({ title, caption, columns, rows, onHoldChange, controls }: ReferenceTableProps) {
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
    <button ref={trigger} type="button" className="ll-button" aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(true)}>Reference table</button>
    <dialog className="ll-sheet" ref={dialog} id={id} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); close(); }}
      onClose={() => { setOpen(false); trigger.current?.focus(); }}>
      <div className="ll-sheet-heading"><h3 id={`${id}-title`}>{title}</h3><button type="button" className="ll-button" onClick={close}>Close table</button></div>
      <p className="ll-muted">Your exercise and conversation stay in place.</p>
      <div className="ll-table-scroll" role="region" aria-label={caption} tabIndex={0}>
        <table><caption>{caption}</caption><thead><tr>{columns.map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0
            ? <th scope="row" key={column}>{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table>
      </div>
      {controls && <div className="ll-sheet-controls">{controls}</div>}
    </dialog>
  </div>;
}

export interface VoiceControlsProps {
  state: VoiceState;
  muted: boolean;
  learnerSpeaking?: boolean;
  assistantSpeaking?: boolean;
  mock?: boolean;
  error?: string;
  onStart: () => void;
  onMute: (muted: boolean) => void;
  onStop: () => void;
}

export function VoiceControls({ state, muted, learnerSpeaking = false, assistantSpeaking = false, mock = false, error,
  onStart, onMute, onStop }: VoiceControlsProps) {
  const ready = state === 'ready';
  const waiting = state === 'connecting' || state === 'reconnecting';
  const label = mock ? `Mock session · ${state}` : state === 'offline' ? 'Voice disconnected' : state === 'error' ? 'Voice unavailable'
    : waiting ? 'Connecting voice…' : muted ? 'Microphone off' : learnerSpeaking ? 'Listening to you' : assistantSpeaking ? 'Coach speaking' : 'Microphone on';
  return <section className="ll-voice" aria-label="Conversation controls">
    <p className="ll-voice-status" role="status"><span aria-hidden="true">{ready ? '●' : '○'}</span> {label}</p>
    {error && <p className="ll-voice-error">{error}</p>}
    <div className="ll-actions">{!ready ? <button className="ll-button ll-primary" type="button" disabled={waiting} onClick={onStart}>
      {mock ? 'Start mock session' : state === 'error' ? 'Retry voice' : 'Start voice'}</button>
      : <button type="button" className="ll-button ll-primary" aria-pressed={muted} onClick={() => onMute(!muted)}>{muted ? 'Resume microphone' : 'Mute microphone'}</button>}
      <button type="button" className="ll-button" onClick={onStop}>Stop session</button>
    </div>
  </section>;
}

export function QuestionComposer({ onSubmit, onDraftActiveChange }: { onSubmit: (question: string) => void; onDraftActiveChange: (active: boolean) => void }) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const latest = useRef(onDraftActiveChange);
  const composing = useRef(false);
  const focused = useRef(false);
  latest.current = onDraftActiveChange;
  useEffect(() => () => latest.current(false), []);
  return <form className="ll-question" onSubmit={event => {
    event.preventDefault();
    if (!draft.trim() || composing.current) return;
    // Submission establishes questionPending before releasing the draft hold.
    onSubmit(draft.trim()); setDraft(''); latest.current(focused.current);
  }}>
    <label htmlFor={id}>Ask your coach a question</label>
    <div className="ll-field-controls"><input id={id} value={draft} placeholder="Ask anytime…" autoComplete="off"
      onFocus={() => { focused.current = true; latest.current(true); }}
      onBlur={() => { focused.current = false; latest.current(Boolean(draft.trim()) || composing.current); }}
      onChange={event => { setDraft(event.target.value); latest.current(Boolean(event.target.value.trim()) || composing.current || focused.current); }}
      onCompositionStart={() => { composing.current = true; latest.current(true); }}
      onCompositionEnd={() => { composing.current = false; latest.current(Boolean(draft.trim()) || focused.current); }} />
      <button className="ll-button" type="submit" disabled={!draft.trim()}>Ask</button></div>
    <p className="ll-muted">Questions keep you on this exercise. Practice answers are spoken.</p>
  </form>;
}

export function CoachMessage({ text, pending = false, uncertain = false, mock = false }: { text: string; pending?: boolean; uncertain?: boolean; mock?: boolean }) {
  return <section className="ll-coach" aria-label="Coach response"><p className="ll-kicker">{mock ? 'Mock coach' : 'Your coach'}</p>
    <p role="status">{pending ? 'Your coach is thinking…' : uncertain ? `Needs clarification: ${text}` : text}</p></section>;
}

export function CompletionNotice({ pending, onStay }: { pending: boolean; onStay: () => void }) {
  if (!pending) return null;
  return <div className="ll-completion"><p role="status">All requirements accepted. Finishing this conversation before the next exercise.</p>
    <button className="ll-button" type="button" onClick={onStay}>Stay here</button></div>;
}

export function SentencePrompt({ stage, onHint, onNext }: { stage: SentenceStage; onHint: () => void; onNext: () => void }) {
  return <section className="ll-sentence-stage" aria-label="Current sentence stage">
    <p role="status">{stage === 'translation' ? 'Translate the Spanish sentence out loud. Speak naturally.' : stage === 'explanation'
      ? 'Translation accepted. Name the tense and explain its structure, meaning, and why it fits.' : 'Translation and explanation accepted.'}</p>
    {stage === 'complete' ? <button type="button" className="ll-button ll-primary" onClick={onNext}>Next exercise</button>
      : <button type="button" className="ll-button" onClick={onHint}>Give me a hint</button>}
  </section>;
}
