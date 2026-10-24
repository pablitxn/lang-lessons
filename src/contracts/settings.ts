import type { Difficulty, LearningLanguage, LessonMode, SentenceTenseSelection } from './curriculum';
import type { VoiceAdapter } from './voice';

export interface LearnerSettings {
  schemaVersion: 1;
  learningLanguage: LearningLanguage;
  helpEnabled: boolean;
  untimedHelp: boolean;
  difficulty: Difficulty;
  preferredMode: LessonMode;
  theme: 'system' | 'light' | 'dark';
  sentenceTense: SentenceTenseSelection;
}
/** Reversible local defaults; timers must be cancellable and tested with a fake clock. */
export const TIMING = {
  typingDebounceMs: 700,
  verbQuietPeriodMs: 1800,
  helpOfferMs: 8000,
  maxVoiceSessionSeconds: 600,
} as const;
export const DEFAULT_SETTINGS: LearnerSettings = {
  schemaVersion: 1, learningLanguage: 'en', helpEnabled: false, untimedHelp: false,
  difficulty: { grammar: 1, vocabulary: 1 }, preferredMode: 'verb-image', theme: 'system', sentenceTense: 'all',
};
/** Feature entry points own their exercise state; root owns one continuous adapter. */
export interface LessonModuleProps {
  settings: LearnerSettings;
  voice: VoiceAdapter;
  sessionId: string;
  onComplete: (exerciseId: string) => void;
}
