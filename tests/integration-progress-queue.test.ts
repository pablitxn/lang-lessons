import test from 'node:test';
import assert from 'node:assert/strict';
import type { PracticeEvent, ProgressBatchResult } from '../src/contracts';
import { createProgressQueue } from '../src/foundation/progress-queue';
const event = (id: string): PracticeEvent => ({ schemaVersion: 1, eventId: id, kind: 'attempt-result', source: 'typed', trust: 'client-reported', result: 'accepted',
  ref: { sessionId: 's', exerciseId: 'e', generation: 1, obligation: 'written:translation', attemptId: id, revision: Number(id) } });
const ack = (id: string, revision: number): ProgressBatchResult => ({ status: 'committed', current: { sessionId: 's', journalRevision: revision }, acknowledgments: [{ eventId: id, status: 'accepted', committedRevision: revision }] });
test('root queue persists incrementally and flush waits for ordered acknowledgments while writes are frozen', async () => {
  let finish!: (result: ProgressBatchResult) => void; const sent: string[] = [];
  const queue = createProgressQueue('s', async events => { sent.push(events[0]!.eventId); return new Promise(resolve => { finish = resolve; }); });
  const first = queue.sink.submit([event('1')]); const second = queue.sink.submit([event('2')]);
  assert.equal(queue.inspect().pendingBatches, 2); await Promise.resolve(); assert.deepEqual(sent, ['1']);
  queue.freezeWrites(); await assert.rejects(queue.sink.submit([event('3')]), /frozen/);
  let flushed = false; const flush = queue.sink.flush().then(value => { flushed = true; return value; });
  finish(ack('1', 1)); await first; await Promise.resolve(); assert.deepEqual(sent, ['1', '2']); assert.equal(flushed, false);
  finish(ack('2', 2)); await second; assert.deepEqual(await flush, { sessionId: 's', journalRevision: 2 });
  assert.equal(queue.inspect().pendingBatches, 0);
});
test('root queue retains rejected and queued writes and never turns a failed flush into success', async () => {
  let calls = 0;
  const queue = createProgressQueue('s', async () => { calls++; throw new Error('Fixture persistence failure'); });
  const first = queue.sink.submit([event('1')]); const second = queue.sink.submit([event('2')]);
  await assert.rejects(first); await assert.rejects(second); await assert.rejects(queue.sink.flush());
  queue.releasePreparation(); assert.equal(queue.canWrite(), false); assert.equal(calls, 1); assert.equal(queue.inspect().pendingBatches, 2);
});
test('root queue rejects mismatched receipts without dropping data', async () => {
  const queue = createProgressQueue('s', async () => ack('other-event', 1));
  await assert.rejects(queue.sink.submit([event('1')]), /mismatch/);
  await assert.rejects(queue.sink.flush()); assert.equal(queue.inspect().pendingBatches, 1);
});
