/** One reviewed pre-translation envelope shared by text presentation and speech. */
export const TRANSLATION_HINTS = [
  '¿Qué mensaje quieres comunicar?',
  '¿Qué relación expresa el contexto entre la acción y el momento del que hablas?',
  '¿Qué detalle del contexto falta en tu intento? Prueba otra frase completa.',
] as const;
export const SAFE_ENGLISH_HINTS = [
  'What message do you want to express?',
  'How does the context relate the activity to the time you are talking about?',
  'Which detail from the context is missing in your attempt? Try another complete sentence.',
] as const;
const normalize = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export function guardTranslationHint(text: string, level: 1 | 2 | 3): { text: string; fallback: boolean } {
  const found = [TRANSLATION_HINTS[level - 1]!, SAFE_ENGLISH_HINTS[level - 1]!].find(candidate => normalize(candidate) === normalize(text));
  return found ? { text: found, fallback: false } : { text: TRANSLATION_HINTS[level - 1]!, fallback: true };
}
export function guardTranslationFeedback(text: string): { text: string; fallback: boolean } {
  const found = [...TRANSLATION_HINTS, ...SAFE_ENGLISH_HINTS].find(candidate => normalize(candidate) === normalize(text));
  return found ? { text: found, fallback: false } : { text: TRANSLATION_HINTS[0], fallback: true };
}
