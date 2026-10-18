import { useWrittenActivity, type WrittenActivityBinding } from '../progress/use-written-activity';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { type LearnerSettings, type LessonModuleProps, type VerbForm, type VerbMode } from '../../contracts';
import { PracticeLayout, ProgressDialog, ReferenceTable, SpellingField } from '../../ui/mobile';
import { PictureCue } from './PictureCue';
import { WordCue } from './WordCue';
import { VERB_HINTS } from './verb-hints';
import { createVerbSession, type VerbSession } from './session';
import { PictureDictionaryCard } from './PictureDictionaryCard';
import { createPicturePreload } from './picture-preload';
import type { ProgressSink } from '../../contracts';
import './verbs.css';
import './writing-lines.css';
import { VERB_PHOTOS } from '../../content';
import { VERB_TENSE_GUIDE } from '../../content/tense-guide';

export type VerbLessonProps = LessonModuleProps & { mode: VerbMode; writtenActivity?: WrittenActivityBinding; progressSink?: ProgressSink; canWrite?: () => boolean; onProgressError?: () => void; sessionControls?: ReactNode; claimUtterance?: (utteranceId: string) => void; rootVoiceError?: string };
const LABELS: Readonly<Record<VerbForm, string>> = { base: 'Base form', past: 'Past', participle: 'Past participle' };

export function VerbLesson({ mode, settings, voice, sessionId, onComplete, sessionControls, claimUtterance, rootVoiceError = '', progressSink, onProgressError, canWrite, writtenActivity }: VerbLessonProps) {
  const writeGate = useRef(canWrite); writeGate.current = canWrite;
  const [progressError, setProgressError] = useState(false);
  const completed = useRef(onComplete);
  const claim = useRef(claimUtterance);
  completed.current = onComplete;
  claim.current = claimUtterance;
  const [session, setSession] = useState<VerbSession | null>(null);
  useEffect(() => {
    setProgressError(false);
    const current = createVerbSession({ mode, voice, sessionId, canWrite: () => writeGate.current?.() !== false, ...(progressSink ? { progressSink } : {}), onProgressError: () => { setProgressError(true); onProgressError?.(); }, onComplete: id => completed.current(id), get claimUtterance() { return claim.current; } });
    setSession(current);
    return () => current.dispose();
  }, [mode, voice, sessionId]);
  if (!session || session.mode !== mode || session.voice !== voice || session.sessionId !== sessionId) return <p role="status">Preparing your verb practice…</p>;
  return <>{progressError && <p role="status">Progress could not be saved. Your current practice remains available.</p>}<VerbPractice session={session} settings={settings} rootVoiceError={rootVoiceError} {...(writtenActivity ? { writtenActivity } : {})} {...(sessionControls !== undefined ? { sessionControls } : {})} /></>;
}

function VerbPractice({ session, settings, sessionControls, rootVoiceError, writtenActivity }: { session: VerbSession; writtenActivity?: WrittenActivityBinding; settings: LearnerSettings; sessionControls?: ReactNode; rootVoiceError: string }) {
  const activityElement = useWrittenActivity(session.sessionId, writtenActivity);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { assessment: snapshot } = state;
  const preload = useRef<ReturnType<typeof createPicturePreload> | null>(null);
  useEffect(() => { preload.current = createPicturePreload(); return () => { preload.current?.dispose(); preload.current = null; }; }, [session]);
  useEffect(() => { preload.current?.setNext(state.nextPicture); }, [session, state.nextPicture?.key, state.nextPicture?.src]);
  const previousButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const navigationFocus = useRef<'previous' | 'next' | null>(null);
  useLayoutEffect(() => {
    const direction = navigationFocus.current;
    if (!direction) return;
    navigationFocus.current = null;
    const target = direction === 'previous' ? previousButton.current : nextButton.current;
    (target?.disabled ? nextButton.current : target)?.focus({ preventScroll: true });
  }, [snapshot.exerciseId]);
  function navigate(direction: 'previous' | 'next') {
    const target = direction === 'previous' ? previousButton.current : nextButton.current;
    navigationFocus.current = document.activeElement === target ? direction : null;
    const moved = direction === 'previous' ? session.previous() : state.pictureComplete ? session.nextPicture(snapshot.exerciseId) : session.skip();
    if (!moved) navigationFocus.current = null;
  }
  const context = snapshot.context;
  if (context.mode === 'sentence') return null;
  const photo = VERB_PHOTOS.find(item => item.src === context.verb.image.src);
  const navigation = <nav className="verbs-navigation" aria-label={context.mode === 'verb-image' ? 'Picture navigation' : 'Verb navigation'}>
    {context.mode === 'verb-image' && <button ref={previousButton} type="button" className="verbs-photo-button" onClick={() => navigate('previous')} disabled={!state.canGoBack}
      aria-label="Previous image">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" /></svg>
    </button>}
    <button ref={nextButton} type="button" className="verbs-photo-button" onClick={() => navigate('next')}
      aria-label={context.mode === 'verb-image' ? 'Next image' : 'Next word'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6M16 12H4" /></svg>
    </button>
  </nav>;
  const errorInHeader = rootVoiceError && (snapshot.systemError === rootVoiceError || snapshot.systemError === 'Voice is unavailable. Please retry when connected.');
  return <div ref={activityElement} className="verbs-lesson" data-exercise={snapshot.exerciseId} data-verb={context.verb.id} data-generation={snapshot.generation}>
    <PracticeLayout controls={<div className="ll-actions">
      <ProgressDialog mode={context.mode} identity={context} evidence={snapshot.evidence}
        onHoldChange={session.controller.setPresentationHold} controls={sessionControls} />
      <ReferenceTable title="Verb practice reference" caption="Four complementary ways to practice" columns={['Work', 'What to do']}
        rows={[
          ['Meaning', 'Say what the verb means in Spanish.'],
          ['Pronunciation', 'Pronounce the base, past, and past participle. Natural connected speech is welcome.'],
          ['Original sentences', 'Create one sentence for each form. Normal subject agreement is valid; a participle needs a complete grammatical construction.'],
          ['Spelling', context.mode === 'verb-image' ? 'Write all three forms.' : 'Write the past and past participle. The base is already supplied.'],
          ...VERB_TENSE_GUIDE.map(item => [item.label, item.guidance]),
        ]} onHoldChange={session.controller.setPresentationHold} controls={sessionControls} />
    </div>}>
      <div className={context.mode === 'verb-image' ? 'verbs-workspace verbs-workspace-picture' : 'verbs-workspace'}>
        <div className="verbs-prompt">
          {context.mode === 'verb-image' ? <PictureCue key={snapshot.exerciseId} image={context.verb.image}
            information={photo?.tooltip_en ?? 'A small moment holds a story.'} navigation={navigation} onHoldChange={session.controller.setPresentationHold} />
            : <WordCue key={snapshot.exerciseId} base={context.verb.forms.base.accepted.join(' / ')}
              information={VERB_HINTS[context.verb.id]} navigation={navigation} onHoldChange={session.controller.setPresentationHold} />}
        </div>
        <div className="verbs-answers">
          {session.fields.map(form => {
            const obligation = `spelling:${form}` as const;
            const record = snapshot.evidence[obligation];
            const result = snapshot.results[obligation];
            return <div key={`${snapshot.exerciseId}:${form}`}><SpellingField label={LABELS[form]} value={state.drafts[form]}
              {...(record ? { attempt: record.ref } : {})} {...(result ? { result } : {})} processing={record?.status === 'processing'}
              helpEnabled={settings.helpEnabled} untimedHelp={settings.untimedHelp} guidance={context.verb.forms[form]}
              onChange={value => session.edit(form, value)} onFinalize={value => session.finalize(form, value)}
              onActivity={activity => session.controller.setInteraction(activity)} onHoldChange={session.controller.setPresentationHold} />
              {record?.status === 'uncertain' && state.drafts[form].trim() && <button type="button" className="ll-button" onClick={() => session.retrySpelling(form)}>Retry checking {LABELS[form]}</button>}
            </div>;
          })}
          {snapshot.systemError && !errorInHeader && <p role="status" className="verbs-system-error">{snapshot.systemError}</p>}
          {!snapshot.systemError && state.clarification && <p role="status" className="verbs-clarification">{state.clarification}</p>}
          {snapshot.hintPending && <p role="status" className="ll-hint">Preparing a hint…</p>}
          {!snapshot.hintPending && snapshot.hint && <p role="status" className="ll-hint">{snapshot.hint.text}</p>}
        </div>
      </div>
      {state.pictureComplete && <PictureDictionaryCard completion={{ identity: snapshot, dictionary: null }}
        onNext={() => session.nextPicture(snapshot.exerciseId)} />}
    </PracticeLayout>
  </div>;
}
