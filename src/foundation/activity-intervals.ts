import type { ActivityInterval, ActivityProjection } from '../contracts/activity';

export const WRITTEN_IDLE_MS = 120_000;
export interface ActivityClock {
  /** Monotonic milliseconds. An explicitly captured epoch maps to reported instants. */
  now(): number;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}
/** Root calls activity on exercise input/tap and setVisible on exercise/tab visibility.
 * This does not observe tutor connections, create trusted evidence, or choose a day timezone. */
export function createWrittenActivityTracker(options: {
  sessionId: string; clock: ActivityClock; epochAtZeroMs: number;
  intervalId(): string; emit(interval: ActivityInterval): void;
}) {
  const { clock } = options;
  let visible = false; let disposed = false; let lastInput = -Infinity;
  let opened: { id: string; start: number } | null = null; let timer: unknown;
  function close(at: number) {
    if (!opened) return;
    const interval = opened; opened = null;
    if (at <= interval.start) return;
    options.emit({ intervalId: interval.id, sessionId: options.sessionId, kind: 'written', trust: 'client-reported',
      startedAtMs: options.epochAtZeroMs + interval.start, endedAtMs: options.epochAtZeroMs + at });
  }
  function cancelTimer() { if (timer !== undefined) clock.clearTimeout(timer); timer = undefined; }
  function schedule() {
    cancelTimer(); if (!opened) return;
    timer = clock.setTimeout(() => { timer = undefined; close(lastInput + WRITTEN_IDLE_MS); }, Math.max(0, lastInput + WRITTEN_IDLE_MS - clock.now()));
  }
  function open(now: number) { if (!opened) opened = { id: options.intervalId(), start: now }; schedule(); }
  return {
    setVisible(next: boolean) {
      if (disposed || visible === next) return;
      visible = next; const now = clock.now();
      if (!visible) { cancelTimer(); close(Math.min(now, lastInput + WRITTEN_IDLE_MS)); }
      else if (now < lastInput + WRITTEN_IDLE_MS) open(now);
    },
    activity() {
      if (disposed || !visible) return;
      const now = clock.now();
      // A delayed browser timer cannot turn the idle gap into active time.
      if (now >= lastInput + WRITTEN_IDLE_MS) close(lastInput + WRITTEN_IDLE_MS);
      lastInput = now; open(now);
    },
    dispose() { if (disposed) return; disposed = true; cancelTimer(); close(Math.min(clock.now(), lastInput + WRITTEN_IDLE_MS)); },
  };
}
function union(intervals: readonly [number, number][]) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0; let start = 0; let end = 0; let first = true;
  for (const [from, to] of sorted) {
    if (first) { start = from; end = to; first = false; }
    else if (from <= end) end = Math.max(end, to);
    else { total += end - start; start = from; end = to; }
  }
  return total + (first ? 0 : end - start);
}
/** Only use after server acceptance/identity validation. Window comes from the selected day policy.
 * Replayed immutable IDs count once; changed replay is a conflict, never a replacement. */
export function projectActivityIntervals(intervals: readonly ActivityInterval[], window: { startsAtMs: number; endsAtMs: number }): ActivityProjection {
  if (!Number.isFinite(window.startsAtMs) || !Number.isFinite(window.endsAtMs) || window.endsAtMs <= window.startsAtMs) throw new Error('Invalid activity window');
  const seen = new Map<string, string>(); const written: [number, number][] = []; const tutor: [number, number][] = [];
  for (const interval of intervals) {
    if (!interval.intervalId || !interval.sessionId || !Number.isFinite(interval.startedAtMs) || !Number.isFinite(interval.endedAtMs)
      || interval.endedAtMs <= interval.startedAtMs) throw new Error('Invalid activity interval');
    if (interval.kind === 'written' ? interval.trust !== 'client-reported'
      : interval.kind !== 'tutor' || interval.trust !== 'server-observed' || interval.segment.sessionId !== interval.sessionId
        || !interval.segment.segmentId || !Number.isSafeInteger(interval.segment.connectionEpoch) || interval.segment.connectionEpoch < 1) throw new Error('Invalid activity provenance');
    const fingerprint = JSON.stringify([interval.sessionId, interval.kind, interval.trust, interval.startedAtMs, interval.endedAtMs,
      interval.kind === 'tutor' ? [interval.segment.segmentId, interval.segment.connectionEpoch] : null]);
    const prior = seen.get(interval.intervalId);
    if (prior) { if (prior !== fingerprint) throw new Error('Conflicting activity replay'); continue; }
    seen.set(interval.intervalId, fingerprint);
    const from = Math.max(interval.startedAtMs, window.startsAtMs); const to = Math.min(interval.endedAtMs, window.endsAtMs);
    if (to > from) (interval.kind === 'written' ? written : tutor).push([from, to]);
  }
  return { writtenMs: union(written), tutorMs: union(tutor), totalMs: union([...written, ...tutor]),
    writtenTrust: 'client-reported', tutorTrust: 'server-observed' };
}
