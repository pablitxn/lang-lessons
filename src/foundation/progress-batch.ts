import type { PracticeEvent, PracticeEventAck, ProgressBatchResult } from '../contracts/progress';

export const MAX_PRACTICE_BATCH = 100;
const obligations = new Set(['spelling:base', 'spelling:past', 'spelling:participle', 'meaning',
  'pronunciation:base', 'pronunciation:past', 'pronunciation:participle', 'sentence:base', 'sentence:past',
  'sentence:participle', 'translation', 'tense', 'structure', 'meaning-fit', 'written:translation', 'written:tense']);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f]/u.test(value);
const integer = (value: unknown, min: number) => Number.isSafeInteger(value) && (value as number) >= min;
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
export function parsePracticeEvent(value: unknown): PracticeEvent | null {
  if (!object(value) || !object(value.ref) || value.schemaVersion !== 1 || !id(value.eventId)
    || typeof value.source !== 'string' || !['typed', 'audio', 'mock'].includes(value.source) || value.trust !== 'client-reported') return null;
  const ref = value.ref;
  if (!keys(ref, ['sessionId', 'exerciseId', 'generation', 'obligation', 'attemptId', 'revision'])
    || !id(ref.sessionId) || !id(ref.exerciseId) || !id(ref.attemptId) || !integer(ref.generation, 0)
    || !integer(ref.revision, 1) || typeof ref.obligation !== 'string' || !obligations.has(ref.obligation)) return null;
  if (ref.obligation.startsWith('written:') && value.source !== 'typed') return null;
  const expected = ['schemaVersion', 'eventId', 'ref', 'source', 'trust', 'kind'];
  if (value.kind === 'attempt-result') {
    expected.push('result');
    if (typeof value.result !== 'string' || !['accepted', 'incorrect', 'uncertain'].includes(value.result)) return null;
  } else if (value.kind !== 'attempt-invalidated') return null;
  if (!keys(value, expected)) return null;
  // Reconstruct an owned value only after exact-key and enum validation; never retain caller objects.
  return JSON.parse(JSON.stringify(value)) as PracticeEvent;
}
function fingerprint(event: PracticeEvent) {
  const r = event.ref;
  return JSON.stringify([event.schemaVersion, event.kind, r.sessionId, r.exerciseId, r.generation,
    r.obligation, r.attemptId, r.revision, event.source, event.trust, event.kind === 'attempt-result' ? event.result : null]);
}
export interface ProgressJournal {
  readonly sessionId: string; readonly revision: number;
  readonly receipts: ReadonlyMap<string, { fingerprint: string; committedRevision: number }>;
  readonly attempts: ReadonlyMap<string, number>;
}
export function emptyProgressJournal(sessionId: string): ProgressJournal {
  return { sessionId, revision: 0, receipts: new Map(), attempts: new Map() };
}
/** Pure transaction specification/fixture. P2 must enforce ownership and atomicity in its database. */
export function applyProgressBatch(state: ProgressJournal, input: unknown): { state: ProgressJournal; result: ProgressBatchResult } {
  const reject = (reason: 'invalid-batch' | 'conflicting-replay' | 'stale-attempt') => ({ state,
    result: { status: 'rejected' as const, reason, current: { sessionId: state.sessionId, journalRevision: state.revision } } });
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_PRACTICE_BATCH) return reject('invalid-batch');
  const events = input.map(parsePracticeEvent);
  if (events.some(event => !event || event.ref.sessionId !== state.sessionId)) return reject('invalid-batch');
  const receipts = new Map(state.receipts); const attempts = new Map(state.attempts);
  const acknowledgments: PracticeEventAck[] = []; let revision = state.revision;
  for (const event of events as PracticeEvent[]) {
    const digest = fingerprint(event); const old = receipts.get(event.eventId);
    if (old) {
      if (old.fingerprint !== digest) return reject('conflicting-replay');
      acknowledgments.push({ eventId: event.eventId, status: 'duplicate', committedRevision: old.committedRevision });
      continue;
    }
    const key = JSON.stringify([event.ref.exerciseId, event.ref.generation, event.ref.obligation]);
    if ((attempts.get(key) ?? 0) >= event.ref.revision) return reject('stale-attempt');
    attempts.set(key, event.ref.revision); revision++;
    receipts.set(event.eventId, { fingerprint: digest, committedRevision: revision });
    acknowledgments.push({ eventId: event.eventId, status: 'accepted', committedRevision: revision });
  }
  return { state: { sessionId: state.sessionId, revision, receipts, attempts }, result: { status: 'committed',
    acknowledgments, current: { sessionId: state.sessionId, journalRevision: revision } } };
}
