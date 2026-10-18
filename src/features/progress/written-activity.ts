import type { AssessmentClock } from '../../assessment';

export const WRITTEN_IDLE_MS = 120_000;

/** Feature-owned observation proposal; NOT a trusted server record or ProgressSink event. */
export interface WrittenActivityInterval {
  readonly schemaVersion: 1;
  readonly kind: 'written-activity-interval';
  readonly trust: 'client-reported';
  readonly sessionId: string;
  readonly windowId: string;
  readonly intervalId: string;
  readonly sequence: number;
  readonly startedAt: number;
  readonly endedAt: number;
}

/** Starts on input/tap, never on mount, focus, visibility restoration or tutor speech. */
export function createWrittenActivity(options: {
  sessionId: string;
  windowId: string;
  clock: AssessmentClock;
  createId?: () => string;
  onInterval: (interval: WrittenActivityInterval) => void;
}) {
  const { clock } = options;
  let visible = false;
  let disposed = false;
  let sequence = 0;
  let timer: unknown;
  let token = 0;
  let active: { intervalId: string; sequence: number; startedAt: number; lastInputAt: number } | null = null;
  let lastNow = -Infinity;
  function now() {
    const value = clock.now();
    if (!Number.isFinite(value) || value < 0 || value < lastNow) throw new RangeError('Activity clock must be finite, nonnegative and monotonic.');
    lastNow = value;
    return value;
  }
  function cancelTimer() { token++; if (timer !== undefined) clock.clearTimeout(timer); timer = undefined; }
  function finish(at: number) {
    cancelTimer();
    const interval = active; active = null;
    if (!interval) return;
    const endedAt = Math.min(at, interval.lastInputAt + WRITTEN_IDLE_MS);
    if (endedAt <= interval.startedAt) return;
    options.onInterval(Object.freeze({ schemaVersion: 1, kind: 'written-activity-interval', trust: 'client-reported',
      sessionId: options.sessionId, windowId: options.windowId, intervalId: interval.intervalId,
      sequence: interval.sequence, startedAt: interval.startedAt, endedAt }));
  }
  function schedule(at: number) {
    cancelTimer();
    const expected = token;
    const deadline = active!.lastInputAt + WRITTEN_IDLE_MS;
    timer = clock.setTimeout(() => {
      if (disposed || expected !== token || !active) return;
      const current = now();
      if (current < deadline) { schedule(current); return; }
      finish(deadline);
    }, Math.max(0, deadline - at));
  }
  return {
    setVisible(next: boolean) {
      if (disposed || visible === next) return;
      visible = next;
      if (!visible) finish(now());
    },
    interact() {
      if (disposed || !visible) return;
      const at = now();
      if (active && at >= active.lastInputAt + WRITTEN_IDLE_MS) finish(active.lastInputAt + WRITTEN_IDLE_MS);
      if (!active) active = { intervalId: (options.createId ? options.createId() : crypto.randomUUID()), sequence: ++sequence, startedAt: at, lastInputAt: at };
      else active.lastInputAt = at;
      schedule(at);
    },
    /** Root preparation must call this before its interval sink flush. No new time until input. */
    finish() { if (!disposed) finish(now()); },
    dispose() { if (disposed) return; finish(now()); disposed = true; cancelTimer(); },
  };
}

/** Epoch-aligned monotonic time: later wall-clock changes cannot stretch an interval. */
export const browserActivityClock: AssessmentClock = {
  now: () => performance.timeOrigin + performance.now(),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};
