import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VERB_IDS, PRESENT_TENSES, TIMING, canAdvanceVerb, hasAllEvidence, hasValidEvidenceSource,
  isCurrentAttempt, requiredObligations, sameExercise,
  type AdvanceTicket, type AttemptRef, type EvidenceLedger, type EvidenceRecord,
  type EvidenceResult, type ExerciseIdentity, type InteractionState, type LessonMode,
  type Obligation,
} from '../src/contracts';

const identity: ExerciseIdentity = { sessionId: 'session-1', exerciseId: 'buy-1', generation: 1 };
function ref(obligation: Obligation): AttemptRef { return { ...identity, obligation, attemptId: `attempt-${obligation}`, revision: 1 }; }
function ledger(mode: LessonMode): Record<string, EvidenceRecord> {
  return Object.fromEntries(requiredObligations(mode).map(obligation => [obligation, {
    ref: ref(obligation), status: 'accepted',
    source: obligation.startsWith('spelling:') ? { kind: 'typed', inputId: obligation }
      : { kind: 'audio', utteranceId: 'utterance-1', audioAvailable: true },
  }]));
}
const quiet: InteractionState = {
  learnerSpeaking: false, assistantSpeaking: false, questionPending: false,
  processingCount: 0, inputFocused: false, compositionActive: false, questionDraftActive: false,
  presentationHolds: [], connection: 'ready', intent: 'practice', lastActivityAt: 100,
  activityRevision: 4,
};
const ticket: AdvanceTicket = { ...identity, activityRevision: 4, dueAt: 100 + TIMING.verbQuietPeriodMs };

test('the inventory stays inside the exact 25 approved verbs and four present tenses', () => {
  assert.deepEqual(VERB_IDS, ['be','beat','become','begin','bend','bet','bite','bleed','blow','break','bring','build','burn','burst','buy','catch','choose','come','cost','cut','deal','dig','do','draw','dream']);
  assert.equal(new Set(VERB_IDS).size, 25);
  assert.equal(new Set(PRESENT_TENSES).size, 4);
});

test('image and visible-base modes keep all oral gates but different spelling counts', () => {
  assert.equal(requiredObligations('verb-image').length, 10);
  assert.equal(requiredObligations('verb-visible').length, 9);
  assert.deepEqual(requiredObligations('verb-image').filter(key => key !== 'spelling:base'), requiredObligations('verb-visible'));
});

test('each missing or unaccepted obligation prevents completion independently', () => {
  for (const mode of ['verb-image', 'verb-visible', 'sentence'] as const) {
    const full = ledger(mode);
    assert.equal(hasAllEvidence(mode, identity, full), true);
    for (const key of requiredObligations(mode)) {
      const partial = { ...full };
      delete partial[key];
      assert.equal(hasAllEvidence(mode, identity, partial), false, `missing ${key}`);
      for (const status of ['not-attempted', 'processing', 'uncertain', 'incorrect'] as const) {
        partial[key] = { ...full[key]!, status };
        assert.equal(hasAllEvidence(mode, identity, partial), false, `${key} ${status}`);
      }
    }
  }
});

test('one oral utterance may cover independent obligations in any insertion order', () => {
  const full = ledger('verb-image');
  const reversed: EvidenceLedger = Object.fromEntries(Object.entries(full).reverse());
  assert.equal(hasAllEvidence('verb-image', identity, reversed), true);
  assert.equal(full.meaning?.source?.kind, 'audio');
  assert.deepEqual(full.meaning?.source, full['pronunciation:base']?.source);
});

test('identity rejects previous exercises, sessions, generations and superseded attempts', () => {
  const current = ref('spelling:past');
  assert.equal(isCurrentAttempt(current, { ...current }), true);
  for (const delta of [
    { sessionId: 'other' }, { exerciseId: 'other' }, { generation: 0 },
    { obligation: 'meaning' as const }, { attemptId: 'other' }, { revision: 0 },
  ]) assert.equal(isCurrentAttempt(current, { ...current, ...delta }), false);
  assert.equal(sameExercise(identity, { ...identity, generation: 2 }), false);
});

test('a changed spelling attempt does not invalidate independent oral attempt identity', () => {
  const oral = ref('meaning');
  const typed = ref('spelling:past');
  assert.equal(isCurrentAttempt({ ...typed, revision: 2 }, typed), false);
  assert.equal(isCurrentAttempt(oral, { ...oral }), true);
});

test('old generations, mismatched obligations and absent evidence sources cannot pass', () => {
  const full = ledger('verb-image');
  const accepted = full.meaning!;
  for (const changed of [
    { ...accepted, ref: { ...accepted.ref, generation: 0 } },
    { ...accepted, ref: ref('translation') },
    { ref: accepted.ref, status: 'accepted' as const },
  ]) assert.equal(hasAllEvidence('verb-image', identity, { ...full, meaning: changed }), false);
});

test('text and unavailable audio cannot certify oral work, while mocks require an explicit allowance', () => {
  const result: EvidenceResult = { ref: ref('pronunciation:past'), status: 'accepted', source: { kind: 'typed', inputId: 'text' }, feedback: '' };
  assert.equal(hasValidEvidenceSource(result, false), false);
  assert.equal(hasValidEvidenceSource({ ...result, source: { kind: 'audio', utteranceId: 'audio', audioAvailable: false } }, false), false);
  assert.equal(hasValidEvidenceSource({ ...result, source: { kind: 'mock', fixtureId: 'fixture' } }, false), false);
  assert.equal(hasValidEvidenceSource({ ...result, source: { kind: 'mock', fixtureId: 'fixture' } }, true), true);
  assert.equal(hasValidEvidenceSource({ ...result, ref: ref('spelling:past'), source: { kind: 'audio', utteranceId: 'audio', audioAvailable: true } }, false), false);
  const mockLedger = Object.fromEntries(Object.entries(ledger('verb-image')).map(([key, record]) => [key, { ...record, source: { kind: 'mock', fixtureId: key } }]));
  assert.equal(hasAllEvidence('verb-image', identity, mockLedger), false);
  assert.equal(hasAllEvidence('verb-image', identity, mockLedger, true), true);
});

test('completion waits through the full quiet period and rechecks timer identity', () => {
  const evidence = ledger('verb-image');
  assert.equal(canAdvanceVerb('verb-image', identity, evidence, quiet, ticket, ticket.dueAt - 1), false);
  assert.equal(canAdvanceVerb('verb-image', identity, evidence, quiet, ticket, ticket.dueAt), true);
  assert.equal(canAdvanceVerb('verb-image', identity, evidence, quiet, { ...ticket, generation: 0 }, ticket.dueAt), false);
  assert.equal(canAdvanceVerb('verb-image', identity, evidence, { ...quiet, activityRevision: 5 }, ticket, ticket.dueAt), false);
  assert.equal(canAdvanceVerb('verb-image', identity, evidence, { ...quiet, lastActivityAt: ticket.dueAt }, ticket, ticket.dueAt), false);
});

test('speech, questions, editing, helper holds, pending work and session intent all block advancement', () => {
  const evidence = ledger('verb-visible');
  const blockers: Partial<InteractionState>[] = [
    { learnerSpeaking: true }, { assistantSpeaking: true }, { questionPending: true },
    { inputFocused: true }, { processingCount: 1 }, { compositionActive: true },
    { questionDraftActive: true }, { presentationHolds: ['reference-table'] },
    { connection: 'offline' }, { connection: 'connecting' }, { connection: 'reconnecting' },
    { connection: 'error' }, { intent: 'pause' }, { intent: 'stop' }, { intent: 'change-mode' },
  ];
  for (const blocker of blockers) assert.equal(canAdvanceVerb('verb-visible', identity, evidence, { ...quiet, ...blocker }, ticket, ticket.dueAt), false, JSON.stringify(blocker));
});

test('sentence acceptance requires explanation as well as translation', () => {
  const full = ledger('sentence');
  assert.equal(hasAllEvidence('sentence', identity, { translation: full.translation! }), false);
  assert.equal(hasAllEvidence('sentence', identity, full), true);
});
