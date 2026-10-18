import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeClock } from './helpers/assessment-fixtures';
import { createWrittenActivity, WRITTEN_IDLE_MS, type WrittenActivityInterval } from '../src/features/progress/written-activity';
import { createWrittenIntervalJournal, summarizeActivity, unionDuration } from '../src/features/progress/activity-intervals';

function setup() {
  const clock = new FakeClock(); const intervals: WrittenActivityInterval[] = [];
  let next = 0;
  const tracker = createWrittenActivity({ sessionId: 'session', windowId: 'window', clock, createId: () => `interval-${++next}`, onInterval: row => intervals.push(row) });
  tracker.setVisible(true);
  return { tracker, clock, intervals };
}
test('written activity starts on interaction, expires exactly at two idle minutes and resumes with a new identity', () => {
  const { tracker, clock, intervals } = setup();
  clock.advance(500_000); assert.equal(intervals.length, 0);
  tracker.interact(); clock.advance(WRITTEN_IDLE_MS - 1); assert.equal(intervals.length, 0);
  clock.advance(1); assert.equal(intervals.length, 1);
  assert.equal(intervals[0]!.endedAt - intervals[0]!.startedAt, 120_000);
  clock.advance(400_000); tracker.interact(); clock.advance(1000); tracker.finish();
  assert.equal(intervals[1]!.endedAt - intervals[1]!.startedAt, 1000);
  assert.notEqual(intervals[0]!.intervalId, intervals[1]!.intervalId);
  assert.deepEqual(intervals.map(row => row.sequence), [1, 2]); tracker.dispose();
});
test('input renews idle boundary but late or obsolete timers cannot extend idle time', () => {
  const { tracker, clock, intervals } = setup();
  tracker.interact(); const oldTimer = clock.callbacks.at(-1)!;
  clock.advance(100_000); tracker.interact(); oldTimer(); assert.equal(intervals.length, 0);
  // Simulate a throttled event loop: interaction arrives before the overdue callback.
  clock.time = 400_000; tracker.interact();
  assert.equal(intervals[0]!.endedAt, 220_000);
  clock.time = 800_000; tracker.finish();
  assert.equal(intervals[1]!.endedAt, 520_000);
  tracker.dispose(); oldTimer(); assert.equal(intervals.length, 2);
});
test('hidden exercise stops immediately and restoration waits for input rather than counting background time', () => {
  const { tracker, clock, intervals } = setup();
  tracker.interact(); clock.advance(3000); tracker.setVisible(false);
  assert.equal(intervals[0]!.endedAt, 3000);
  tracker.interact(); clock.advance(500_000); tracker.setVisible(true); clock.advance(500_000);
  assert.equal(intervals.length, 1);
  tracker.interact(); clock.advance(7000); tracker.dispose();
  assert.equal(intervals[1]!.endedAt - intervals[1]!.startedAt, 7000);
  tracker.interact(); assert.equal(intervals.length, 2);
});
test('all-day union preserves written sessions and connected tutor segments, excludes reconnect gaps and avoids overlap inflation', () => {
  const written = [{ startedAt: 10, endedAt: 30 }, { startedAt: 100, endedAt: 160 }, { startedAt: 140, endedAt: 170 }];
  // Fixture from P4/server connection evidence: connected listening counts without UI input.
  const tutor = [{ callSegmentId: 'call-a', connectionId: 'connection-1', startedAt: 20, endedAt: 60 },
    { callSegmentId: 'call-a', connectionId: 'connection-2', startedAt: 80, endedAt: 110 },
    { callSegmentId: 'call-b', connectionId: 'connection-3', startedAt: 140, endedAt: 200 }];
  const result = summarizeActivity(written, tutor, { startedAt: 0, endedAt: 300 });
  assert.deepEqual(result, { writtenMs: 90, tutorMs: 130, totalMs: 170,
    tutorSessions: [{ callSegmentId: 'call-a', connectedMs: 70 }, { callSegmentId: 'call-b', connectedMs: 60 }] });
  assert.deepEqual(summarizeActivity([...written, ...written], [...tutor, ...tutor], { startedAt: 0, endedAt: 300 }), result);
  assert.equal(summarizeActivity([], tutor, { startedAt: 60, endedAt: 80 }).totalMs, 0);
});
test('explicit day windows clip cross-midnight intervals without choosing a timezone or assuming a 24-hour day', () => {
  const rows = [{ startedAt: 90, endedAt: 130 }];
  assert.equal(unionDuration(rows, { startedAt: 0, endedAt: 100 }), 10);
  assert.equal(unionDuration(rows, { startedAt: 100, endedAt: 210 }), 30);
  assert.throws(() => unionDuration([{ startedAt: 20, endedAt: 10 }], { startedAt: 0, endedAt: 100 }), /interval/);
});
test('journal deduplicates replay, rejects changed identities/totals and retries lost replies with the identical body', async () => {
  const { tracker, clock, intervals } = setup(); tracker.interact(); clock.advance(1000); tracker.finish();
  const journal = createWrittenIntervalJournal(); const row = intervals[0]!;
  assert.equal(journal.append(row), 'accepted'); assert.equal(journal.append({ ...row }), 'duplicate');
  assert.equal(journal.append({ ...row, endedAt: row.endedAt + 1 }), 'conflict');
  assert.equal(journal.append({ ...row, intervalId: 'other' }), 'conflict');
  assert.equal(journal.append({ ...row, totalMs: 999999 } as WrittenActivityInterval), 'invalid');
  const sent: WrittenActivityInterval[] = [];
  await assert.rejects(journal.flush(async item => { sent.push(item); throw new Error('lost acknowledgment'); }));
  assert.equal(journal.pendingCount(), 1);
  await journal.flush(async item => { sent.push(item); return 'duplicate'; });
  assert.equal(sent[0], sent[1]); assert.equal(journal.pendingCount(), 0); assert.equal(journal.snapshot().length, 1);
  tracker.dispose();
});
test('concurrent flush shares delivery and includes observations queued before it settles', async () => {
  const { tracker, clock, intervals } = setup(); tracker.interact(); clock.advance(1000); tracker.finish();
  tracker.interact(); clock.advance(1000); tracker.finish();
  const journal = createWrittenIntervalJournal(); journal.append(intervals[0]!);
  let acknowledge!: (result: 'accepted') => void; let requests = 0;
  const send = async () => { requests++; if (requests === 1) return new Promise<'accepted'>(resolve => { acknowledge = resolve; }); return 'accepted' as const; };
  const first = journal.flush(send); const second = journal.flush(send); assert.equal(first, second);
  journal.append(intervals[1]!); acknowledge('accepted'); await first;
  assert.equal(requests, 2); assert.equal(journal.pendingCount(), 0); tracker.dispose();
});
