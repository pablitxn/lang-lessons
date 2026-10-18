import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LearningApplication } from './app/LearningApplication';
import { SentenceLesson } from './features/sentences';
import { VerbLesson } from './features/verbs';

createRoot(document.getElementById('root')!).render(<StrictMode><LearningApplication renderLesson={(mode, props) => mode === 'sentence'
  ? <SentenceLesson {...props} /> : <VerbLesson {...props} mode={mode} />} /></StrictMode>);
