import { createWrittenPracticeBinding } from '../progress/written-practice-binding';
import type { WrittenPracticeBinding } from '../progress/written-snapshot';
import { useWrittenActivity, type WrittenActivityBinding } from '../progress/use-written-activity';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isQuiet, type LessonModuleProps, type VoiceState } from '../../contracts';
import { PracticeLayout, ExerciseCue, ProgressDialog, ReferenceTable, SentencePrompt } from '../../ui/mobile';
import { createSentenceSession, matchingSentences, type SentenceSession } from './session';
import './sentences.css';
import { TENSE_GUIDE } from '../../content/tense-guide';
import { WrittenTranslation } from './WrittenTranslation';
import { useWrittenHint } from './use-written-hint';
import { WrittenTense } from './WrittenTense';

export interface SentenceLessonProps extends LessonModuleProps {
  /** Root-owned connection state can seed a feature mounted after connection. */
  writtenPractice?: WrittenPracticeBinding;
  writtenActivity?: WrittenActivityBinding;
  progressSink?: import("../../contracts").ProgressSink;
  onProgressError?: () => void;
  canWrite?: () => boolean;
  connectionState?: VoiceState;
  microphoneMuted?: boolean;
  sessionControls?: ReactNode;
  rootVoiceError?: string;
}
const noopSubscribe = () => () => {};
const emptySnapshot = () => null;

export function SentenceLesson(props: SentenceLessonProps) {
  const { settings, voice, sessionId } = props;
  const writeGate = useRef(props.canWrite); writeGate.current = props.canWrite;
  const complete = useRef(props.onComplete); complete.current = props.onComplete;
  const active = useRef<SentenceSession | null>(null);
  const [progressError, setProgressError] = useState(false);
  const [session, setSession] = useState<SentenceSession | null>(null);
  const releaseRecovery = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    active.current = null; setSession(null); setProgressError(false);
    return () => { releaseRecovery.current?.(); releaseRecovery.current = undefined; active.current?.dispose(); active.current = null; };
  }, [voice, sessionId, props.writtenPractice?.userId]);
  useEffect(() => {
    if (!active.current && matchingSentences(settings.difficulty, undefined, settings.sentenceTense).length) {
      const binding = createWrittenPracticeBinding(props.writtenPractice);
      active.current = createSentenceSession({ voice, sessionId, difficulty: settings.difficulty, tense: settings.sentenceTense,
        onComplete: id => complete.current(id),
        ...(props.writtenPractice ? { writtenPracticeUserId: props.writtenPractice.userId, onWrittenPracticeChange: binding.changed } : {}),
        canWrite: () => writeGate.current?.() !== false,
        ...(props.progressSink ? { progressSink: props.progressSink } : {}),
        onProgressError: () => { setProgressError(true); props.onProgressError?.(); },
        ...(props.connectionState ? { connectionState: props.connectionState } : {}),
        ...(props.microphoneMuted !== undefined ? { microphoneMuted: props.microphoneMuted } : {}),
      });
      releaseRecovery.current = binding.attach(active.current);
      setSession(active.current);
    } else {
      active.current?.setDifficulty(settings.difficulty);
      active.current?.setTense(settings.sentenceTense);
    }
  }, [voice, sessionId, props.writtenPractice?.userId, settings.difficulty.grammar, settings.difficulty.vocabulary, settings.sentenceTense]);
  useEffect(() => { if (props.connectionState) active.current?.setInteraction({ connection: props.connectionState }); }, [props.connectionState, session]);
  const view = useSyncExternalStore(session?.subscribe ?? noopSubscribe, session?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const writtenResult = view?.written.result;
  const tenseResult = view?.written.selectedTense && writtenResult?.matchedAlternative
    ? { selected: view.written.selectedTense, correct: view.written.selectedTense === writtenResult.matchedAlternative.tense } : undefined;
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

  return <SentenceActivity sessionId={sessionId} binding={props.writtenActivity}><div className="ll-sentences" data-exercise-id={snapshot.exerciseId} data-stage={stage}>
    <PracticeLayout controls={<div className="ll-actions">
      <ProgressDialog mode="sentence" identity={snapshot} evidence={snapshot.evidence}
        onHoldChange={session.setPresentationHold} controls={props.sessionControls}>
        <p className="ll-written-progress">Written translation: {writtenResult?.status === 'matched' ? 'Checked' : writtenResult?.status === 'different' ? 'Review the highlighted text' : 'Not checked'}</p>
        <p className="ll-written-progress">Written tense: {tenseResult?.correct ? 'Checked' : tenseResult ? 'Try another tense' : 'Not checked'}</p>
      </ProgressDialog>
      <ReferenceTable title="Sentence practice guide" caption={stage === 'translation' ? 'Meaning-focused practice guide' : 'Structures for your explanation'}
        columns={['Focus', 'Guidance']} rows={rows} onHoldChange={session.setPresentationHold} controls={props.sessionControls} />
    </div>}>
      {progressError && <p role="status">Progress could not be saved. Your current practice remains available.</p>}
      <ExerciseCue spanish={sentence.spanish} />
      <div className="sentences-navigation">
        <WrittenTranslation key={`${snapshot.exerciseId}:${view.writtenRestoreVersion}`} initialDraft={view.written.draft} initialFinalized={view.written.finalized} onDraftChange={session.editWritten} sentence={sentence} helpEnabled={settings.helpEnabled} hint={writtenHint}
          onResultChange={result => { if (result) session.finalizeWritten(); else session.invalidateWritten(); }} />
        {stage !== 'complete' && <button type="button" className="ll-button ll-next" data-skip-written-check onClick={() => session.skip()} disabled={view.nextPoolSize === 0} aria-label="Next sentence" title="Next sentence">
          <span aria-hidden="true">→</span>
        </button>}
      </div>
      {writtenResult?.status === 'matched' && writtenResult.matchedAlternative && <WrittenTense
        key={`${snapshot.exerciseId}:${view.writtenRestoreVersion}:${writtenResult.submittedText}`} {...(view.written.selectedTense ? { initialSelected: view.written.selectedTense } : {})} expected={writtenResult.matchedAlternative.tense}
        onResultChange={result => session.selectWrittenTense(result.selected)} />}
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
  </div></SentenceActivity>;
}

function SentenceActivity({ sessionId, binding, children }: { sessionId: string; binding: WrittenActivityBinding | undefined; children: ReactNode }) {
  const element = useWrittenActivity(sessionId, binding);
  return <div ref={element}>{children}</div>;
}
