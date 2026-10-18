import { useSyncExternalStore } from 'react';
import { createSentenceSession } from '../features/sentences/session';
import { createVerbSession } from '../features/verbs/session';
import { createRealtimeVoiceAdapter } from '../voice/realtime';
import { DEFAULT_SETTINGS, type LessonMode, type PracticeEvent } from '../contracts';
import { createIndexedDbWrittenSnapshotStore } from '../features/progress/written-snapshot-store';
import type { WrittenPracticeBinding, WrittenPracticePort, WrittenPracticeSnapshot } from '../features/progress/written-snapshot';

/** Local draft persistence is separate from server progress and never sends text. */
export async function createBrowserWrittenPractice(options: { userId: string; sessionId: string; mode: LessonMode; isCurrent(): boolean }) {
  const scope = { userId: options.userId, sessionId: options.sessionId };
  const store = createIndexedDbWrittenSnapshotStore();
  let initial: WrittenPracticeSnapshot | null;
  try {
    initial = await store.load(scope, options.mode);
    if (initial) {
      // Use the producer's own curriculum/progression validator before resume can succeed.
      // This detached session has no progress sink and never connects its voice adapter.
      const common = { voice: createRealtimeVoiceAdapter(), sessionId: scope.sessionId, writtenPracticeUserId: scope.userId, onComplete: () => {} };
      const validator = options.mode === 'sentence' ? createSentenceSession({ ...common, difficulty: DEFAULT_SETTINGS.difficulty })
        : createVerbSession({ ...common, mode: options.mode });
      try { if (!validator.restoreWrittenPractice(initial)) throw new Error('Saved written practice is incompatible.'); }
      finally { validator.dispose(); }
    }
  } catch (error) { await store.close(); throw error; }
  let active = true; let rejected = false; let port: WrittenPracticePort | null = null;
  let latest: WrittenPracticeSnapshot | null = initial; let saved = JSON.stringify(initial);
  let writes: Promise<void> = Promise.resolve(); let state: 'saved' | 'saving' | 'failed' | 'invalid' = 'saved';
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => { state = next; for (const listener of listeners) listener(); };
  function save(snapshot: WrittenPracticeSnapshot) {
    if (!active || rejected || !options.isCurrent()) return;
    if (snapshot.identity.sessionId !== scope.sessionId || snapshot.userId !== scope.userId || snapshot.kind !== options.mode) { rejected = true; publish('invalid'); return; }
    latest = structuredClone(snapshot);
    if (JSON.stringify(snapshot) === saved && state === 'saved') return;
    const captured = latest; publish('saving');
    const work = writes.catch(() => {}).then(async () => { await store.save(scope, captured); saved = JSON.stringify(captured); });
    writes = work;
    void work.then(() => { if (writes === work) publish('saved'); }, () => { if (writes === work) publish('failed'); });
  }
  const binding: WrittenPracticeBinding = {
    userId: scope.userId, ...(initial ? { initialSnapshot: initial } : {}),
    register(next) { port = next; const snapshot = next.snapshotWrittenPractice(); if (snapshot) save(snapshot); return () => { if (port === next) port = null; }; },
    onSnapshot: save, onRestoreRejected() { rejected = true; publish('invalid'); },
  };
  // Recovered written refs must stay unchanged. New oral submissions get a fresh
  // local progress identity; already-journaled rows bypass this mapper entirely.
  const oralIdentities = new Map<string, string>();
  function mapNewEvents(events: readonly PracticeEvent[]): readonly PracticeEvent[] {
    if (!initial) return events;
    return events.map(event => {
      if (event.ref.obligation.startsWith('spelling:') || event.ref.obligation.startsWith('written:')) return event;
      const key = JSON.stringify([event.ref.exerciseId, event.ref.generation]);
      let exerciseId = oralIdentities.get(key); if (!exerciseId) { exerciseId = crypto.randomUUID(); oralIdentities.set(key, exerciseId); }
      return { ...event, ref: { ...event.ref, exerciseId } };
    });
  }
  const status = { getSnapshot: () => state, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  return {
    binding, mapNewEvents, canWrite: () => !rejected,
    async flush() {
      if (rejected) throw new Error('Saved written practice could not be restored.');
      const current = port?.snapshotWrittenPractice() ?? latest;
      if (current) save(current);
      await writes;
    },
    status: <WrittenStorageStatus status={status} />,
    dispose() { active = false; port = null; void writes.catch(() => {}).then(() => store.close()); },
  };
}
function WrittenStorageStatus({ status }: { status: { getSnapshot(): string; subscribe(listener: () => void): () => void } }) {
  const state = useSyncExternalStore(status.subscribe, status.getSnapshot);
  return state === 'invalid' ? <p role="alert">Saved written practice could not be restored. Your saved draft has not been replaced.</p>
    : state === 'failed' ? <p role="alert">Your written draft could not be saved on this device. Keep this lesson open and retry saving before leaving.</p>
      : state === 'saving' ? <p role="status">Saving written draft on this device…</p> : null;
}
