import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS, type VerbMode } from '../../../contracts';
import { VerbLesson } from '../index';
import { VerbFixtureAdapter } from './adapter';

function Fixture() {
  const [voice] = useState(() => new VerbFixtureAdapter('verbs-browser', true));
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [completed, setCompleted] = useState(0);
  const [, setVersion] = useState(0);
  const mode: VerbMode = new URLSearchParams(location.search).get('mode') === 'visible' ? 'verb-visible' : 'verb-image';
  useEffect(() => voice.subscribe(() => setVersion(previous => previous + 1)), [voice]);
  const sessionControls = <button type="button" className="ll-button" onClick={() => voice.disconnect()}>Mock Stop session</button>;
  return <div style={{ maxWidth: 1000, padding: 16, margin: 'auto', fontFamily: 'system-ui, sans-serif', overflowWrap: 'anywhere' }}>
    <h1>Verb lesson fixture</h1>
    <p>Mock adapter only. Buttons simulate evidence and conversation, without a microphone or provider.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
      <button onClick={() => voice.utterance('Explicit mock fixture: all seven oral obligations demonstrated.')}>Send oral fixture</button>
      <button onClick={() => voice.utterance('Unclear audio fixture', true)}>Send uncertain fixture</button>
      <button onClick={() => voice.emit({ type: 'speech', speaker: 'learner', active: true })}>Keep speaking</button>
      <button onClick={() => voice.emit({ type: 'speech', speaker: 'learner', active: false })}>Finish speaking</button>
      <button onClick={() => {
        if (voice.context) voice.emit({ type: 'feedback', identity: voice.context, text: 'Mock answer to your question. Your current exercise is preserved.' });
        voice.emit({ type: 'intent', intent: 'question-resolved' });
      }}>Answer question fixture</button>
      <label><input type="checkbox" checked={settings.helpEnabled} onChange={event => setSettings(previous => ({ ...previous, helpEnabled: event.target.checked }))} />Enable sound help</label>
    </div>
    <output data-testid="observations" data-completed={completed} data-submissions={voice.inputs.length}
      data-spelling-submissions={voice.inputs.filter(input => input.attempts.some(ref => ref.obligation.startsWith('spelling:'))).length} />
    <VerbLesson mode={mode} settings={settings} voice={voice} sessionId="verbs-browser" onComplete={() => setCompleted(previous => previous + 1)} sessionControls={sessionControls} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
