import type { Difficulty, LessonMode } from './curriculum';
import type { VoiceAdapter } from './voice';

export interface LearnerSettings {
  schemaVersion: 1;
  helpEnabled: boolean;
  difficulty: Difficulty;
  preferredMode: LessonMode;
}
/** Reversible local defaults; timers must be cancellable and tested with a fake clock. */
export const TIMING = {
  typingDebounceMs: 650,
  verbQuietPeriodMs: 1800,
  helpOfferMs: 6000,
  maxVoiceSessionSeconds: 600,
} as const;
export const DEFAULT_SETTINGS: LearnerSettings = {
  schemaVersion: 1, helpEnabled: false,
  difficulty: { grammar: 1, vocabulary: 1 }, preferredMode: 'verb-image',
};
/** Feature entry points own their exercise state; root owns one continuous adapter. */
export interface LessonModuleProps {
  settings: LearnerSettings;
  voice: VoiceAdapter;
  sessionId: string;
  onComplete: (exerciseId: string) => void;
}
