import type { AttemptRef, EvidenceResult, ExerciseContext, VerbForm } from '../contracts';

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const graphemes = (text: string) => [...segmenter.segment(text.normalize('NFC'))].map(part => part.segment);

function alignment(input: string[], target: string[]) {
  const distances = Array.from({ length: input.length + 1 }, () => Array<number>(target.length + 1).fill(0));
  for (let i = 0; i <= input.length; i++) distances[i]![0] = i;
  for (let j = 0; j <= target.length; j++) distances[0]![j] = j;
  for (let i = 1; i <= input.length; i++) for (let j = 1; j <= target.length; j++) {
    distances[i]![j] = Math.min(distances[i - 1]![j]! + 1, distances[i]![j - 1]! + 1,
      distances[i - 1]![j - 1]! + (input[i - 1]!.toLowerCase() === target[j - 1] ? 0 : 1));
  }
  let i = input.length; let j = target.length;
  const incorrect: number[] = []; const missing: number[] = [];
  while (i || j) {
    if (i && j && input[i - 1]!.toLowerCase() === target[j - 1]) { i--; j--; }
    else if (i && j && distances[i]![j] === distances[i - 1]![j - 1]! + 1) { incorrect.push(--i); j--; }
    else if (i && distances[i]![j] === distances[i - 1]![j]! + 1) incorrect.push(--i);
    else { missing.push(i); j--; }
  }
  return { distance: distances[input.length]![target.length]!, incorrectGraphemeIndices: incorrect.reverse(),
    missingGraphemeIndices: [...new Set(missing.reverse())] };
}
/** Local spelling only. Never infer pronunciation, meaning or grammatical use here. */
export function assessSpelling(context: ExerciseContext, ref: AttemptRef, text: string, inputId: string): EvidenceResult {
  const base = { ref, source: { kind: 'typed' as const, inputId } };
  if (context.mode === 'sentence' || !ref.obligation.startsWith('spelling:') || !text.trim() || text.length > 256) {
    return { ...base, status: 'uncertain', feedback: 'Enter a short spelling attempt before checking this field.' };
  }
  const form = ref.obligation.slice('spelling:'.length) as VerbForm;
  const variants = context.verb.forms[form]?.accepted;
  if (!variants?.length) return { ...base, status: 'uncertain', feedback: 'Spelling guidance is unavailable.' };
  const submittedText = text.normalize('NFC');
  if (variants.some(value => value.toLowerCase() === submittedText.trim().toLowerCase())) {
    return { ...base, status: 'accepted', feedback: 'Correct form.',
      spelling: { submittedText, incorrectGraphemeIndices: [], missingGraphemeIndices: [] } };
  }
  const best = variants.map(value => alignment(graphemes(submittedText), graphemes(value.toLowerCase())))
    .sort((a, b) => a.distance - b.distance)[0]!;
  return { ...base, status: 'incorrect', feedback: 'Check the highlighted letters and missing-letter markers.',
    spelling: { submittedText, incorrectGraphemeIndices: best.incorrectGraphemeIndices, missingGraphemeIndices: best.missingGraphemeIndices } };
}
