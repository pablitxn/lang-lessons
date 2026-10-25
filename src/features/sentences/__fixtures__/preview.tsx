import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS, tensesForLanguage, type SentenceTenseSelection, type VoiceAdapter } from '../../../contracts';
import { SentenceLesson } from '../SentenceLesson';
import { SentenceFixtureVoice } from './voice';
import { LearningCredits } from '../../../app/LearningCredits';
import '../../../app/global.css';

const params = new URLSearchParams(location.search);
const language = params.get('language') === 'fr' ? 'fr' : 'en';
const requestedTense = params.get('tense');
const sentenceTense: SentenceTenseSelection = tensesForLanguage(language).includes(requestedTense as never)
  ? requestedTense as SentenceTenseSelection : language === 'fr' ? 'fr-passe-compose' : 'present-perfect';
const initialGrammar = params.get('grammar') === '1' ? 1 : params.get('grammar') === '3' ? 3 : 2;
const voice = new SentenceFixtureVoice(params.get('real') === '1' ? 'openai-realtime' : 'mock');
declare global { interface Window { sentenceFixture: { voice: SentenceFixtureVoice } } }
window.sentenceFixture = { voice };
function Preview() {
  const [mounted, setMounted] = useState(true);
  const [completed, setCompleted] = useState(0);
  const [difficulty, setDifficulty] = useState({ grammar: initialGrammar, vocabulary: 1 } as typeof DEFAULT_SETTINGS.difficulty);
  return <main style={{ maxWidth: 1040, margin: '0 auto', padding: 16 }}>
    <h1>Sentence lesson fixture</h1><p>Simulated transport and manually delivered verdicts; no real audio, model or provider requests.</p>
    <details><summary>Fixture controls</summary><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button onClick={() => setMounted(!mounted)}>{mounted ? 'Unmount lesson' : 'Mount lesson'}</button>
      <button onClick={() => setDifficulty({ grammar: 3, vocabulary: 3 })}>Set advanced pair</button>
      <button onClick={() => setDifficulty({ grammar: 2, vocabulary: 1 })}>Restore initial pair</button>
    </div></details>
    <details><summary>Fixture credits</summary><LearningCredits language={language} /></details>
    <output data-testid="completion-count">{completed}</output>
    {mounted && <SentenceLesson voice={voice as VoiceAdapter} sessionId="sentence-browser" connectionState="ready"
      settings={{ ...DEFAULT_SETTINGS, learningLanguage: language, helpEnabled: params.get('help') !== '0', difficulty, sentenceTense }} onComplete={() => setCompleted(value => value + 1)}
      sessionControls={<button type="button" className="ll-button" onClick={() => voice.emit({ type: 'state', eventId: voice.id(), sessionId: voice.context.sessionId, state: 'offline' })}>Mock Stop session</button>} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>);
