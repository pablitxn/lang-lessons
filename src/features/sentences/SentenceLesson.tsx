import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isQuiet, type LessonModuleProps, type VoiceState } from '../../contracts';
import { PracticeLayout, ExerciseCue, ProgressDialog, ReferenceTable, SentencePrompt } from '../../ui/mobile';
import { createSentenceSession, matchingSentences, type SentenceSession } from './session';
import './sentences.css';

export interface SentenceLessonProps extends LessonModuleProps {
  /** Root-owned connection state can seed a feature mounted after connection. */
  connectionState?: VoiceState;
  microphoneMuted?: boolean;
  sessionControls?: ReactNode;
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
  const rows = stage === 'translation'
    ? [['Message', 'Read the Spanish prompt and its context.'], ['Your response', 'Speak a complete English sentence using your own words.'], ['If audio is unclear', 'Repeat or clarify; uncertainty is not a mistake.']]
    : [['Present simple', 'Subject + base family, with agreement.'], ['Present continuous', 'Subject + am/is/are + present participle.'], ['Present perfect', 'Subject + have/has + past participle.'], ['Present perfect continuous', 'Subject + have/has + been + present participle.']];

  return <div className="ll-sentences" data-exercise-id={snapshot.exerciseId} data-stage={stage}>
    <PracticeLayout controls={<div className="ll-actions">
      <ProgressDialog mode="sentence" identity={snapshot} evidence={snapshot.evidence}
        onHoldChange={session.setPresentationHold} controls={props.sessionControls} />
      <ReferenceTable title="Sentence practice guide" caption={stage === 'translation' ? 'Meaning-focused practice guide' : 'Structures for your explanation'}
        columns={['Focus', 'Guidance']} rows={rows} onHoldChange={session.setPresentationHold} controls={props.sessionControls} />
    </div>}>
      <ExerciseCue spanish={sentence.spanish} />
      {changedDifficulty && <p role="status" className="ll-muted">New difficulty settings apply to the next prompt. Your current work is preserved.</p>}
      {view.nextPoolSize === 0 && <p role="status" className="ll-muted">No authored prompt matches both new settings. Change either dimension in Preferences.</p>}
      <fieldset className="ll-sentence-actions" disabled={stage === 'complete' ? !canNext : busy}>
        <SentencePrompt stage={stage} onHint={() => session.requestHint()} onNext={() => session.next()} />
      </fieldset>
      {stage !== 'translation' && !snapshot.completed && <button type="button" className="ll-button" onClick={() => session.reviseTranslation()}>Revise my translation</button>}
      {snapshot.hintPending && <p role="status" className="ll-hint">Preparing a hint…</p>}
      {!snapshot.hintPending && snapshot.hint && <p role="status" className="ll-hint">{snapshot.hint.text}</p>}
      {view.notice && view.hintOrigin !== 'authored-fallback' && <p role="status" className="ll-muted">{view.notice}</p>}
      {snapshot.systemError && <p role="alert">{snapshot.systemError}</p>}
      <button type="button" className="ll-button" onClick={() => session.skip()}>Skip this prompt</button>
    </PracticeLayout>
  </div>;
}
