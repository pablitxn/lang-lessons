import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { hasAllEvidence, type LearnerSettings, type LessonModuleProps, type VerbForm, type VerbMode } from '../../contracts';
import { CoachMessage, CompletionNotice, ExerciseCue, ObligationProgress, PracticeLayout, QuestionComposer, ReferenceTable, SpellingField } from '../../ui/mobile';
import { createVerbSession, type VerbSession } from './session';
import './verbs.css';

export type VerbLessonProps = LessonModuleProps & { mode: VerbMode; sessionControls?: ReactNode; claimUtterance?: (utteranceId: string) => void };
const LABELS: Readonly<Record<VerbForm, string>> = { base: 'Base form', past: 'Past', participle: 'Past participle' };

export function VerbLesson({ mode, settings, voice, sessionId, onComplete, sessionControls, claimUtterance }: VerbLessonProps) {
  const completed = useRef(onComplete);
  const claim = useRef(claimUtterance);
  completed.current = onComplete;
  claim.current = claimUtterance;
  const [session, setSession] = useState<VerbSession | null>(null);
  useEffect(() => {
    const current = createVerbSession({ mode, voice, sessionId, onComplete: id => completed.current(id), get claimUtterance() { return claim.current; } });
    setSession(current);
    return () => current.dispose();
  }, [mode, voice, sessionId]);
  if (!session || session.mode !== mode || session.voice !== voice || session.sessionId !== sessionId) return <p role="status">Preparing your verb practice…</p>;
  return <VerbPractice session={session} settings={settings} {...(sessionControls !== undefined ? { sessionControls } : {})} />;
}

function VerbPractice({ session, settings, sessionControls }: { session: VerbSession; settings: LearnerSettings; sessionControls?: ReactNode }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { assessment: snapshot } = state;
  const context = snapshot.context;
  const [alternateCue, setAlternateCue] = useState(false);
  useEffect(() => setAlternateCue(false), [snapshot.exerciseId]);
  if (context.mode === 'sentence') return null;
  const allAccepted = hasAllEvidence(context.mode, context, snapshot.evidence, session.voice.mode === 'mock');
  const liveControls = <div className="verbs-session-actions">
    <p role="status">{snapshot.interaction.connection === 'ready' ? state.muted ? 'Microphone off' : session.voice.mode === 'mock' ? 'Mock voice ready' : 'Voice connected'
      : 'Voice disconnected. Use the session controls to connect.'}</p>
    <div className="ll-actions">
      <button type="button" className="ll-button" disabled={snapshot.interaction.connection !== 'ready'} aria-pressed={state.muted}
        onClick={() => session.setMuted(!state.muted)}>{state.muted ? 'Resume microphone' : 'Mute microphone'}</button>
      {snapshot.interaction.intent !== 'practice' || snapshot.interaction.questionPending
        ? <button type="button" className="ll-button" onClick={session.resume}>Back to practice</button>
        : <button type="button" className="ll-button" onClick={session.pause}>Pause practice</button>}
    </div>
    {sessionControls}
  </div>;
  return <div className="verbs-lesson" data-exercise={snapshot.exerciseId} data-verb={context.verb.id} data-generation={snapshot.generation}>
    <PracticeLayout mock={session.voice.mode === 'mock'}
      progress={<ObligationProgress mode={context.mode} identity={context} evidence={snapshot.evidence} />}
      coach={<CoachMessage text={state.coachText} pending={snapshot.hintPending && !snapshot.interaction.questionPending} mock={session.voice.mode === 'mock'} />}
      controls={<>{liveControls}
        <QuestionComposer onSubmit={session.ask} onDraftActiveChange={active => session.controller.setInteraction({ questionDraftActive: active })} />
        {state.question && <p className="verbs-learner-question">You asked: {state.question}</p>}
        <ReferenceTable title="Verb practice reference" caption="Four complementary ways to practice" columns={['Work', 'What to do']}
          rows={[
            ['Meaning', 'Say what the verb means in Spanish.'],
            ['Pronunciation', 'Pronounce the base, past, and past participle. Natural connected speech is welcome.'],
            ['Original sentences', 'Create one sentence for each form. Normal subject agreement is valid; a participle needs a complete grammatical construction.'],
            ['Spelling', context.mode === 'verb-image' ? 'Write all three forms.' : 'Write the past and past participle. The base is already supplied.'],
          ]} onHoldChange={session.controller.setPresentationHold} controls={liveControls} />
      </>}>
      <p className="verbs-instructions">Speak and write in any order. One spoken turn can cover several requirements.</p>
      {context.mode === 'verb-image' ? <><ExerciseCue image={context.verb.image} onAlternateCue={() => { session.controller.activity(); setAlternateCue(value => !value); }} />
        {alternateCue && <p className="verbs-alternate-cue" lang="es">{context.verb.image.alt}</p>}
        <p className="ll-muted">The picture suggests an action, not a tense.</p></>
        : <ExerciseCue base={context.verb.forms.base.accepted.join(' / ')} />}
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
      {snapshot.systemError && <p role="status" className="verbs-system-error">{snapshot.systemError}</p>}
      {snapshot.interaction.intent !== 'practice' && <p role="status">Practice is paused. Your accepted work is safe.</p>}
      <button type="button" className="ll-button" onClick={session.requestHint} disabled={allAccepted}>Give me a hint</button>
      <CompletionNotice pending={allAccepted && !snapshot.completed} onStay={session.pause} />
    </PracticeLayout>
  </div>;
}
