import type { Tense } from '../contracts';

/** Generic structures only: never reveal the current exercise's answer. */
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
