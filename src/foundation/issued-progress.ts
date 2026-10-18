import type { ExerciseIdentity, PracticeEvent, ProgressBatchResult } from '../contracts';

/** Wrap the durable queue's sender, not its journal: original event IDs and drafts remain local.
 * The same local exercise deterministically reuses its server issuance key after reload. */
export function createIssuedProgressSender(ports: {
  issue(input: { sessionId: string; operationId: string }): Promise<ExerciseIdentity>;
  send(sessionId: string, events: readonly PracticeEvent[]): Promise<ProgressBatchResult>;
}) {
  return async (events: readonly PracticeEvent[]): Promise<ProgressBatchResult> => {
    const sessionId = events[0]?.ref.sessionId;
    if (!sessionId || events.some(event => event.ref.sessionId !== sessionId)) throw new Error('Progress session mismatch');
    const issued = new Map<string, Promise<ExerciseIdentity>>();
    const mapped: PracticeEvent[] = [];
    for (const event of events) {
      const local = JSON.stringify([sessionId, event.ref.exerciseId, event.ref.generation]);
      let promise = issued.get(local);
      if (!promise) {
        promise = (async () => {
          const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(local));
          const operationId = `instance:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}`;
          const ref = await ports.issue({ sessionId, operationId });
          if (ref.sessionId !== sessionId || !ref.exerciseId || !Number.isSafeInteger(ref.generation) || ref.generation < 0) throw new Error('Issued exercise mismatch');
          return ref;
        })();
        issued.set(local, promise);
      }
      mapped.push({ ...event, ref: { ...event.ref, ...await promise } });
    }
    return ports.send(sessionId, mapped);
  };
}
