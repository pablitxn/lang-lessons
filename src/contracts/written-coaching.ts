export const MAX_WRITTEN_COACHING_LENGTH = 1000;
export const MAX_WRITTEN_COACHING_FEEDBACK_LENGTH = 1200;

/** Optional written coaching only; never an oral verdict or progress event. */
export interface WrittenCoachingFeedback {
  status: 'correct' | 'needs-revision' | 'off-topic' | 'uncertain';
  correctedSentence: string | null;
  explanation: string;
}

export function parseWrittenCoachingFeedback(value: unknown): WrittenCoachingFeedback | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 3 || typeof item.status !== 'string' || !['correct', 'needs-revision', 'off-topic', 'uncertain'].includes(item.status)
    || typeof item.explanation !== 'string' || !item.explanation.trim() || item.explanation.length > MAX_WRITTEN_COACHING_FEEDBACK_LENGTH
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(item.explanation)
    || item.correctedSentence !== null && (typeof item.correctedSentence !== 'string' || !item.correctedSentence.trim()
      || item.correctedSentence.length > MAX_WRITTEN_COACHING_LENGTH || /[\u0000-\u001f\u007f]/u.test(item.correctedSentence))) return null;
  if (item.status === 'needs-revision' ? item.correctedSentence === null : item.correctedSentence !== null) return null;
  return { status: item.status as WrittenCoachingFeedback['status'], correctedSentence: item.correctedSentence as string | null, explanation: item.explanation.trim() };
}
