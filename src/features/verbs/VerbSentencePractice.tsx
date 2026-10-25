import type { ExerciseIdentity, VerbEntry } from '../../contracts';
import { WrittenPractice } from '../writing/WrittenPractice';

export interface VerbSentencePracticeProps { verb: VerbEntry; identity: ExerciseIdentity }

/** Verb examples keep the current lemma as context and never satisfy oral obligations. */
export function VerbSentencePractice({ verb, identity }: VerbSentencePracticeProps) {
  const language = verb.language ?? 'en';
  const lemma = verb.language === 'fr' ? verb.lemma : verb.forms.base.accepted[0] ?? verb.id;
  return <WrittenPractice identity={identity} scope={verb.id} language={language}
    endpoint="/api/realtime/verb-writing" context={{ verbId: verb.id }}
    title="Escribe otros ejemplos" fieldLabel={`Tu frase con ${lemma}`}
    placeholder={language === 'fr' ? 'Écris ta propre phrase…' : 'Write your own sentence…'}
    pendingMessage="Revisando tu frase…" reference={{ label: 'Verbo:', text: lemma, inline: true }} />;
}
