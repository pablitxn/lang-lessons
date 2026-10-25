import { getPictureDictionaryEntry } from './dictionary';
import { createWrittenPracticeBinding } from '../progress/written-practice-binding';
import type { WrittenPracticeBinding } from '../progress/written-snapshot';
import { useWrittenActivity, type WrittenActivityBinding } from '../progress/use-written-activity';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { type LearnerSettings, type LessonModuleProps, type PracticeVerbForm, type VerbMode, getVerbForms, getFormGuidance, getLanguage } from '../../contracts';
import { PracticeLayout, ProgressDialog, ReferenceTable, SpellingField } from '../../ui/mobile';
import { PictureCue } from './PictureCue';
import { WordCue } from './WordCue';
import { VERB_HINTS } from './verb-hints';
import { createVerbSession, type VerbSession } from './session';
import { VerbCompletionCard } from './VerbCompletionCard';
import { createPicturePreload } from './picture-preload';
import type { ProgressSink } from '../../contracts';
import './verbs.css';
import './writing-lines.css';
import { photosForLanguage } from '../../content';
import { getVerbTenseGuide } from '../../content/tense-guide';

export type VerbLessonProps = LessonModuleProps & { mode: VerbMode; writtenPractice?: WrittenPracticeBinding; writtenActivity?: WrittenActivityBinding; progressSink?: ProgressSink; canWrite?: () => boolean; onProgressError?: () => void; sessionControls?: ReactNode; claimUtterance?: (utteranceId: string) => void; rootVoiceError?: string };
const LABELS: Readonly<Record<PracticeVerbForm, string>> = { base: 'Base form', past: 'Past', participle: 'Past participle', infinitive: 'Infinitivo', present: 'Presente — je (sin el pronombre)' };

export function VerbLesson({ mode, settings, voice, sessionId, onComplete, sessionControls, claimUtterance, rootVoiceError = '', progressSink, onProgressError, canWrite, writtenActivity, writtenPractice }: VerbLessonProps) {
  const writeGate = useRef(canWrite); writeGate.current = canWrite;
  const [progressError, setProgressError] = useState(false);
  const completed = useRef(onComplete);
  const claim = useRef(claimUtterance);
  completed.current = onComplete;
  claim.current = claimUtterance;
  const [session, setSession] = useState<VerbSession | null>(null);
  useEffect(() => {
    setProgressError(false);
    const binding = createWrittenPracticeBinding(writtenPractice);
    const current = createVerbSession({ mode, language: settings.learningLanguage ?? 'en', voice, sessionId, ...(writtenPractice ? { writtenPracticeUserId: writtenPractice.userId, onWrittenPracticeChange: binding.changed } : {}), canWrite: () => writeGate.current?.() !== false, ...(progressSink ? { progressSink } : {}), onProgressError: () => { setProgressError(true); onProgressError?.(); }, onComplete: id => completed.current(id), get claimUtterance() { return claim.current; } });
    const release = binding.attach(current);
    setSession(current);
    return () => { release?.(); current.dispose(); };
  }, [mode, settings.learningLanguage, voice, sessionId, writtenPractice?.userId]);
  if (!session || session.mode !== mode || session.language !== (settings.learningLanguage ?? 'en') || session.voice !== voice || session.sessionId !== sessionId) return <p role="status">{settings.learningLanguage === 'fr' ? 'Preparando tu práctica de verbos…' : 'Preparing your verb practice…'}</p>;
  return <>{progressError && <p role="status">{settings.learningLanguage === 'fr' ? 'No se pudo guardar el progreso. Tu práctica actual sigue disponible.' : 'Progress could not be saved. Your current practice remains available.'}</p>}<VerbPractice session={session} settings={settings} rootVoiceError={rootVoiceError} {...(writtenActivity ? { writtenActivity } : {})} {...(sessionControls !== undefined ? { sessionControls } : {})} /></>;
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
    const moved = direction === 'previous' ? session.previous() : state.writtenComplete ? session.nextVerb(snapshot.exerciseId) : session.skip();
    if (!moved) navigationFocus.current = null;
  }
  const context = snapshot.context;
  if (context.mode === 'sentence') return null;
  const language = getLanguage(context);
  const french = language === 'fr';
  const forms = getVerbForms(context.verb);
  const labels = { ...LABELS, participle: french ? 'Participio pasado' : LABELS.participle };
  const photo = photosForLanguage(language).find(item => item.src === context.verb.image.src);
  const text = (english: string, spanish: string) => french ? spanish : english;
  const writtenComplete = session.fields.every(form => snapshot.evidence[`spelling:${form}`]?.status === 'accepted');
  const referenceRows = french ? [
    ['Significado', 'Decí el significado en español.'],
    ['Pronunciación', 'Pronunciá el infinitivo, la forma de je en presente y el participio. Practicá los enlaces naturales.'],
    ['Oraciones propias', 'Usá el infinitivo en una construcción natural (por ejemplo, después de otro verbo), una forma conjugada en presente y el participio dentro de una oración completa.'],
    ['Escritura', context.mode === 'verb-image' ? 'Escribí el infinitivo, el presente de je sin el pronombre y el participio.' : 'Escribí el presente de je sin el pronombre y el participio; el infinitivo ya está visible.'],
    ...getVerbTenseGuide(language).map(item => [item.label, item.guidance]),
    ...(context.verb.language === 'fr' && writtenComplete ? [
      ['Presente: conjugación', context.verb.presentConjugation.map(item => item.pronoun === 'je' && /^[aeiouyéèêîôûœ]/iu.test(item.form) ? `j’${item.form}` : /['’]$/u.test(item.pronoun) ? `${item.pronoun}${item.form}` : `${item.pronoun} ${item.form}`).join(' · ')],
      ['Auxiliar del passé composé', context.verb.auxiliary],
      ...context.verb.notes.map(note => ['Nota', note]),
    ] : [['Conjugación completa', 'Completá los campos escritos para consultar la conjugación y las notas de este verbo.']]),
  ] : [
    ['Meaning', 'Say what the verb means in Spanish.'],
    ['Pronunciation', 'Pronounce the base, past, and past participle. Natural connected speech is welcome.'],
    ['Original sentences', 'Create one sentence for each form. Normal subject agreement is valid; a participle needs a complete grammatical construction.'],
    ['Spelling', context.mode === 'verb-image' ? 'Write all three forms.' : 'Write the past and past participle. The base is already supplied.'],
    ...getVerbTenseGuide(language).map(item => [item.label, item.guidance]),
  ];
  const navigation = <nav className="verbs-navigation" aria-label={context.mode === 'verb-image' ? 'Picture navigation' : 'Verb navigation'}>
    {context.mode === 'verb-image' && <button ref={previousButton} type="button" className="verbs-photo-button" onClick={() => navigate('previous')} disabled={!state.canGoBack}
      aria-label={text('Previous image', 'Imagen anterior')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" /></svg>
    </button>}
    <button ref={nextButton} type="button" className="verbs-photo-button" onClick={() => navigate('next')}
      aria-label={context.mode === 'verb-image' ? text('Next image', 'Siguiente imagen') : text('Next word', 'Siguiente verbo')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6M16 12H4" /></svg>
    </button>
  </nav>;
  const errorInHeader = rootVoiceError && (snapshot.systemError === rootVoiceError || snapshot.systemError === 'Voice is unavailable. Please retry when connected.');
  return <div ref={activityElement} className="verbs-lesson" lang={french ? 'es' : 'en'} data-exercise={snapshot.exerciseId} data-verb={context.verb.id} data-generation={snapshot.generation}>
    <PracticeLayout controls={<div className="ll-actions">
      <ProgressDialog language={language} mode={context.mode} identity={context} evidence={snapshot.evidence}
        onHoldChange={session.controller.setPresentationHold} controls={sessionControls} />
      <ReferenceTable language={language} title={text('Verb practice reference', 'Guía de práctica de verbos')} caption={text('Four complementary ways to practice', 'Cuatro maneras complementarias de practicar')} columns={french ? ['Práctica', 'Cómo hacerlo'] : ['Work', 'What to do']}
        rows={referenceRows} onHoldChange={session.controller.setPresentationHold} controls={sessionControls} />
    </div>}>
      <div className={context.mode === 'verb-image' ? 'verbs-workspace verbs-workspace-picture' : 'verbs-workspace'}>
        <div className="verbs-prompt">
          {context.mode === 'verb-image' ? <PictureCue language={language} key={snapshot.exerciseId} image={context.verb.image}
            information={french ? photo && 'tooltip_es' in photo && typeof photo.tooltip_es === 'string' ? photo.tooltip_es : context.verb.image.alt : photo?.tooltip_en ?? 'A small moment holds a story.'} navigation={navigation} onHoldChange={session.controller.setPresentationHold} />
            : <WordCue language={language} key={snapshot.exerciseId} base={getFormGuidance(context.verb, forms[0]!)?.accepted.join(' / ') ?? ''}
              information={context.verb.language === 'fr' ? context.verb.image.alt : VERB_HINTS[context.verb.id]} navigation={navigation} onHoldChange={session.controller.setPresentationHold} />}
        </div>
        <div className="verbs-answers">
          {session.fields.map(form => {
            const obligation = `spelling:${form}` as const;
            const record = snapshot.evidence[obligation];
            const result = snapshot.results[obligation];
            return <div key={`${snapshot.exerciseId}:${form}`}><SpellingField language={language} label={labels[form]} value={state.drafts[form] ?? ''}
              {...(record ? { attempt: record.ref } : {})} {...(result ? { result } : {})} processing={record?.status === 'processing'}
              helpEnabled={settings.helpEnabled} untimedHelp={settings.untimedHelp} guidance={getFormGuidance(context.verb, form)}
              onChange={value => session.edit(form, value)} onFinalize={value => session.finalize(form, value)}
              onActivity={activity => session.controller.setInteraction(activity)} onHoldChange={session.controller.setPresentationHold} />
              {record?.status === 'uncertain' && (state.drafts[form] ?? '').trim() && <button type="button" className="ll-button" onClick={() => session.retrySpelling(form)}>{text('Retry checking', 'Volver a comprobar')} {labels[form]}</button>}
            </div>;
          })}
          {snapshot.systemError && !errorInHeader && <p role="status" className="verbs-system-error">{snapshot.systemError}</p>}
          {!snapshot.systemError && state.clarification && <p role="status" className="verbs-clarification">{state.clarification}</p>}
          {snapshot.hintPending && <p role="status" className="ll-hint">{text('Preparing a hint…', 'Preparando una pista…')}</p>}
          {!snapshot.hintPending && snapshot.hint && <p role="status" className="ll-hint">{snapshot.hint.text}</p>}
        </div>
      </div>
      {state.writtenComplete && <VerbCompletionCard mode={context.mode} identity={snapshot} verb={context.verb} entry={getPictureDictionaryEntry(context.verb.id)}
        onNext={() => session.nextVerb(snapshot.exerciseId)} />}
    </PracticeLayout>
  </div>;
}
