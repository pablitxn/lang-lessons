import { tensesForLanguage, type LearningLanguage, type Tense } from './curriculum';

export interface TranslationIssue { text: string; hint: string }
export interface WrittenTranslationReview {
  status: 'accepted' | 'needs-revision' | 'uncertain';
  tense: Tense | null;
  grammar: string;
  hint: string;
  issues: TranslationIssue[];
}

const plain = (value: unknown, maximum: number): value is string => typeof value === 'string'
  && value.length <= maximum && !/[\u0000-\u001f\u007f<>]/u.test(value);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** A model may identify actual issues, never manufacture a reference-word diff. */
export function parseWrittenTranslationReview(value: unknown, draft: string, language: LearningLanguage): WrittenTranslationReview | null {
  if (!object(value) || Object.keys(value).length !== 5 || typeof value.status !== 'string' || !['accepted', 'needs-revision', 'uncertain'].includes(value.status)
    || !plain(value.grammar, 360) || !plain(value.hint, 180) || !Array.isArray(value.issues) || value.issues.length > 3
    || value.tense !== null && !tensesForLanguage(language).includes(value.tense as never)) return null;
  const ranges: { start: number; end: number }[] = [];
  const issues: TranslationIssue[] = [];
  const boundaries = new Set([0, draft.length, ...Array.from(new Intl.Segmenter(language, { granularity: 'grapheme' }).segment(draft), part => part.index)]);
  for (const issue of value.issues) {
    if (!object(issue) || Object.keys(issue).length !== 2 || !plain(issue.text, 200) || !issue.text.trim()
      || !plain(issue.hint, 180) || !issue.hint.trim()) return null;
    const start = draft.indexOf(issue.text); const end = start + issue.text.length;
    if (start < 0 || draft.indexOf(issue.text, start + 1) !== -1 || !boundaries.has(start) || !boundaries.has(end)
      || /[\p{L}\p{M}\p{N}]/u.test(draft[start - 1] ?? '') && /[\p{L}\p{M}\p{N}]/u.test(issue.text[0]!)
      || /[\p{L}\p{M}\p{N}]/u.test(draft[end] ?? '') && /[\p{L}\p{M}\p{N}]/u.test(issue.text.at(-1)!)
      || ranges.some(range => start < range.end && end > range.start)) return null;
    ranges.push({ start, end }); issues.push({ text: issue.text, hint: issue.hint.trim() });
  }
  if (value.status === 'accepted' ? value.tense === null || !value.grammar.trim() || value.hint !== '' || issues.length !== 0
    : value.status === 'needs-revision' ? value.tense !== null || value.grammar !== '' || value.hint !== '' || issues.length === 0
      : value.tense !== null || value.grammar !== '' || issues.length !== 0 || !value.hint.trim()) return null;
  return { status: value.status as WrittenTranslationReview['status'], tense: value.tense as Tense | null,
    grammar: value.grammar.trim(), hint: value.hint.trim(), issues };
}
