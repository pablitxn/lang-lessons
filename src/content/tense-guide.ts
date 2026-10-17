import type { Tense } from '../contracts';

/** Full structures shown after a sentence translation is accepted. */
export const TENSE_GUIDE: readonly { tense: Tense; label: string; guidance: string }[] = [
  { tense: 'present-simple', label: 'Present simple', guidance: 'Base family with subject agreement; habits and states. Questions/negatives use do/does + base (be uses am/is/are).' },
  { tense: 'present-continuous', label: 'Present continuous', guidance: 'Am/is/are + -ing; activity in progress around now.' },
  { tense: 'present-perfect', label: 'Present perfect', guidance: 'Have/has + past participle; earlier events or states connected to now.' },
  { tense: 'present-perfect-continuous', label: 'Present perfect continuous', guidance: 'Have/has been + -ing; duration or repetition leading up to now.' },
  { tense: 'past-simple', label: 'Past simple', guidance: 'Past form for finished past events/states. Questions/negatives use did + base; be uses was/were without did.' },
  { tense: 'past-continuous', label: 'Past continuous', guidance: 'Was/were + -ing; activity in progress at a past reference time. Invert was/were for questions; add not for negatives.' },
  { tense: 'past-perfect', label: 'Past perfect', guidance: 'Had + past participle; an event or state earlier than a later past reference. Invert had for questions; use had not for negatives.' },
  { tense: 'past-perfect-continuous', label: 'Past perfect continuous', guidance: 'Had been + -ing; duration or repetition up to a past reference. Questions use had + subject + been; negatives use had not been.' },
];

/** Verb practice omits concrete auxiliaries, which can be the requested forms of be/do. */
const VERB_STRUCTURES: Record<Tense, string> = {
  'present-simple': 'Base family with subject agreement; habits and states. Use the appropriate auxiliary for questions and negatives, except with the copular verb.',
  'present-continuous': 'Present progressive auxiliary + present participle (-ing); activity in progress around now.',
  'present-perfect': 'Present perfect auxiliary + past participle; earlier events or states connected to now.',
  'present-perfect-continuous': 'Present perfect auxiliary + progressive auxiliary participle + -ing; duration or repetition leading up to now.',
  'past-simple': 'Past form for finished past events or states. Questions and negatives usually use a past auxiliary + base; the copular verb follows its own pattern.',
  'past-continuous': 'Past progressive auxiliary + present participle (-ing); activity in progress at a past reference time.',
  'past-perfect': 'Past perfect auxiliary + past participle; an event or state earlier than a later past reference.',
  'past-perfect-continuous': 'Past perfect auxiliary + progressive auxiliary participle + -ing; duration or repetition up to a past reference.',
};

export const VERB_TENSE_GUIDE = TENSE_GUIDE.map(item => ({ ...item, guidance: VERB_STRUCTURES[item.tense] }));
