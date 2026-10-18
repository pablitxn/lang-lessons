import test from 'node:test';
import assert from 'node:assert/strict';
import type { ActivityInterval } from '../src/contracts';
import { createWrittenActivityTracker, projectActivityIntervals } from '../src/foundation/activity-intervals';
import { FakeClock } from './helpers/assessment-fixtures';

test('written activity pauses after two idle minutes and resumes only with input/tap', () => {
  const clock = new FakeClock(); const intervals: ActivityInterval[] = []; let sequence = 0;
  const tracker = createWrittenActivityTracker({ sessionId: 's', clock, epochAtZeroMs: 1000, intervalId: () => `w${++sequence}`, emit: interval => intervals.push(interval) });
  tracker.setVisible(true); tracker.activity(); clock.advance(150000);
  assert.deepEqual(intervals.map(x => [x.startedAtMs, x.endedAtMs]), [[1000, 121000]]);
  tracker.activity(); clock.advance(10000); tracker.dispose(); tracker.dispose();
  assert.deepEqual(intervals.map(x => [x.startedAtMs, x.endedAtMs]), [[1000, 121000], [151000, 161000]]);
  assert.equal(new Set(intervals.map(x => x.intervalId)).size, 2);
});
test('hidden tab excludes time and delayed timers do not count idle gaps', () => {
  const clock = new FakeClock(); const intervals: ActivityInterval[] = [];
  const tracker = createWrittenActivityTracker({ sessionId: 's', clock, epochAtZeroMs: 0, intervalId: () => String(clock.time), emit: interval => intervals.push(interval) });
  tracker.setVisible(true); tracker.activity(); clock.advance(10000); tracker.setVisible(false);
  clock.advance(200000); tracker.activity(); tracker.setVisible(true); clock.advance(10000);
  assert.equal(intervals.length, 1); assert.equal(intervals[0]!.endedAtMs, 10000);
  tracker.activity(); clock.time += 200000; tracker.activity(); // Delayed timer, same as a throttled browser.
  clock.advance(1000); tracker.dispose();
  assert.equal(intervals[1]!.endedAtMs - intervals[1]!.startedAtMs, 120000);
  assert.equal(intervals[2]!.endedAtMs - intervals[2]!.startedAtMs, 1000);
});
test('daily time is the overlap union across visits and connected segments; reconnect gaps and replay do not count twice', () => {
  const written: ActivityInterval = { intervalId: 'w', sessionId: 'first', kind: 'written', trust: 'client-reported', startedAtMs: 0, endedAtMs: 100 };
  const tutor = (id: string, from: number, to: number, epoch: number): ActivityInterval => ({ intervalId: id, sessionId: 'first', kind: 'tutor', trust: 'server-observed', startedAtMs: from, endedAtMs: to, segment: { sessionId: 'first', segmentId: id, connectionEpoch: epoch } });
  const intervals = [written, tutor('c1', 50, 150, 1), tutor('c2', 200, 250, 2), { ...written, intervalId: 'visit2', sessionId: 'second', startedAtMs: 225, endedAtMs: 275 }, written];
  assert.deepEqual(projectActivityIntervals(intervals, { startsAtMs: 0, endsAtMs: 300 }), { writtenMs: 150, tutorMs: 150, totalMs: 225, writtenTrust: 'client-reported', tutorTrust: 'server-observed' });
  assert.equal(projectActivityIntervals(intervals, { startsAtMs: 100, endsAtMs: 240 }).totalMs, 90);
  assert.throws(() => projectActivityIntervals([written, { ...written, endedAtMs: 120 }], { startsAtMs: 0, endsAtMs: 300 }), /Conflicting/);
  assert.throws(() => projectActivityIntervals([{ ...tutor('fake', 0, 10, 1), trust: 'client-reported' } as ActivityInterval], { startsAtMs: 0, endsAtMs: 300 }), /provenance/);
});
