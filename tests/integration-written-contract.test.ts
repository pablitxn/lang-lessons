import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProgressBatch, emptyProgressJournal, parsePracticeEvent } from '../src/foundation/progress-batch';
import type { PracticeEvent } from '../src/contracts';

test('written sentence identities are separate from oral evidence and reject audio source claims', () => {
  const event: PracticeEvent = { schemaVersion: 1, eventId: 'written-one', kind: 'attempt-result',
    source: 'typed', trust: 'client-reported', result: 'accepted',
    ref: { sessionId: 's', exerciseId: 'e', generation: 1, obligation: 'written:translation', attemptId: 'a', revision: 1 } };
  assert.deepEqual(parsePracticeEvent(event), event);
  assert.equal(parsePracticeEvent({ ...event, source: 'audio' }), null);
  assert.equal(parsePracticeEvent({ ...event, source: 'mock' }), null);
  const first = applyProgressBatch(emptyProgressJournal('s'), [event]);
  assert.equal(first.result.status, 'committed');
  const oral = { ...event, eventId: 'oral-one', source: 'audio', ref: { ...event.ref, obligation: 'translation' } };
  const second = applyProgressBatch(first.state, [oral]);
  assert.equal(second.result.status, 'committed'); assert.equal(second.state.revision, 2);
  assert.equal(second.state.attempts.size, 2, 'A written result cannot overwrite the oral obligation');
});
