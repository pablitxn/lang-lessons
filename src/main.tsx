import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { SentenceLesson } from './features/sentences';
import { VerbLesson } from './features/verbs';

createRoot(document.getElementById('root')!).render(<StrictMode><App renderLesson={(mode, props) => mode === 'sentence'
  ? <SentenceLesson {...props} /> : <VerbLesson {...props} mode={mode} />} /></StrictMode>);
