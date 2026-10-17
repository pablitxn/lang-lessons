import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isQuiet, type LessonModuleProps, type VoiceState } from '../../contracts';
import { PracticeLayout, ExerciseCue, ProgressDialog, ReferenceTable, SentencePrompt } from '../../ui/mobile';
import { createSentenceSession, matchingSentences, type SentenceSession } from './session';
import './sentences.css';
import { TENSE_GUIDE } from '../../content/tense-guide';

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
    if (!active.current && matchingSentences(settings.difficulty, undefined, settings.sentenceTense).length) {
      active.current = createSentenceSession({ voice, sessionId, difficulty: settings.difficulty, tense: settings.sentenceTense,
        onComplete: id => complete.current(id),
        ...(props.connectionState ? { connectionState: props.connectionState } : {}),
        ...(props.microphoneMuted !== undefined ? { microphoneMuted: props.microphoneMuted } : {}),
      });
      setSession(active.current);
    } else {
      active.current?.setDifficulty(settings.difficulty);
      active.current?.setTense(settings.sentenceTense);
    }
  }, [voice, sessionId, settings.difficulty.grammar, settings.difficulty.vocabulary, settings.sentenceTense]);
  useEffect(() => { if (props.connectionState) active.current?.setInteraction({ connection: props.connectionState }); }, [props.connectionState, session]);
  const view = useSyncExternalStore(session?.subscribe ?? noopSubscribe, session?.getSnapshot ?? emptySnapshot, emptySnapshot);
  if (!view || !session || view.assessment.context.mode !== 'sentence') {
    return <div className="ll-sentences" role="status">{matchingSentences(settings.difficulty, undefined, settings.sentenceTense).length
      ? 'Preparing your sentence…' : `No authored prompt matches grammar ${settings.difficulty.grammar} and vocabulary ${settings.difficulty.vocabulary} with the selected sentence tense. Change difficulty or Sentence tenses in Preferences.`}</div>;
  }
  const snapshot = view.assessment;
  if (snapshot.context.mode !== 'sentence') return null;
  const sentence = snapshot.context.sentence;
  const stage = snapshot.context.stage;
  const busy = snapshot.interaction.connection !== 'ready' || snapshot.interaction.intent !== 'practice'
    || snapshot.hintPending || snapshot.interaction.processingCount > 0;
  const changedDifficulty = sentence.difficulty.grammar !== view.requestedDifficulty.grammar
    || sentence.difficulty.vocabulary !== view.requestedDifficulty.vocabulary;
  const changedTense = view.requestedTense !== 'all' && !sentence.alternatives.some(item => item.tense === view.requestedTense);
  const canNext = snapshot.canContinue || snapshot.completed && view.nextPoolSize > 0 && isQuiet(snapshot.interaction);
  const rows = stage === 'translation'
    ? [['Message', 'Read the Spanish prompt and its context.'], ['Your response', 'Speak a complete English sentence using your own words.'], ['If audio is unclear', 'Repeat or clarify; uncertainty is not a mistake.']]
    : TENSE_GUIDE.map(item => [item.label, item.guidance]);

  return <div className="ll-sentences" data-exercise-id={snapshot.exerciseId} data-stage={stage}>
    <PracticeLayout controls={<div className="ll-actions">
      <ProgressDialog mode="sentence" identity={snapshot} evidence={snapshot.evidence}
        onHoldChange={session.setPresentationHold} controls={props.sessionControls} />
      <ReferenceTable title="Sentence practice guide" caption={stage === 'translation' ? 'Meaning-focused practice guide' : 'Structures for your explanation'}
        columns={['Focus', 'Guidance']} rows={rows} onHoldChange={session.setPresentationHold} controls={props.sessionControls} />
    </div>}>
      <ExerciseCue spanish={sentence.spanish} />
      {changedDifficulty && <p role="status" className="ll-muted">New difficulty settings apply to the next prompt. Your current work is preserved.</p>}
      {changedTense && <p role="status" className="ll-muted">The selected tense applies to the next prompt. Your current work is preserved.</p>}
      {view.nextPoolSize === 0 && <p role="status" className="ll-muted">No authored prompt matches the selected difficulty and tense. Change either in Preferences; current work is preserved.</p>}
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
