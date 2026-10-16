import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AttemptRef, EvidenceLedger, EvidenceResult, SentenceStage } from '../../../contracts';
import { CoachMessage, CompletionNotice, ExerciseCue, ObligationProgress, PracticeLayout, QuestionComposer, ReferenceTable, SentencePrompt, SpellingField, VoiceControls } from '../index';

// A direct component harness. These controls simulate props, never real assessment.
function Fixture() {
  const [value, setValue] = useState('');
  const [generation, setGeneration] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<EvidenceResult>();
  const [processing, setProcessing] = useState(false);
  const [helpEnabled, setHelpEnabled] = useState(false);
  const [untimed, setUntimed] = useState(false);
  const [finalizations, setFinalizations] = useState(0);
  const [holds, setHolds] = useState<string[]>([]);
  const [activity, setActivity] = useState({ inputFocused: false, compositionActive: false });
  const [questionActive, setQuestionActive] = useState(false);
  const [question, setQuestion] = useState('');
  const [stage, setStage] = useState<SentenceStage>('translation');
  const [sentence, setSentence] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceReady, setVoiceReady] = useState(true);
  const identity = { sessionId: 'fixture', exerciseId: 'bend', generation };
  const attempt: AttemptRef = { ...identity, obligation: 'spelling:past', attemptId: `draft-${revision}`, revision };
  const evidence: EvidenceLedger = result ? { 'spelling:past': { ref: result.ref, status: result.status, source: result.source } } : {};
  function process(status: EvidenceResult['status'], stale = false) {
    setProcessing(false);
    setResult({ ref: stale ? { ...attempt, revision: revision - 1 } : attempt, status, source: { kind: 'mock', fixtureId: 'ui-harness' }, feedback: '',
      spelling: { submittedText: value, incorrectGraphemeIndices: status === 'incorrect' ? [Math.max(0, Array.from(value).length - 1)] : [], missingGraphemeIndices: [] } });
  }
  function hold(id: string, active: boolean) {
    setHolds(previous => active ? [...new Set([...previous, id])] : previous.filter(value => value !== id));
  }
  const controls = <VoiceControls mock state={voiceReady ? 'ready' : 'offline'} muted={muted} onStart={() => setVoiceReady(true)} onMute={setMuted} onStop={() => setVoiceReady(false)} />;
  return <div style={{ maxWidth: 1000, padding: 16, margin: 'auto', fontFamily: 'system-ui, sans-serif', overflowWrap: 'anywhere' }}>
    <h1>Mobile UI component fixture</h1>
    <p>Test controls below simulate controller snapshots. No audio, provider, or automatic advancement.</p>
    <details><summary>Fixture controls</summary><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button onClick={() => process('incorrect')}>Process incorrect</button><button onClick={() => process('accepted')}>Process accepted</button>
      <button onClick={() => process('uncertain')}>Process uncertain</button><button onClick={() => process('incorrect', true)}>Deliver stale result</button>
      <button onClick={() => setGeneration(previous => previous + 1)}>Replace exercise</button>
      <button onClick={() => setSentence(previous => !previous)}>Toggle sentence mode</button>
      <button onClick={() => setStage('explanation')}>Accept translation</button><button onClick={() => setStage('complete')}>Accept explanation</button>
      <label><input type="checkbox" checked={helpEnabled} onChange={event => setHelpEnabled(event.target.checked)} />Enable sound help</label>
      <label><input type="checkbox" checked={untimed} onChange={event => setUntimed(event.target.checked)} />Untimed help</label>
    </div></details>
    <output data-testid="observations" data-finalizations={finalizations} data-holds={holds.length} data-focused={activity.inputFocused}
      data-composition={activity.compositionActive} data-question-active={questionActive} data-question={question} data-generation={generation} />
    <PracticeLayout mock progress={<ObligationProgress mode={sentence ? 'sentence' : 'verb-visible'} identity={identity} evidence={evidence} />}
      coach={<CoachMessage mock text="Take your time. You can ask questions whenever you like." />}
      controls={<>{controls}<QuestionComposer onSubmit={setQuestion} onDraftActiveChange={setQuestionActive} />
        <ReferenceTable title="Form reference" caption="General form roles" columns={['Form', 'Use']}
          rows={[["Base", "Normal subject agreement"], ["Past", "Completed past context"], ["Participle", "A complete grammatical construction"]]}
          onHoldChange={hold} controls={controls} /></>}>
      {sentence ? <><ExerciseCue spanish="Vivimos aquí desde 2020." /><SentencePrompt stage={stage} onHint={() => {}} onNext={() => setGeneration(previous => previous + 1)} /></>
        : <><ExerciseCue base="bend" /><SpellingField label="Past" value={value} attempt={attempt}
          {...(result ? { result } : {})} processing={processing} helpEnabled={helpEnabled} untimedHelp={untimed}
          guidance={{ ipa: '/bent/', spanishSoundGuide: 'Suena aproximadamente como «bent», con una t final breve.' }}
          onChange={value => { setValue(value); setRevision(previous => previous + 1); setProcessing(false); }}
          onFinalize={() => { setFinalizations(previous => previous + 1); setProcessing(true); }} onActivity={setActivity} onHoldChange={hold} />
          <CompletionNotice pending={false} onStay={() => {}} /></>}
    </PracticeLayout>
  </div>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
