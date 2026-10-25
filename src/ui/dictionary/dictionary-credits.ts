import { useSyncExternalStore } from 'react';
import type { DictionaryEntry, DictionarySource, LearningLanguage } from '../../contracts';

interface ConsultedSource { lemma: string; language: LearningLanguage; source: DictionarySource }
let sources: readonly ConsultedSource[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => sources;

/** Keep attribution for this page's viewed public entries out of the exercise body. */
export function rememberDictionarySources(entry: DictionaryEntry, language: LearningLanguage) {
  const next = new Map(sources.map(item => [item.source.url, item]));
  for (const sense of entry.senses) {
    const source = sense.definition.source;
    next.set(source.url, { lemma: entry.lemma, language, source });
  }
  sources = [...next.values()];
  listeners.forEach(listener => listener());
}

export function useDictionarySources(language: LearningLanguage) {
  return useSyncExternalStore(subscribe, snapshot, snapshot).filter(item => item.language === language);
}
