import { TENSES } from '../../contracts';
import type { ExerciseIdentity, PracticeEvent, ProgressSink, SentenceEntry, Tense, WrittenPracticeRef } from '../../contracts';
import { parsePracticeEvent } from '../../foundation/progress-batch';
import { compareWrittenTranslation, MAX_WRITTEN_TRANSLATION_LENGTH } from './written-comparison';
import { snapshotIdentity, snapshotObject, type SentenceWrittenSnapshot } from '../progress/written-snapshot';

export function createSentenceWrittenPractice(options: { identity: ExerciseIdentity; sentence: SentenceEntry; userId?: string; sink?: ProgressSink; onError?: () => void }) {
  let draft = ''; let finalized = false; let selectedTense: Tense | null = null;
  let events: PracticeEvent[] = [];
  const revisions = { 'written:translation': 0, 'written:tense': 0 };
  let result = compareWrittenTranslation('', options.sentence.alternatives);
  function emit(obligation: WrittenPracticeRef['obligation'], outcome: 'accepted' | 'incorrect' | 'uncertain' | null) {
    const ref: WrittenPracticeRef = { ...options.identity, obligation, attemptId: crypto.randomUUID(), revision: ++revisions[obligation] };
    const common = { schemaVersion: 1 as const, eventId: crypto.randomUUID(), ref, source: 'typed' as const, trust: 'client-reported' as const };
    const event: PracticeEvent = outcome === null ? { ...common, kind: 'attempt-invalidated' } : { ...common, kind: 'attempt-result', result: outcome };
    events.push(event);
    try { void options.sink?.submit([event]).then(receipt => { if (receipt.status !== 'committed') options.onError?.(); }, () => options.onError?.()); }
    catch { options.onError?.(); }
  }
  function invalidate() {
    if (finalized) emit('written:translation', null);
    if (selectedTense !== null) emit('written:tense', null);
    finalized = false; selectedTense = null;
  }
  return {
    getSnapshot: () => ({ draft, finalized, result: finalized ? result : undefined, selectedTense }),
    edit(value: string) {
      value = value.slice(0, MAX_WRITTEN_TRANSLATION_LENGTH);
      if (value === draft) return;
      invalidate(); draft = value;
    },
    invalidate,
    finalize() {
      if (finalized || !draft.trim()) return;
      result = compareWrittenTranslation(draft, options.sentence.alternatives); finalized = true;
      // An authored-reference mismatch cannot establish semantic incorrectness.
      emit('written:translation', result.status === 'matched' ? 'accepted' : 'uncertain');
    },
    selectTense(tense: Tense) {
      if (!TENSES.includes(tense) || !finalized || result.status !== 'matched' || !result.matchedAlternative || selectedTense === tense) return;
      if (selectedTense !== null) emit('written:tense', null);
      selectedTense = tense; emit('written:tense', tense === result.matchedAlternative.tense ? 'accepted' : 'incorrect');
    },
    snapshotWrittenPractice(): SentenceWrittenSnapshot | null {
      if (!options.userId) return null;
      return structuredClone({ schemaVersion: 1, kind: 'sentence', userId: options.userId, identity: options.identity,
        sentenceId: options.sentence.id, draft, finalized, selectedTense, events });
    },
    restoreWrittenPractice(value: unknown): boolean {
      if (!snapshotObject(value) || Object.keys(value).length !== 9 || value.schemaVersion !== 1 || value.kind !== 'sentence'
        || !options.userId || value.userId !== options.userId || !snapshotIdentity(value.identity, options.identity.sessionId)
        || value.identity.exerciseId !== options.identity.exerciseId || value.identity.generation !== options.identity.generation
        || value.sentenceId !== options.sentence.id || typeof value.draft !== 'string' || value.draft.length > MAX_WRITTEN_TRANSLATION_LENGTH
        || typeof value.finalized !== 'boolean' || !Array.isArray(value.events) || value.events.length > 10000) return false;
      const parsed: PracticeEvent[] = []; const nextRevisions = { 'written:translation': 0, 'written:tense': 0 };
      const ids = new Set<string>();
      for (const item of value.events) {
        const event = parsePracticeEvent(item);
        if (!event || event.source !== 'typed' || !['written:translation', 'written:tense'].includes(event.ref.obligation)
          || event.ref.sessionId !== value.identity.sessionId || event.ref.exerciseId !== value.identity.exerciseId || event.ref.generation !== value.identity.generation
          || ids.has(event.eventId)) return false;
        const obligation = event.ref.obligation as WrittenPracticeRef['obligation'];
        if (event.ref.revision <= nextRevisions[obligation]) return false;
        nextRevisions[obligation] = event.ref.revision; ids.add(event.eventId); parsed.push(event);
      }
      const comparison = compareWrittenTranslation(value.draft, options.sentence.alternatives);
      if (value.selectedTense !== null && !TENSES.includes(value.selectedTense as Tense)) return false;
      if (value.selectedTense !== null && (!value.finalized || comparison.status !== 'matched')) return false;
      const translation = [...parsed].reverse().find(event => event.ref.obligation === 'written:translation');
      const tense = [...parsed].reverse().find(event => event.ref.obligation === 'written:tense');
      if (value.finalized ? !value.draft.trim() || translation?.kind !== 'attempt-result'
        || translation.result !== (comparison.status === 'matched' ? 'accepted' : 'uncertain') : translation?.kind === 'attempt-result') return false;
      if (value.selectedTense !== null ? tense?.kind !== 'attempt-result'
        || tense.result !== (value.selectedTense === comparison.matchedAlternative?.tense ? 'accepted' : 'incorrect') : tense?.kind === 'attempt-result') return false;
      draft = value.draft; finalized = value.finalized; result = comparison; selectedTense = value.selectedTense as Tense | null;
      events = parsed; Object.assign(revisions, nextRevisions); return true;
    },
  };
}
