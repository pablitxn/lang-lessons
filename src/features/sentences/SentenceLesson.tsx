import { createWrittenPracticeBinding } from '../progress/written-practice-binding';
import type { WrittenPracticeBinding } from '../progress/written-snapshot';
import { useWrittenActivity, type WrittenActivityBinding } from '../progress/use-written-activity';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getLanguage, isQuiet, type LessonModuleProps, type VoiceState } from '../../contracts';
import { PracticeLayout, ExerciseCue, ProgressDialog, ReferenceTable, SentencePrompt } from '../../ui/mobile';
import { createSentenceSession, matchingSentences, type SentenceSession } from './session';
import './sentences.css';
import { getTenseGuide } from '../../content/tense-guide';
import { sentencesForLanguage } from '../../content';
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
  const language = settings.learningLanguage ?? 'en';
  const localize = (english: string, spanish: string) => language === 'fr' ? spanish : english;
  const sentences = sentencesForLanguage(language);
  const writeGate = useRef(props.canWrite); writeGate.current = props.canWrite;
  const complete = useRef(props.onComplete); complete.current = props.onComplete;
  const active = useRef<SentenceSession | null>(null);
  const [progressError, setProgressError] = useState(false);
  const [session, setSession] = useState<SentenceSession | null>(null);
  const releaseRecovery = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    active.current = null; setSession(null); setProgressError(false);
    return () => { releaseRecovery.current?.(); releaseRecovery.current = undefined; active.current?.dispose(); active.current = null; };
  }, [voice, sessionId, props.writtenPractice?.userId, language]);
  useEffect(() => {
    if (!active.current && matchingSentences(settings.difficulty, sentences, settings.sentenceTense).length) {
      const binding = createWrittenPracticeBinding(props.writtenPractice);
      active.current = createSentenceSession({ voice, sessionId, language, difficulty: settings.difficulty, tense: settings.sentenceTense,
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
  }, [voice, sessionId, props.writtenPractice?.userId, language, settings.difficulty.grammar, settings.difficulty.vocabulary, settings.sentenceTense]);
  useEffect(() => { if (props.connectionState) active.current?.setInteraction({ connection: props.connectionState }); }, [props.connectionState, session]);
  const view = useSyncExternalStore(session?.subscribe ?? noopSubscribe, session?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const writtenResult = view?.written.result;
  const tenseResult = view?.written.selectedTense && writtenResult?.matchedAlternative
    ? { selected: view.written.selectedTense, correct: view.written.selectedTense === writtenResult.matchedAlternative.tense } : undefined;
  const hintSentenceId = view?.assessment.context.mode === 'sentence' && getLanguage(view.assessment.context) === language ? view.assessment.context.sentence.id : undefined;
  const writtenHint = useWrittenHint(hintSentenceId, writtenResult, settings.helpEnabled, sessionId);
  if (!view || !session || view.assessment.context.mode !== 'sentence' || getLanguage(view.assessment.context) !== language) {
    return <div className="ll-sentences" role="status">{matchingSentences(settings.difficulty, sentences, settings.sentenceTense).length
      ? localize('Preparing your sentence…', 'Preparando tu frase…') : localize(`No authored prompt matches grammar ${settings.difficulty.grammar} and vocabulary ${settings.difficulty.vocabulary} with the selected sentence tense. Change difficulty or Sentence tenses in Preferences.`, `No hay frases para gramática ${settings.difficulty.grammar}, vocabulario ${settings.difficulty.vocabulary} y el tiempo elegido. Cambiá la dificultad o el tiempo verbal en Preferencias.`)}</div>;
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
    ? language === 'fr'
      ? [['Consigna', 'Leé la frase en español.'], ['Tu respuesta', 'Escribí o decí una frase completa en francés con tus propias palabras. Conservá los acentos y las elisiones.'], ['Si el audio no se entiende', 'Repetí o aclará; la incertidumbre no es un error.']]
      : [['Message', 'Read the Spanish sentence.'], ['Your response', 'Write or speak a complete English sentence using your own words.'], ['If audio is unclear', 'Repeat or clarify; uncertainty is not a mistake.']]
    : getTenseGuide(language).map(item => [item.label, item.guidance]);

  return <SentenceActivity sessionId={sessionId} binding={props.writtenActivity}><div className="ll-sentences" data-exercise-id={snapshot.exerciseId} data-stage={stage} data-language={language}>
    <PracticeLayout controls={<div className="ll-actions">
      <ProgressDialog language={language} mode="sentence" identity={snapshot} evidence={snapshot.evidence}
        onHoldChange={session.setPresentationHold} controls={props.sessionControls}>
        <p className="ll-written-progress">{localize('Written translation: ', 'Traducción escrita: ')}{writtenResult?.status === 'matched' ? localize('Checked', 'Comprobado') : writtenResult?.status === 'different' ? localize('Review the highlighted text', 'Revisá el texto resaltado') : localize('Not checked', 'Sin comprobar')}</p>
        <p className="ll-written-progress">{localize('Written tense: ', 'Tiempo escrito: ')}{tenseResult?.correct ? localize('Checked', 'Comprobado') : tenseResult ? localize('Try another tense', 'Probá otro tiempo') : localize('Not checked', 'Sin comprobar')}</p>
      </ProgressDialog>
      <ReferenceTable language={language} title={localize("Sentence practice guide", "Guía de práctica de frases")} caption={stage === 'translation' ? localize('Meaning-focused practice guide', 'Guía centrada en el significado') : localize('Structures for your explanation', 'Estructuras para tu explicación')}
        columns={language === 'fr' ? ['Objetivo', 'Orientación'] : ['Focus', 'Guidance']} rows={rows} onHoldChange={session.setPresentationHold} controls={props.sessionControls} />
    </div>}>
      {progressError && <p role="status">{localize('Progress could not be saved. Your current practice remains available.', 'No se pudo guardar el progreso. Tu práctica actual sigue disponible.')}</p>}
      <ExerciseCue spanish={sentence.spanish} />
      <div className="sentences-navigation">
        <WrittenTranslation language={language} key={`${snapshot.exerciseId}:${view.writtenRestoreVersion}`} initialDraft={view.written.draft} initialFinalized={view.written.finalized} onDraftChange={session.editWritten} sentence={sentence} helpEnabled={settings.helpEnabled} hint={writtenHint}
          onResultChange={result => { if (result) session.finalizeWritten(); else session.invalidateWritten(); }} />
        {stage !== 'complete' && <button type="button" className="ll-button ll-next" data-skip-written-check onClick={() => session.skip()} disabled={view.nextPoolSize === 0} aria-label={localize("Next sentence", "Siguiente frase")} title={localize("Next sentence", "Siguiente frase")}>
          <span aria-hidden="true">→</span>
        </button>}
      </div>
      {writtenResult?.status === 'matched' && writtenResult.matchedAlternative && <WrittenTense language={language}
        key={`${snapshot.exerciseId}:${view.writtenRestoreVersion}:${writtenResult.submittedText}`} {...(view.written.selectedTense ? { initialSelected: view.written.selectedTense } : {})} expected={writtenResult.matchedAlternative.tense}
        onResultChange={result => session.selectWrittenTense(result.selected)} />}
      {changedDifficulty && <p role="status" className="ll-muted">{localize('New difficulty settings apply to the next prompt. Your current work is preserved.', 'La nueva dificultad se aplica a la próxima frase. Tu trabajo actual se conserva.')}</p>}
      {changedTense && <p role="status" className="ll-muted">{localize('The selected tense applies to the next prompt. Your current work is preserved.', 'El tiempo elegido se aplica a la próxima frase. Tu trabajo actual se conserva.')}</p>}
      {view.nextPoolSize === 0 && <p role="status" className="ll-muted">{localize('No authored prompt matches the selected difficulty and tense. Change either in Preferences; current work is preserved.', 'No hay una frase para la dificultad y el tiempo elegidos. Cambialos en Preferencias; tu trabajo actual se conserva.')}</p>}
      <fieldset className="ll-sentence-actions" disabled={stage === 'complete' ? !canNext : busy}>
        <SentencePrompt language={language} stage={stage} onHint={() => session.requestHint()} onNext={() => session.next()}
          showHint={settings.helpEnabled && snapshot.interaction.connection === 'ready' && snapshot.interaction.intent === 'practice'} />
      </fieldset>
      {stage !== 'translation' && !snapshot.completed && <button type="button" className="ll-button" onClick={() => session.reviseTranslation()}>{localize('Revise my translation', 'Revisar mi traducción')}</button>}
      {snapshot.hintPending && <p role="status" className="ll-hint">{localize('Preparing a hint…', 'Preparando una pista…')}</p>}
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
