/** EN-D12: this union is the inventory boundary, not an expandable suggestion. */
export const VERB_IDS = [
  'be', 'beat', 'become', 'begin', 'bend', 'bet', 'bite', 'bleed', 'blow',
  'break', 'bring', 'build', 'burn', 'burst', 'buy', 'catch', 'choose', 'come',
  'cost', 'cut', 'deal', 'dig', 'do', 'draw', 'dream',
] as const;
export type VerbId = (typeof VERB_IDS)[number];
export const VERB_FORMS = ['base', 'past', 'participle'] as const;
export type VerbForm = (typeof VERB_FORMS)[number];
export type LessonMode = 'verb-image' | 'verb-visible' | 'sentence';
export type VerbMode = Exclude<LessonMode, 'sentence'>;
export const PRESENT_TENSES = [
  'present-simple', 'present-continuous', 'present-perfect', 'present-perfect-continuous',
] as const;
export type PresentTense = (typeof PRESENT_TENSES)[number];
export const PAST_TENSES = ['past-simple', 'past-continuous', 'past-perfect', 'past-perfect-continuous'] as const;
export const TENSES = [...PRESENT_TENSES, ...PAST_TENSES] as const;
export type Tense = (typeof TENSES)[number];
export type SentenceTenseSelection = 'all' | Tense;
/** Independently selectable dimensions; numbers are local defaults, not CEFR claims. */
export interface Difficulty { grammar: 1 | 2 | 3; vocabulary: 1 | 2 | 3 }

export interface FormGuidance {
  accepted: readonly string[];
  ipa: string;
  spanishSoundGuide: string;
}
export interface VerbEntry {
  id: VerbId;
  forms: Readonly<Record<VerbForm, FormGuidance>>;
  spanishMeanings: readonly string[];
  image: { src: string; alt: string; attribution: string };
  /** Rubric examples are provider context, never prefilled learner responses. */
  examples: Readonly<Record<VerbForm, readonly string[]>>;
  /** Additional contextual teaching examples, not required learner scripts. */
  tenseExamples?: readonly { tense: Tense; family: VerbForm; text: string; explanation: string }[];
  notes: readonly string[];
}
export interface TranslationAlternative {
  text: string;
  tense: Tense;
  explanation: string;
}
export interface SentenceEntry {
  id: string;
  spanish: string;
  difficulty: Difficulty;
  alternatives: readonly TranslationAlternative[];
  /** These are rubric seeds; live coaching generates gradual hints per attempt. */
  hintSeeds: readonly string[];
  explanationRubric: { structure: string; meaning: string; usage: string };
}
export interface ExerciseIdentity {
  sessionId: string;
  exerciseId: string;
  /** Increment when restarting/replacing an exercise, even for the same content ID. */
  generation: number;
}
export type ExerciseContext = ExerciseIdentity & (
  | { mode: VerbMode; verb: VerbEntry }
  | { mode: 'sentence'; sentence: SentenceEntry; stage: SentenceStage }
);
export type SentenceStage = 'translation' | 'explanation' | 'complete';
