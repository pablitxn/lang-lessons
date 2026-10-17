import type { LessonMode } from '../contracts';

export const MODES = [
  { id: 'verb-image', title: 'Picture practice', short: 'Picture', description: 'Find the verb in a picture, then make it your own.', editableForms: 3 },
  { id: 'verb-visible', title: 'Verb practice', short: 'Verb', description: 'Start with a base verb and build confidence with its forms.', editableForms: 2 },
  { id: 'sentence', title: 'Sentence practice', short: 'Sentence', description: 'Translate a Spanish prompt, then explain how your English works.', editableForms: 0 },
] as const;
export function resolveMode(hash: string, fallback: LessonMode = 'verb-image'): LessonMode {
  return MODES.find(mode => hash === `#/${mode.id}`)?.id ?? fallback;
}
export function modeHref(mode: LessonMode): string { return `#/${mode}`; }
/** Only a lesson URL opens a call; empty and unknown routes show the catalog. */
export function resolveLessonRoute(hash: string): LessonMode | null {
  return MODES.find(mode => hash === modeHref(mode.id))?.id ?? null;
}
