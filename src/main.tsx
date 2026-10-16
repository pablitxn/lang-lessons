import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { SentenceLesson } from './features/sentences';

createRoot(document.getElementById('root')!).render(<StrictMode><App renderLesson={(mode, props) => mode === 'sentence' ? <SentenceLesson {...props} /> : null} /></StrictMode>);
