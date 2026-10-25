import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VERBS, FRENCH_VERBS } from '../../../content';
import { VerbSentencePractice } from '../VerbSentencePractice';
import '../../../app/global.css';

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';

function Preview() {
  const [language, setLanguage] = useState(params.get('language') === 'fr' ? 'fr' : 'en');
  const [exercise, setExercise] = useState(1);
  const [account, setAccount] = useState(1);
  const [generation, setGeneration] = useState(0);
  const [mounted, setMounted] = useState(true);
  const verb = language === 'fr' ? FRENCH_VERBS[0]! : VERBS.find(item => item.id === 'bet')!;
  return <main style={{ width: 'min(100%, 720px)', margin: 'auto', padding: 20 }}>
    <h1>Optional verb writing fixture</h1>
    <p>Local rendering only. Browser tests intercept all coaching requests with explicit mock responses.</p>
    <details><summary>Fixture controls</summary><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button onClick={() => setExercise(value => value + 1)}>Next exercise</button>
      <button onClick={() => setAccount(value => value + 1)}>Switch account</button>
      <button onClick={() => setGeneration(value => value + 1)}>Advance generation</button>
      <button onClick={() => setLanguage(value => value === 'fr' ? 'en' : 'fr')}>Switch language</button>
      <button onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount practice' : 'Mount practice'}</button>
    </div></details>
    <output data-testid="identity">{account}:{exercise}:{generation}</output>
    {mounted && <VerbSentencePractice verb={verb} identity={{ sessionId: `writing-session-${account}`, exerciseId: `writing-exercise-${exercise}`, generation }} />}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>);
