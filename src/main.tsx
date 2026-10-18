import { CredentialRedemption } from './app/CredentialLinks';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LearningApplication } from './app/LearningApplication';
import { SentenceLesson } from './features/sentences';
import { VerbLesson } from './features/verbs';

const credentialPage = location.pathname === '/account/credentials';
let credentialToken: string | null = null;
if (credentialPage) {
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  credentialToken = token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  history.replaceState(null, '', location.pathname);
}
createRoot(document.getElementById('root')!).render(<StrictMode>{credentialPage ? <CredentialRedemption token={credentialToken} /> : <LearningApplication renderLesson={(mode, props) => mode === 'sentence'
  ? <SentenceLesson {...props} /> : <VerbLesson {...props} mode={mode} />} />}</StrictMode>);
