import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { hasAllEvidence, type LearnerSettings, type LessonModuleProps, type VerbForm, type VerbMode } from '../../contracts';
import { ExerciseCue, PracticeLayout, ProgressDialog, ReferenceTable, SpellingField } from '../../ui/mobile';
import { createVerbSession, type VerbSession } from './session';
import './verbs.css';

export type VerbLessonProps = LessonModuleProps & { mode: VerbMode; sessionControls?: ReactNode; claimUtterance?: (utteranceId: string) => void; rootVoiceError?: string };
const LABELS: Readonly<Record<VerbForm, string>> = { base: 'Base form', past: 'Past', participle: 'Past participle' };

export function VerbLesson({ mode, settings, voice, sessionId, onComplete, sessionControls, claimUtterance, rootVoiceError = '' }: VerbLessonProps) {
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
  return <VerbPractice session={session} settings={settings} rootVoiceError={rootVoiceError} {...(sessionControls !== undefined ? { sessionControls } : {})} />;
}

function VerbPractice({ session, settings, sessionControls, rootVoiceError }: { session: VerbSession; settings: LearnerSettings; sessionControls?: ReactNode; rootVoiceError: string }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { assessment: snapshot } = state;
  const context = snapshot.context;
  const [alternateCue, setAlternateCue] = useState(false);
  useEffect(() => setAlternateCue(false), [snapshot.exerciseId]);
  if (context.mode === 'sentence') return null;
  const allAccepted = hasAllEvidence(context.mode, context, snapshot.evidence, session.voice.mode === 'mock');
  const hintUnavailable = allAccepted || snapshot.hintPending
    || snapshot.interaction.connection !== 'ready' || snapshot.interaction.intent !== 'practice';
  const errorInHeader = rootVoiceError && (snapshot.systemError === rootVoiceError || snapshot.systemError === 'Voice is unavailable. Please retry when connected.');
  return <div className="verbs-lesson" data-exercise={snapshot.exerciseId} data-verb={context.verb.id} data-generation={snapshot.generation}>
    <PracticeLayout controls={<div className="ll-actions">
      <ProgressDialog mode={context.mode} identity={context} evidence={snapshot.evidence}
        onHoldChange={session.controller.setPresentationHold} controls={sessionControls} />
      <ReferenceTable title="Verb practice reference" caption="Four complementary ways to practice" columns={['Work', 'What to do']}
        rows={[
          ['Meaning', 'Say what the verb means in Spanish.'],
          ['Pronunciation', 'Pronounce the base, past, and past participle. Natural connected speech is welcome.'],
          ['Original sentences', 'Create one sentence for each form. Normal subject agreement is valid; a participle needs a complete grammatical construction.'],
          ['Spelling', context.mode === 'verb-image' ? 'Write all three forms.' : 'Write the past and past participle. The base is already supplied.'],
        ]} onHoldChange={session.controller.setPresentationHold} controls={sessionControls} />
    </div>}>
      {context.mode === 'verb-image' ? <><ExerciseCue image={context.verb.image} onAlternateCue={() => { session.controller.activity(); setAlternateCue(value => !value); }} />
        {alternateCue && <p className="verbs-alternate-cue" lang="es">{context.verb.image.alt}</p>}</>
        : <ExerciseCue base={context.verb.forms.base.accepted.join(' / ')} />}
      <div className="verbs-navigation">
        <button type="button" className="ll-button ll-next" onClick={() => session.skip()}
          aria-label={context.mode === 'verb-image' ? 'Next image' : 'Next word'} title={context.mode === 'verb-image' ? 'Next image' : 'Next word'}>
          <span aria-hidden="true">→</span>
        </button>
      </div>
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
      <button type="button" className="ll-button" onClick={session.requestHint} disabled={hintUnavailable}>Give me a hint</button>
      {snapshot.hintPending && <p role="status" className="ll-hint">Preparing a hint…</p>}
      {!snapshot.hintPending && snapshot.hint && <p role="status" className="ll-hint">{snapshot.hint.text}</p>}
    </PracticeLayout>
  </div>;
}
