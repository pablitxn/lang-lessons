import { useEffect, useId, useRef, useState } from 'react';
import type { VoiceState } from '../../../contracts';

// Internal UI harness controls. These never participate in the application call flow.
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

