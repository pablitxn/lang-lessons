import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentProgress } from '../src/features/progress/assessment-progress';
import { createVerbSession } from '../src/features/verbs/session';
import { createRealtimeVoiceAdapter } from '../src/voice';
import type { EvidenceRecord, PracticeEvent, ProgressSink } from '../src/contracts';

function collector() {
  const events: PracticeEvent[] = [];
  const sink: ProgressSink = {
    async submit(batch) { events.push(...batch); return { status: 'committed', acknowledgments: batch.map(e => ({ eventId: e.eventId, status: 'accepted', committedRevision: events.length })), current: { sessionId: 's', journalRevision: events.length } }; },
    async flush() { return { sessionId: 's', journalRevision: events.length }; },
  };
  return { events, sink };
}
test('progress emits only processed outcomes and one invalidation, with no answer or raw feedback', () => {
  const { events, sink } = collector();
  const observe = createAssessmentProgress(sink, () => assert.fail('unexpected sink rejection'));
  const record: EvidenceRecord = { ref: { sessionId: 's', exerciseId: 'e', generation: 1, obligation: 'spelling:past', attemptId: 'a', revision: 1 }, status: 'processing' };
  observe({ 'spelling:past': record }, 'e'); assert.equal(events.length, 0);
  const accepted: EvidenceRecord = { ...record, status: 'accepted', source: { kind: 'typed', inputId: 'private-input' }, feedback: 'private-answer' };
  observe({ 'spelling:past': accepted }, 'e'); observe({ 'spelling:past': accepted }, 'e');
  const edit: EvidenceRecord = { ref: { ...record.ref, revision: 2, attemptId: 'edit' }, status: 'not-attempted' };
  observe({ 'spelling:past': edit }, 'e');
  observe({ 'spelling:past': { ...edit, ref: { ...edit.ref, revision: 3 } } }, 'e');
  assert.deepEqual(events.map(e => e.kind), ['attempt-result', 'attempt-invalidated']);
  assert.doesNotMatch(JSON.stringify(events), /private|feedback|inputId/);
  assert.ok(events.every(e => e.trust === 'client-reported' && e.source === 'typed'));
});
test('sink rejection is surfaced without changing local feedback or retrying', async () => {
  let errors = 0; let requests = 0;
  const observe = createAssessmentProgress({ submit: async () => { requests++; throw new Error('offline'); }, flush: async () => { throw new Error('offline'); } }, () => errors++);
  observe({ meaning: { ref: { sessionId: 's', exerciseId: 'e', generation: 1, obligation: 'meaning', attemptId: 'a', revision: 1 }, status: 'uncertain', source: { kind: 'audio', utteranceId: 'private', audioAvailable: false } } }, 'e');
  await Promise.resolve(); assert.equal(errors, 1); assert.equal(requests, 1);
});
test('offline spelling emits typed progress, preserves oral gates and invalidates edited accepted work', async () => {
  const { events, sink } = collector();
  const session = createVerbSession({ voice: createRealtimeVoiceAdapter(), mode: 'verb-image', sessionId: 's', random: () => 0, progressSink: sink, onComplete: () => assert.fail('written work cannot complete oral gates') });
  session.edit('past', 'was'); session.finalize('past', 'was');
  assert.equal(session.getSnapshot().assessment.evidence['spelling:past']?.status, 'accepted');
  assert.equal(session.getSnapshot().assessment.evidence.meaning, undefined);
  session.edit('past', 'waz'); session.finalize('past', 'waz');
  assert.deepEqual(events.map(e => e.kind === 'attempt-result' ? e.result : e.kind), ['accepted', 'attempt-invalidated', 'incorrect']);
  assert.ok(events.every(e => e.source === 'typed'));
  session.dispose();
});
test('root write freeze preserves typed work and resumes without replacing the exercise', () => {
  let writable = true;
  const { sink, events } = collector();
  const session = createVerbSession({ voice: createRealtimeVoiceAdapter(), mode: 'verb-image', sessionId: 's', random: () => 0, progressSink: sink, canWrite: () => writable, onComplete: () => {} });
  session.edit('past', 'was'); session.finalize('past', 'was');
  const identity = session.getSnapshot().assessment.exerciseId;
  writable = false; session.edit('past', 'waz'); session.finalize('past', 'was');
  assert.equal(session.skip(), false); assert.equal(events.length, 1);
  assert.equal(session.getSnapshot().drafts.past, 'was');
  writable = true; session.edit('past', 'were'); session.finalize('past', 'were');
  assert.equal(session.getSnapshot().assessment.exerciseId, identity);
  assert.equal(events.length, 3); session.dispose();
});
test('revising oral translation emits dependent invalidations with fresh controller refs and ignores stale results', async () => {
  const { createSentenceSession } = await import('../src/features/sentences/session');
  const { SentenceFixtureVoice } = await import('../src/features/sentences/__fixtures__/voice');
  const { sink, events } = collector(); const voice = new SentenceFixtureVoice();
  const session = createSentenceSession({ voice, sessionId: 's', difficulty: { grammar: 1, vocabulary: 1 }, random: () => 0, connectionState: 'ready', progressSink: sink, onComplete: () => {} });
  voice.transcript('Mock translation'); voice.assess();
  voice.transcript('Mock explanation'); const old = voice.inputs.at(-1)!; voice.assess();
  assert.equal(events.length, 4);
  session.reviseTranslation();
  assert.deepEqual(events.slice(4).map(e => [e.kind, e.ref.obligation]), [
    ['attempt-invalidated', 'tense'], ['attempt-invalidated', 'structure'], ['attempt-invalidated', 'meaning-fit'], ['attempt-invalidated', 'translation'],
  ]);
  voice.assess('accepted', old); assert.equal(events.length, 8);
  voice.transcript('New mock translation'); voice.assess();
  voice.transcript('New mock explanation'); voice.assess();
  for (const obligation of ['translation', 'tense', 'structure', 'meaning-fit']) {
    const revisions = events.filter(e => e.ref.obligation === obligation).map(e => e.ref.revision);
    assert.ok(revisions.every((value, index) => index === 0 || value > revisions[index - 1]!));
  }
  session.dispose();
});
