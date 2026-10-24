/** EN-D12: this union is the inventory boundary, not an expandable suggestion. */
export const VERB_IDS = [
  'be', 'beat', 'become', 'begin', 'bend', 'bet', 'bite', 'bleed', 'blow',
  'break', 'bring', 'build', 'burn', 'burst', 'buy', 'catch', 'choose', 'come',
  'cost', 'cut', 'deal', 'dig', 'do', 'draw', 'dream',
] as const;
export type EnglishVerbId = (typeof VERB_IDS)[number];
export type VerbId = EnglishVerbId | `fr-${string}`;
export type LearningLanguage = 'en' | 'fr';
export const VERB_FORMS = ['base', 'past', 'participle'] as const;
export type VerbForm = (typeof VERB_FORMS)[number];
export const FRENCH_VERB_FORMS = ['infinitive', 'present', 'participle'] as const;
export type FrenchVerbForm = (typeof FRENCH_VERB_FORMS)[number];
export type PracticeVerbForm = VerbForm | FrenchVerbForm;
export type VerbDrafts = Partial<Record<PracticeVerbForm, string>>;
export type LessonMode = 'verb-image' | 'verb-visible' | 'sentence';
export type VerbMode = Exclude<LessonMode, 'sentence'>;
export const PRESENT_TENSES = [
  'present-simple', 'present-continuous', 'present-perfect', 'present-perfect-continuous',
] as const;
export type PresentTense = (typeof PRESENT_TENSES)[number];
export const PAST_TENSES = ['past-simple', 'past-continuous', 'past-perfect', 'past-perfect-continuous'] as const;
export const ENGLISH_TENSES = [...PRESENT_TENSES, ...PAST_TENSES] as const;
export const FRENCH_TENSES = ['fr-present', 'fr-passe-compose', 'fr-imparfait', 'fr-futur-proche', 'fr-futur-simple', 'fr-conditionnel-present'] as const;
export const TENSES = [...ENGLISH_TENSES, ...FRENCH_TENSES] as const;
export function tensesForLanguage(language: LearningLanguage = 'en') { return language === 'fr' ? FRENCH_TENSES : ENGLISH_TENSES; }
export type Tense = (typeof TENSES)[number];
export type SentenceTenseSelection = 'all' | Tense;
/** Independently selectable dimensions; numbers are local defaults, not CEFR claims. */
export interface Difficulty { grammar: 1 | 2 | 3; vocabulary: 1 | 2 | 3 }

export interface FormGuidance {
  accepted: readonly string[];
  ipa: string;
  spanishSoundGuide: string;
}
interface VerbEntryCommon {
  id: VerbId;
  spanishMeanings: readonly string[];
  image: { src: string; alt: string; attribution: string };
  /** Rubric examples are provider context, never prefilled learner responses. */
  /** Additional contextual teaching examples, not required learner scripts. */
  tenseExamples?: readonly { tense: Tense; family?: PracticeVerbForm; text: string; explanation: string }[];
  notes: readonly string[];
}
export interface EnglishVerbEntry extends VerbEntryCommon {
  language?: 'en';
  id: EnglishVerbId;
  forms: Readonly<Record<VerbForm, FormGuidance>>;
  examples: Readonly<Record<VerbForm, readonly string[]>>;
}
export interface FrenchVerbEntry extends VerbEntryCommon {
  language: 'fr';
  id: `fr-${string}`;
  lemma: string;
  forms: Readonly<Record<FrenchVerbForm, FormGuidance>>;
  examples: Readonly<Record<FrenchVerbForm, readonly string[]>>;
  presentConjugation: readonly { pronoun: string; form: string }[];
  auxiliary: 'avoir' | 'être' | 'avoir / être';
}
export type VerbEntry = EnglishVerbEntry | FrenchVerbEntry;
export function getVerbForms(verb: VerbEntry): readonly PracticeVerbForm[] { return verb.language === 'fr' ? FRENCH_VERB_FORMS : VERB_FORMS; }
export function getFormGuidance(verb: VerbEntry, form: PracticeVerbForm): FormGuidance | undefined {
  return (verb.forms as Partial<Record<PracticeVerbForm, FormGuidance>>)[form];
}
export function getFormExamples(verb: VerbEntry, form: PracticeVerbForm): readonly string[] {
  return (verb.examples as Partial<Record<PracticeVerbForm, readonly string[]>>)[form] ?? [];
}
export function getLanguage(context: ExerciseContext): LearningLanguage { return (context.mode === 'sentence' ? context.sentence.language : context.verb.language) ?? 'en'; }
export interface TranslationAlternative {
  text: string;
  tense: Tense;
  explanation: string;
}
export interface SentenceEntry {
  language?: LearningLanguage;
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
export type ExerciseContext = ExerciseIdentity & { language?: LearningLanguage } & (
  | { mode: VerbMode; verb: VerbEntry }
  | { mode: 'sentence'; sentence: SentenceEntry; stage: SentenceStage }
);
export type SentenceStage = 'translation' | 'explanation' | 'complete';
