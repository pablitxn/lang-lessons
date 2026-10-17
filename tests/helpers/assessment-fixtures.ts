import type { AssessmentClock } from '../../src/assessment';
import type { AssessmentBatch, AttemptRef, EvidenceResult, ExerciseContext } from '../../src/contracts';

export class FakeClock implements AssessmentClock {
  time = 0;
  next = 0;
  tasks = new Map<number, { at: number; callback: () => void }>();
  callbacks: (() => void)[] = [];
  now = () => this.time;
  setTimeout(callback: () => void, delayMs: number) {
    const id = ++this.next;
    this.tasks.set(id, { at: this.time + delayMs, callback }); this.callbacks.push(callback); return id;
  }
  clearTimeout(handle: unknown) { this.tasks.delete(handle as number); }
  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.tasks.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.tasks.delete(next[0]); this.time = next[1].at; next[1].callback();
    }
    this.time = end;
  }
}
const forms = {
  base: { accepted: ['buy'], ipa: '/baɪ/', spanishSoundGuide: 'Guide fixture' },
  past: { accepted: ['bought'], ipa: '/bɔːt/', spanishSoundGuide: 'Guide fixture' },
  participle: { accepted: ['bought'], ipa: '/bɔːt/', spanishSoundGuide: 'Guide fixture' },
};
export function verbContext(): ExerciseContext {
  return { sessionId: 's1', exerciseId: 'e1', generation: 1, mode: 'verb-image',
    verb: { id: 'buy', forms, spanishMeanings: ['comprar'], image: { src: '', alt: 'Fixture', attribution: 'Fixture' },
      examples: { base: ['He buys bread.'], past: ['I bought bread.'], participle: ['I have bought bread.'] }, notes: [] } };
}
export function sentenceContext(): ExerciseContext {
  return { sessionId: 's1', exerciseId: 'sentence1', generation: 1, mode: 'sentence', stage: 'translation',
    sentence: { id: 'since-2020', spanish: 'Vivimos aquí desde 2020.', difficulty: { grammar: 1, vocabulary: 1 },
      alternatives: [{ text: 'We have lived here since 2020.', tense: 'present-perfect', explanation: 'Still living here.' }],
      hintSeeds: ['Consider the start and now.'], explanationRubric: { structure: 'Explain construction.', meaning: 'State continuity.', usage: 'Explain context.' } } };
}
let batchSequence = 0;
export function result(ref: AttemptRef, status: EvidenceResult['status'] = 'accepted'): EvidenceResult {
  return { ref, status, source: { kind: 'mock', fixtureId: 'test-only' }, feedback: 'Fixture assessment.' };
}
export function batch(refs: readonly AttemptRef[], status: EvidenceResult['status'] = 'accepted'): AssessmentBatch {
  const ref = refs[0];
  if (!ref) throw new Error('A fixture batch needs an attempt.');
  return { sessionId: ref.sessionId, exerciseId: ref.exerciseId, generation: ref.generation,
    eventId: `batch-${++batchSequence}`, results: refs.map(ref => result(ref, status)) };
}
