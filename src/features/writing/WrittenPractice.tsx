import { useEffect, useId, useRef, useState } from 'react';
import { MAX_WRITTEN_COACHING_LENGTH, type ExerciseIdentity, type LearningLanguage } from '../../contracts';
import { CharacterCount } from '../../ui/writing/CharacterCount';
import { WritingLineField } from '../../ui/writing/WritingLineField';
import { useWrittenCoaching } from './use-written-coaching';
import { WrittenCoachingResult } from './WrittenCoachingResult';
import './written-practice.css';

interface WrittenPracticeCommonProps {
  identity: ExerciseIdentity;
  /** Changes when the accepted answer or other local writing context is replaced. */
  scope: string;
  language: LearningLanguage;
  title: string;
  fieldLabel: string;
  placeholder: string;
  pendingMessage: string;
  reference: { label: string; text: string; inline?: boolean; className?: string };
  className?: string;
}
export type WrittenPracticeProps = WrittenPracticeCommonProps & (
  | { endpoint: '/api/realtime/verb-writing'; context: { verbId: string } }
  | { endpoint: '/api/realtime/sentence-rewrite'; context: { sentenceId: string } }
);

/** The same optional composer owns draft and request lifetime in every lesson. */
export function WrittenPractice(props: WrittenPracticeProps) {
  const { identity, endpoint, context, scope } = props;
  const key = JSON.stringify([identity.sessionId, identity.exerciseId, identity.generation, endpoint, context, scope]);
  return <WrittenPracticeForm key={key} {...props} />;
}

function WrittenPracticeForm(props: WrittenPracticeProps) {
  const { identity, language, title, fieldLabel, placeholder, pendingMessage, reference } = props;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const composition = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const { state, reset, submit } = useWrittenCoaching(props.endpoint, { identity, ...props.context });
  const pending = state.status === 'pending';
  const checked = state.status === 'ready' && state.draft === draft;
  const canSubmit = Boolean(draft.trim()) && draft.length <= MAX_WRITTEN_COACHING_LENGTH && !pending && !checked && !composing;
  useEffect(() => { if (open) field.current?.focus(); }, [open]);

  function check() {
    if (composition.current || !canSubmit) return;
    void submit(draft);
  }

  return <section className={`writing-practice verb-sentence-practice${props.className ? ` ${props.className}` : ''}`} lang="es" aria-label={title}>
    <button type="button" className="writing-practice-toggle verb-practice-toggle" aria-expanded={open} aria-controls={`${id}-body`}
      onClick={() => { if (open) reset(); setOpen(previous => !previous); }}>
      <span className="writing-practice-icon verb-practice-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m14.5 5.5 4 4M4 20l4.5-1 12-12a2.8 2.8 0 0 0-4-4l-12 12L4 20Z" /></svg></span>
      <span className="writing-practice-title verb-practice-title">{title}</span>
      <svg className="writing-practice-chevron verb-practice-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg>
    </button>
    {open && <div id={`${id}-body`} className="writing-practice-body verb-practice-body">
      <div className={`writing-practice-reference${reference.inline ? ' writing-practice-reference-inline' : ''}${reference.className ? ` ${reference.className}` : ''}`}>
        <span>{reference.label}</span>
        <blockquote lang={language}>{reference.text}</blockquote>
      </div>
      <form onSubmit={event => { event.preventDefault(); check(); }}>
        <label className="writing-practice-sr-only" htmlFor={`${id}-draft`}>{fieldLabel}</label>
        <WritingLineField textareaRef={field} id={`${id}-draft`} lang={language} value={draft} maxLength={MAX_WRITTEN_COACHING_LENGTH}
          placeholder={placeholder} aria-describedby={state.status === 'error' ? `${id}-error` : undefined}
          aria-keyshortcuts="Control+Enter Meta+Enter" autoComplete="off" spellCheck={false}
          onChange={event => { reset(); setDraft(event.target.value); }}
          onCompositionStart={() => { composition.current = true; setComposing(true); reset(); }}
          onCompositionEnd={() => { composition.current = false; setComposing(false); }}
          onKeyDown={event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
              event.preventDefault(); check();
            }
          }} />
        <div className="writing-practice-actions verb-practice-actions">
          <CharacterCount count={draft.length} maxLength={MAX_WRITTEN_COACHING_LENGTH} />
          <button type="submit" className="writing-practice-submit verb-practice-submit" disabled={!canSubmit}>
            {pending ? 'Corrigiendo…' : 'Corregir'}
          </button>
        </div>
      </form>
      <div className="writing-practice-announcement verb-practice-announcement" role="status" aria-live="polite">{pending ? pendingMessage : ''}</div>
      {state.status === 'error' && <p id={`${id}-error`} className="writing-practice-error verb-practice-error" role="alert">{state.message}</p>}
      {checked && <WrittenCoachingResult feedback={state.feedback} draft={draft} language={language} />}
    </div>}
  </section>;
}
