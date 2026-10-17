import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isQuiet, type LessonModuleProps, type VoiceState } from '../../contracts';
import { PracticeLayout, ExerciseCue, ProgressDialog, ReferenceTable, SentencePrompt } from '../../ui/mobile';
import { createSentenceSession, matchingSentences, type SentenceSession } from './session';
import './sentences.css';
import { TENSE_GUIDE } from '../../content/tense-guide';
import { WrittenTranslation } from './WrittenTranslation';
import type { WrittenComparisonResult } from './written-comparison';
import { useWrittenHint } from './use-written-hint';
import { WrittenTense, type WrittenTenseResult } from './WrittenTense';

export interface SentenceLessonProps extends LessonModuleProps {
  /** Root-owned connection state can seed a feature mounted after connection. */
  connectionState?: VoiceState;
  microphoneMuted?: boolean;
  sessionControls?: ReactNode;
  rootVoiceError?: string;
}
const noopSubscribe = () => () => {};
const emptySnapshot = () => null;

export function SentenceLesson(props: SentenceLessonProps) {
  const { settings, voice, sessionId } = props;
  const complete = useRef(props.onComplete); complete.current = props.onComplete;
  const active = useRef<SentenceSession | null>(null);
  const [session, setSession] = useState<SentenceSession | null>(null);
  const [written, setWritten] = useState<{ exerciseId: string; result: WrittenComparisonResult | undefined }>();
  const [writtenTense, setWrittenTense] = useState<{ exerciseId: string; draft: string; result: WrittenTenseResult }>();
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
  const writtenResult = written?.exerciseId === view?.assessment.exerciseId ? written?.result : undefined;
  const tenseResult = writtenResult?.status === 'matched' && writtenTense?.exerciseId === view?.assessment.exerciseId
    && writtenTense?.draft === writtenResult.submittedText ? writtenTense.result : undefined;
  const hintSentenceId = view?.assessment.context.mode === 'sentence' ? view.assessment.context.sentence.id : undefined;
  const writtenHint = useWrittenHint(hintSentenceId, writtenResult, settings.helpEnabled);
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
  const errorInHeader = props.rootVoiceError && (snapshot.systemError === props.rootVoiceError
    || snapshot.systemError === 'Voice is unavailable. Please retry when connected.' || snapshot.systemError === 'Voice is unavailable. Your accepted work is preserved.');
  const rows = stage === 'translation'
    ? [['Message', 'Read the Spanish sentence.'], ['Your response', 'Write or speak a complete English sentence using your own words.'], ['If audio is unclear', 'Repeat or clarify; uncertainty is not a mistake.']]
    : TENSE_GUIDE.map(item => [item.label, item.guidance]);

  return <div className="ll-sentences" data-exercise-id={snapshot.exerciseId} data-stage={stage}>
    <PracticeLayout controls={<div className="ll-actions">
      <ProgressDialog mode="sentence" identity={snapshot} evidence={snapshot.evidence}
        onHoldChange={session.setPresentationHold} controls={props.sessionControls}>
        <p className="ll-written-progress">Written translation: {writtenResult?.status === 'matched' ? 'Checked' : writtenResult?.status === 'different' ? 'Review the highlighted text' : 'Not checked'}</p>
        <p className="ll-written-progress">Written tense: {tenseResult?.correct ? 'Checked' : tenseResult ? 'Try another tense' : 'Not checked'}</p>
      </ProgressDialog>
      <ReferenceTable title="Sentence practice guide" caption={stage === 'translation' ? 'Meaning-focused practice guide' : 'Structures for your explanation'}
        columns={['Focus', 'Guidance']} rows={rows} onHoldChange={session.setPresentationHold} controls={props.sessionControls} />
    </div>}>
      <ExerciseCue spanish={sentence.spanish} />
      <div className="sentences-navigation">
        <WrittenTranslation key={snapshot.exerciseId} sentence={sentence} helpEnabled={settings.helpEnabled} hint={writtenHint}
          onResultChange={result => { setWritten({ exerciseId: snapshot.exerciseId, result }); setWrittenTense(undefined); }} />
        {stage !== 'complete' && <button type="button" className="ll-button ll-next" data-skip-written-check onClick={() => session.skip()} disabled={view.nextPoolSize === 0} aria-label="Next sentence" title="Next sentence">
          <span aria-hidden="true">→</span>
        </button>}
      </div>
      {writtenResult?.status === 'matched' && writtenResult.matchedAlternative && <WrittenTense
        key={`${snapshot.exerciseId}:${writtenResult.submittedText}`} expected={writtenResult.matchedAlternative.tense}
        onResultChange={result => setWrittenTense({ exerciseId: snapshot.exerciseId, draft: writtenResult.submittedText, result })} />}
      {changedDifficulty && <p role="status" className="ll-muted">New difficulty settings apply to the next prompt. Your current work is preserved.</p>}
      {changedTense && <p role="status" className="ll-muted">The selected tense applies to the next prompt. Your current work is preserved.</p>}
      {view.nextPoolSize === 0 && <p role="status" className="ll-muted">No authored prompt matches the selected difficulty and tense. Change either in Preferences; current work is preserved.</p>}
      <fieldset className="ll-sentence-actions" disabled={stage === 'complete' ? !canNext : busy}>
        <SentencePrompt stage={stage} onHint={() => session.requestHint()} onNext={() => session.next()}
          showHint={settings.helpEnabled && snapshot.interaction.connection === 'ready' && snapshot.interaction.intent === 'practice'} />
      </fieldset>
      {stage !== 'translation' && !snapshot.completed && <button type="button" className="ll-button" onClick={() => session.reviseTranslation()}>Revise my translation</button>}
      {snapshot.hintPending && <p role="status" className="ll-hint">Preparing a hint…</p>}
      {!snapshot.hintPending && snapshot.hint && <p role="status" className="ll-hint">{snapshot.hint.text}</p>}
      {view.notice && view.hintOrigin !== 'authored-fallback' && <p role="status" className="ll-muted">{view.notice}</p>}
      {snapshot.systemError && !errorInHeader && <p role="alert">{snapshot.systemError}</p>}
    </PracticeLayout>
  </div>;
}
