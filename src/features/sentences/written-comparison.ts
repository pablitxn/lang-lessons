import { alignGraphemes } from '../../assessment/spelling';
import type { LearningLanguage, SentenceEntry } from '../../contracts';

/** UTF-16 code units, matching the native input maxLength attribute. */
export const MAX_WRITTEN_TRANSLATION_LENGTH = 1000;
type Alternative = SentenceEntry['alternatives'][number];
export interface WrittenComparisonSegment { text: string; different: boolean; gap: boolean }
export interface WrittenComparisonResult {
  status: 'empty' | 'matched' | 'different' | 'too-long';
  submittedText: string;
  segments: WrittenComparisonSegment[];
  matchedAlternative?: Alternative;
  closestAlternative?: Alternative;
}
interface Unit { value: string; indices: number[] }
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const contractions: Readonly<Record<string, string>> = {
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have',
  "i'll": 'i will', "you'll": 'you will', "he'll": 'he will', "she'll": 'she will',
  "it'll": 'it will', "we'll": 'we will', "they'll": 'they will',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not',
  "can't": 'can not', cannot: 'can not', "couldn't": 'could not',
  "won't": 'will not', "wouldn't": 'would not', "shouldn't": 'should not',
  "mustn't": 'must not', "needn't": 'need not',
};

function normalize(text: string, language: LearningLanguage) {
  const graphemes = [...segmenter.segment(text)].map(part => part.segment);
  const units: Unit[] = [];
  graphemes.forEach((part, index) => {
    const value = part.normalize('NFC').toLowerCase().replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"');
    if (/^\s+$/u.test(value)) {
      if (units.at(-1)?.value === ' ') units.at(-1)!.indices.push(index);
      else units.push({ value: ' ', indices: [index] });
    } else units.push({ value, indices: [index] });
  });
  while (units[0]?.value === ' ') units.shift();
  while (units.at(-1)?.value === ' ' || /^[.!?]$/u.test(units.at(-1)?.value ?? '')) units.pop();

  // French elisions are grammatical forms, not English auxiliary contractions.
  // Keep accents significant while normalizing Unicode and typographic apostrophes.
  if (language === 'fr') return { graphemes, units };
  const expanded: Unit[] = [];
  for (let start = 0; start < units.length;) {
    if (!/^[a-z']$/u.test(units[start]!.value)) { expanded.push(units[start++]!); continue; }
    let end = start + 1;
    while (end < units.length && /^[a-z']$/u.test(units[end]!.value)) end++;
    const token = units.slice(start, end);
    const expansion = contractions[token.map(unit => unit.value).join('')];
    if (expansion) {
      const indices = token.flatMap(unit => unit.indices);
      expanded.push(...[...expansion].map(value => ({ value, indices })));
    } else expanded.push(...token);
    start = end;
  }
  return { graphemes, units: expanded };
}

/** Generate ambiguous contractions only from explicit, authored auxiliaries. */
function targetVariants(text: string, language: LearningLanguage): string[][] {
  const normalized = normalize(text, language).units.map(unit => unit.value).join('');
  const variants = new Set([normalized]);
  const pending = language === 'fr' ? [] : [normalized];
  while (pending.length && variants.size < 32) {
    const current = pending.shift()!;
    for (const match of current.matchAll(/\b(i|you|he|she|it|we|they) (is|has|had|would)\b/gu)) {
      const suffix = match[2] === 'is' || match[2] === 'has' ? "'s" : "'d";
      const variant = current.slice(0, match.index) + match[1] + suffix + current.slice(match.index + match[0].length);
      if (!variants.has(variant)) { variants.add(variant); pending.push(variant); }
      if (variants.size === 32) break;
    }
  }
  return [...variants].map(value => [...segmenter.segment(value)].map(part => part.segment));
}

function plainSegments(text: string): WrittenComparisonSegment[] {
  return text ? [{ text, different: false, gap: false }] : [];
}

/** Compare with authored examples; a different wording is not a linguistic rejection. */
export function compareWrittenTranslation(text: string, alternatives: SentenceEntry['alternatives'], language: LearningLanguage = alternatives.some(item => item.tense.startsWith('fr-')) ? 'fr' : 'en'): WrittenComparisonResult {
  const result = { submittedText: text, segments: plainSegments(text) };
  if (text.length > MAX_WRITTEN_TRANSLATION_LENGTH) return { ...result, status: 'too-long' };
  const input = normalize(text, language);
  if (!input.units.length) return { ...result, status: 'empty' };
  const values = input.units.map(unit => unit.value);
  let closest: { alternative: Alternative; alignment: ReturnType<typeof alignGraphemes> } | undefined;
  for (const alternative of alternatives) {
    for (const target of targetVariants(alternative.text, language)) {
      const alignment = alignGraphemes(values, target);
      if (alignment.distance === 0) return { ...result, status: 'matched', matchedAlternative: alternative };
      if (!closest || alignment.distance < closest.alignment.distance) closest = { alternative, alignment };
    }
  }
  if (!closest) return { ...result, status: 'different' };

  const different = new Set(closest.alignment.incorrectGraphemeIndices.flatMap(index => input.units[index]!.indices));
  const gaps = new Set(closest.alignment.missingGraphemeIndices.map(index =>
    input.units[index]?.indices[0] ?? ((input.units.at(-1)?.indices.at(-1) ?? -1) + 1)));
  const segments: WrittenComparisonSegment[] = [];
  input.graphemes.forEach((part, index) => {
    if (gaps.has(index)) segments.push({ text: '', different: true, gap: true });
    segments.push({ text: part, different: different.has(index), gap: false });
  });
  if (gaps.has(input.graphemes.length)) segments.push({ text: '', different: true, gap: true });
  return { submittedText: text, status: 'different', segments, closestAlternative: closest.alternative };
}
