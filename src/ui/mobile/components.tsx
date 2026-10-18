import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { EvidenceLedger, ExerciseIdentity, LessonMode, SentenceStage } from '../../contracts';
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

export function ProgressDialog({ mode, identity, evidence, onHoldChange, controls, children }: {
  mode: LessonMode; identity: ExerciseIdentity; evidence: EvidenceLedger;
  onHoldChange: LessonDialogProps['onHoldChange']; controls?: ReactNode; children?: ReactNode;
}) {
  return <LessonDialog title="Lesson progress" triggerLabel="Your progress" triggerText="Progress" triggerIcon="progress"
    closeLabel="Close progress" onHoldChange={onHoldChange} controls={controls}>
    {children}
    <ObligationProgress mode={mode} identity={identity} evidence={evidence} />
  </LessonDialog>;
}

export function ReferenceTable({ title, caption, columns, rows, onHoldChange, controls }: ReferenceTableProps) {
  return <LessonDialog title={title} triggerLabel="Reference table" triggerText="Reference" triggerIcon="reference"
    closeLabel="Close table" onHoldChange={onHoldChange} controls={controls}>
      <div className="ll-table-scroll" role="region" aria-label={caption} tabIndex={0}>
        <table><caption>{caption}</caption><thead><tr>{columns.map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0
            ? <th scope="row" key={column}>{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table>
      </div>
  </LessonDialog>;
}

export function SentencePrompt({ stage, onHint, onNext, showHint = true }: { stage: SentenceStage; onHint: () => void; onNext: () => void; showHint?: boolean }) {
  if (stage === 'translation' && !showHint) return null;
  return <section className="ll-sentence-stage" aria-label="Current sentence stage">
    {stage !== 'translation' && <p role="status">{stage === 'explanation'
      ? 'Translation accepted. Name the tense and explain its structure, meaning, and why it fits.' : 'Translation and explanation accepted.'}</p>}
    {stage === 'complete' ? <button type="button" className="ll-button ll-primary ll-next" aria-label="Next exercise" title="Next exercise" onClick={onNext}><span aria-hidden="true">→</span></button>
      : showHint && <button type="button" className="ll-button" onClick={onHint}>Ask voice coach for a hint</button>}
  </section>;
}
