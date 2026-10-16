import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { isQuiet, type LessonModuleProps, type VoiceState } from '../../contracts';
import { PracticeLayout, ExerciseCue, ObligationProgress, ReferenceTable, QuestionComposer, CoachMessage, SentencePrompt } from '../../ui/mobile';
import { createSentenceSession, matchingSentences, type SentenceSession } from './session';
import './sentences.css';

export interface SentenceLessonProps extends LessonModuleProps {
  /** Root-owned connection state can seed a feature mounted after connection. */
  connectionState?: VoiceState;
  microphoneMuted?: boolean;
  onStartVoice?: () => void;
  onStopVoice?: () => void;
}
const noopSubscribe = () => () => {};
const emptySnapshot = () => null;

export function SentenceLesson(props: SentenceLessonProps) {
  const { settings, voice, sessionId } = props;
  const complete = useRef(props.onComplete); complete.current = props.onComplete;
  const active = useRef<SentenceSession | null>(null);
  const [session, setSession] = useState<SentenceSession | null>(null);
  useEffect(() => {
    active.current = null; setSession(null);
    return () => { active.current?.dispose(); active.current = null; };
  }, [voice, sessionId]);
  useEffect(() => {
    if (!active.current && matchingSentences(settings.difficulty).length) {
      active.current = createSentenceSession({ voice, sessionId, difficulty: settings.difficulty,
        onComplete: id => complete.current(id),
        ...(props.connectionState ? { connectionState: props.connectionState } : {}),
        ...(props.microphoneMuted !== undefined ? { microphoneMuted: props.microphoneMuted } : {}),
      });
      setSession(active.current);
    } else active.current?.setDifficulty(settings.difficulty);
  }, [voice, sessionId, settings.difficulty.grammar, settings.difficulty.vocabulary]);
  useEffect(() => { if (props.connectionState) active.current?.setInteraction({ connection: props.connectionState }); }, [props.connectionState, session]);
  const view = useSyncExternalStore(session?.subscribe ?? noopSubscribe, session?.getSnapshot ?? emptySnapshot, emptySnapshot);
  if (!view || !session || view.assessment.context.mode !== 'sentence') {
    return <div className="ll-sentences" role="status">{matchingSentences(settings.difficulty).length
      ? 'Preparing your sentence…' : `No authored prompt matches grammar ${settings.difficulty.grammar} and vocabulary ${settings.difficulty.vocabulary}. Change either setting in Preferences; the two dimensions stay independent.`}</div>;
  }
  const snapshot = view.assessment;
  if (snapshot.context.mode !== 'sentence') return null;
  const sentence = snapshot.context.sentence;
  const stage = snapshot.context.stage;
  const busy = snapshot.interaction.connection !== 'ready' || snapshot.interaction.intent !== 'practice'
    || snapshot.hintPending || snapshot.interaction.processingCount > 0;
  const changedDifficulty = sentence.difficulty.grammar !== view.requestedDifficulty.grammar
    || sentence.difficulty.vocabulary !== view.requestedDifficulty.vocabulary;
  const canNext = snapshot.canContinue || snapshot.completed && view.nextPoolSize > 0 && isQuiet(snapshot.interaction);
  const controls = <section aria-label="Sentence conversation controls" className="ll-actions">
    <span role="status">{voice.mode === 'mock' ? 'Mock session' : 'Voice'} · {snapshot.interaction.connection}</span>
    {snapshot.interaction.connection !== 'ready' && props.onStartVoice
      && <button type="button" className="ll-button" onClick={props.onStartVoice}>Start voice session</button>}
    {snapshot.interaction.connection === 'ready' && <button type="button" className="ll-button" aria-pressed={view.muted} onClick={() => session.setMuted(!view.muted)}>{view.muted ? 'Resume microphone' : 'Mute microphone'}</button>}
    <button type="button" className="ll-button" onClick={() => session.pause(snapshot.interaction.intent === 'practice')}>{snapshot.interaction.intent === 'practice' ? 'Pause practice' : 'Resume practice'}</button>
    {props.onStopVoice && <button type="button" className="ll-button" onClick={() => { session.pause(true); props.onStopVoice?.(); }}>Stop voice session</button>}
  </section>;
  const rows = stage === 'translation'
    ? [['Message', 'Read the Spanish prompt and its context.'], ['Your response', 'Speak a complete English sentence using your own words.'], ['If audio is unclear', 'Repeat or clarify; uncertainty is not a mistake.']]
    : [['Present simple', 'Subject + base family, with agreement.'], ['Present continuous', 'Subject + am/is/are + present participle.'], ['Present perfect', 'Subject + have/has + past participle.'], ['Present perfect continuous', 'Subject + have/has + been + present participle.']];

  return <div className="ll-sentences" data-exercise-id={snapshot.exerciseId} data-stage={stage}>
    <PracticeLayout mock={voice.mode === 'mock'} controls={controls}
      progress={<ObligationProgress mode="sentence" identity={snapshot} evidence={snapshot.evidence} />}
      coach={<><CoachMessage text={snapshot.hint?.text || view.coachText || 'Ask for a gradual hint or a clarification whenever you need one.'} pending={snapshot.hintPending}
        uncertain={Object.values(snapshot.evidence).some(record => record?.status === 'uncertain')} mock={snapshot.hint?.source === 'mock' && view.hintOrigin !== 'authored-fallback'} />
        {view.hintOrigin === 'authored-fallback' && <p className="ll-muted">Reviewed coaching fallback · generated content was withheld.</p>}
        {view.notice && <p role="status" className="ll-muted">{view.notice}</p>}
        {snapshot.systemError && <p role="alert">{snapshot.systemError}</p>}</>}>
      <p className="ll-muted">Grammar {sentence.difficulty.grammar} · Vocabulary {sentence.difficulty.vocabulary}</p>
      <ExerciseCue spanish={sentence.spanish} />
      {changedDifficulty && <p role="status" className="ll-muted">New difficulty settings apply to the next prompt. Your current work is preserved.</p>}
      {view.nextPoolSize === 0 && <p role="status" className="ll-muted">No authored prompt matches both new settings. Change either dimension in Preferences.</p>}
      <fieldset className="ll-sentence-actions" disabled={stage === 'complete' ? !canNext : busy}>
        <SentencePrompt stage={stage} onHint={() => session.requestHint()} onNext={() => session.next()} />
      </fieldset>
      {stage !== 'translation' && !snapshot.completed && <button type="button" className="ll-button" onClick={() => session.reviseTranslation()}>Revise my translation</button>}
      {voice.mode === 'mock' && stage !== 'complete' && <MockResponse key={snapshot.exerciseId} session={session} disabled={busy} />}
      {view.lastResponse && <details className="ll-sentence-response"><summary>Your last spoken response{voice.mode === 'mock' ? ' (simulated)' : ''}</summary><p lang="en">{view.lastResponse}</p></details>}
      <ReferenceTable title="Sentence practice guide" caption={stage === 'translation' ? 'Meaning-focused practice guide' : 'Structures for your explanation'}
        columns={['Focus', 'Guidance']} rows={rows} onHoldChange={session.setPresentationHold} controls={controls} />
      <fieldset className="ll-sentence-actions" disabled={snapshot.interaction.connection !== 'ready'}>
        <QuestionComposer onSubmit={session.askQuestion} onDraftActiveChange={active => session.setInteraction({ questionDraftActive: active })} />
      </fieldset>
      {snapshot.interaction.questionPending && <button type="button" className="ll-button" onClick={session.resolveQuestion}>My question is resolved</button>}
      <button type="button" className="ll-button" onClick={() => session.skip()}>Skip this prompt</button>
      {snapshot.interaction.connection !== 'ready' && !props.onStartVoice && <p className="ll-muted">Connect through the root conversation controls to begin oral practice.</p>}
    </PracticeLayout>
  </div>;
}

function MockResponse({ session, disabled }: { session: SentenceSession; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  const id = useId();
  useEffect(() => () => session.setPresentationHold('mock-response-draft', false), [session]);
  return <form className="ll-sentence-mock" onSubmit={event => {
    event.preventDefault();
    if (session.getSnapshot().assessment.interaction.compositionActive) return;
    session.setPresentationHold('mock-response-draft', false);
    session.setInteraction({ inputFocused: false, compositionActive: false });
    if (session.submitMockResponse(draft)) setDraft('');
    else session.setPresentationHold('mock-response-draft', Boolean(draft.trim()));
  }}>
    <label htmlFor={id}>Mock oral response (simulated)</label>
    <textarea id={id} value={draft} disabled={disabled} rows={3}
      onChange={event => { setDraft(event.target.value); session.setPresentationHold('mock-response-draft', Boolean(event.target.value.trim())); }}
      onFocus={() => session.setInteraction({ inputFocused: true })} onBlur={() => session.setInteraction({ inputFocused: false })}
      onCompositionStart={() => session.setInteraction({ compositionActive: true })} onCompositionEnd={() => session.setInteraction({ compositionActive: false })} />
    <button type="submit" className="ll-button" disabled={disabled || !draft.trim()}>Send simulated response</button>
    <p className="ll-muted">This typed fixture simulates an utterance. It is not microphone, pronunciation or real-provider evidence.</p>
  </form>;
}
