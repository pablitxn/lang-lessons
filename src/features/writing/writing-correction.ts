import type { LearningLanguage } from '../../contracts';

export type WritingCorrectionPart = { kind: 'unchanged'; text: string } | { kind: 'change'; removed: string; added: string };

/** Compare an explicit correction, preserving case, accents, punctuation and learner text. */
export function writingCorrection(draft: string, corrected: string, language: LearningLanguage): WritingCorrectionPart[] {
  const segmenter = new Intl.Segmenter(language, { granularity: 'word' });
  const original = [...segmenter.segment(draft)].map(part => part.segment);
  const revised = [...segmenter.segment(corrected)].map(part => part.segment);
  const width = revised.length + 1;
  const lengths = new Uint16Array((original.length + 1) * width);
  for (let i = original.length - 1; i >= 0; i--) {
    for (let j = revised.length - 1; j >= 0; j--) {
      lengths[i * width + j] = original[i] === revised[j]
        ? lengths[(i + 1) * width + j + 1]! + 1
        : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
    }
  }
  const result: WritingCorrectionPart[] = [];
  let i = 0; let j = 0;
  function change(removed: string, added: string) {
    const previous = result.at(-1);
    if (previous?.kind === 'change') { previous.removed += removed; previous.added += added; }
    else result.push({ kind: 'change', removed, added });
  }
  while (i < original.length || j < revised.length) {
    if (i < original.length && j < revised.length && original[i] === revised[j]) {
      const text = original[i++]!; j++;
      const previous = result.at(-1);
      if (previous?.kind === 'unchanged') previous.text += text;
      else result.push({ kind: 'unchanged', text });
    } else if (i < original.length && (j === revised.length || lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!)) {
      change(original[i++]!, '');
    } else change('', revised[j++]!);
  }
  return result;
}
