import type { ExerciseIdentity, SentenceEntry } from '../../contracts';
import { WrittenPractice } from '../writing/WrittenPractice';

export interface SentenceRewritePracticeProps {
  sentence: SentenceEntry;
  identity: ExerciseIdentity;
  originalTranslation: string;
}

/** Further examples retain the accepted sentence as inspiration, without changing its evidence. */
export function SentenceRewritePractice({ sentence, identity, originalTranslation }: SentenceRewritePracticeProps) {
  const language = sentence.language ?? 'en';
  return <WrittenPractice identity={identity} scope={originalTranslation} language={language}
    endpoint="/api/realtime/sentence-rewrite" context={{ sentenceId: sentence.id }}
    title="Escribe otros ejemplos" fieldLabel="Tu ejemplo" className="sentence-rewrite-practice"
    placeholder={language === 'fr' ? 'Écris un autre exemple…' : 'Write another example…'}
    pendingMessage="Revisando tu frase…"
    reference={{ label: 'Frase de referencia', text: originalTranslation, className: 'sentence-rewrite-original' }} />;
}
