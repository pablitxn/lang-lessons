import type { ExerciseIdentity } from './curriculum';

export { MAX_WRITTEN_COACHING_LENGTH as MAX_VERB_SENTENCE_LENGTH, MAX_WRITTEN_COACHING_FEEDBACK_LENGTH as MAX_VERB_FEEDBACK_LENGTH, parseWrittenCoachingFeedback as parseVerbWritingFeedback, type WrittenCoachingFeedback as VerbWritingFeedback } from './written-coaching';

export interface VerbWritingRequest { identity: ExerciseIdentity; verbId: string; draft: string }
export interface SentenceRewriteRequest { identity: ExerciseIdentity; sentenceId: string; draft: string }
