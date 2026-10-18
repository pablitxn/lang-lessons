import type { WrittenActivityInterval } from './written-activity';

/** Shared wire schema/transport is integration-owned; this queue handles only P5 observations. */
export function createWrittenIntervalJournal() {
  const records = new Map<string, WrittenActivityInterval>();
  const pending = new Set<string>();
  let activeFlush: Promise<void> | undefined;
  const identity = (row: WrittenActivityInterval) => JSON.stringify([row.sessionId, row.windowId, row.intervalId]);
  function canonical(row: WrittenActivityInterval) {
    return JSON.stringify([row.schemaVersion, row.kind, row.trust, row.sessionId, row.windowId, row.intervalId,
      row.sequence, row.startedAt, row.endedAt]);
  }
  function valid(row: WrittenActivityInterval) {
    const fields = ['schemaVersion', 'kind', 'trust', 'sessionId', 'windowId', 'intervalId', 'sequence', 'startedAt', 'endedAt'];
    return Object.keys(row).length === fields.length && Object.keys(row).every(key => fields.includes(key))
      && row.schemaVersion === 1 && row.kind === 'written-activity-interval' && row.trust === 'client-reported'
      && [row.sessionId, row.windowId, row.intervalId].every(id => typeof id === 'string' && id.length > 0 && id.length <= 200)
      && Number.isSafeInteger(row.sequence) && row.sequence > 0
      && Number.isFinite(row.startedAt) && row.startedAt >= 0 && Number.isFinite(row.endedAt) && row.endedAt > row.startedAt;
  }
  return {
    append(row: WrittenActivityInterval): 'accepted' | 'duplicate' | 'conflict' | 'invalid' {
      if (!valid(row)) return 'invalid';
      const key = identity(row);
      const previous = records.get(key);
      if (previous) return canonical(previous) === canonical(row) ? 'duplicate' : 'conflict';
      if ([...records.values()].some(item => item.sessionId === row.sessionId && item.windowId === row.windowId && item.sequence === row.sequence)) return 'conflict';
      records.set(key, Object.freeze({ ...row })); pending.add(key); return 'accepted';
    },
    /** Explicit retry retains IDs and body after an ambiguous failure; never automatic. */
    flush(send: (row: WrittenActivityInterval) => Promise<'accepted' | 'duplicate'>): Promise<void> {
      if (activeFlush) return activeFlush;
      activeFlush = (async () => {
        for (const key of pending) {
          const receipt = await send(records.get(key)!);
          if (receipt !== 'accepted' && receipt !== 'duplicate') throw new Error('Interval was not acknowledged.');
          pending.delete(key);
        }
      })().finally(() => { activeFlush = undefined; });
      return activeFlush;
    },
    snapshot: () => [...records.values()],
    pendingCount: () => pending.size,
  };
}

export interface TimeRange { readonly startedAt: number; readonly endedAt: number }
/** Input must already be authorized and validated by the owner repository. Never accept client totals. */
export interface ConfirmedTutorInterval extends TimeRange { readonly callSegmentId: string; readonly connectionId: string }

function validateRange(range: TimeRange) {
  if (!Number.isFinite(range.startedAt) || !Number.isFinite(range.endedAt) || range.startedAt < 0 || range.endedAt <= range.startedAt) {
    throw new RangeError('Expected a finite, positive half-open interval.');
  }
}
export function unionDuration(ranges: readonly TimeRange[], window: TimeRange): number {
  validateRange(window);
  const clipped = ranges.map(range => {
    validateRange(range);
    return { startedAt: Math.max(range.startedAt, window.startedAt), endedAt: Math.min(range.endedAt, window.endedAt) };
  }).filter(range => range.endedAt > range.startedAt).sort((a, b) => a.startedAt - b.startedAt);
  let total = 0; let end = window.startedAt;
  for (const range of clipped) {
    total += Math.max(0, range.endedAt - Math.max(end, range.startedAt));
    end = Math.max(end, range.endedAt);
  }
  return total;
}

/** Caller supplies resolved day boundaries. No timezone or 24-hour-day policy is selected here. */
export function summarizeActivity(written: readonly TimeRange[], tutor: readonly ConfirmedTutorInterval[], day: TimeRange) {
  const segments = new Map<string, ConfirmedTutorInterval[]>();
  for (const interval of tutor) {
    const rows = segments.get(interval.callSegmentId) ?? [];
    rows.push(interval); segments.set(interval.callSegmentId, rows);
  }
  return {
    writtenMs: unionDuration(written, day),
    tutorMs: unionDuration(tutor, day),
    totalMs: unionDuration([...written, ...tutor], day),
    tutorSessions: [...segments].map(([callSegmentId, intervals]) => ({ callSegmentId, connectedMs: unionDuration(intervals, day) })),
  };
}
