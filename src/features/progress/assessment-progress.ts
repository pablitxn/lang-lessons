import type { EvidenceLedger, PracticeEvent, ProgressSink } from '../../contracts';

/** Observe only reduced evidence: provider payloads and practice text never leave here. */
export function createAssessmentProgress(sink: ProgressSink | undefined, onError: () => void) {
  let previous: EvidenceLedger = {};
  let exercise = '';
  const sent = new Set<string>();
  return (ledger: EvidenceLedger, exerciseId: string, emit = true) => {
    if (exercise !== exerciseId) { previous = {}; sent.clear(); exercise = exerciseId; }
    const events: PracticeEvent[] = [];
    for (const record of Object.values(ledger)) {
      const prior = previous[record.ref.obligation];
      const processed = record.status === 'accepted' || record.status === 'incorrect' || record.status === 'uncertain';
      const invalidated = record.status === 'not-attempted' && prior && prior.status !== 'not-attempted';
      if (!processed && !invalidated) continue;
      const key = JSON.stringify([record.ref, record.status]);
      if (sent.has(key)) continue;
      sent.add(key);
      const source = record.source?.kind ?? prior?.source?.kind;
      // An unprocessed attempt has no trustworthy source to report.
      if (!source) continue;
      const common = { schemaVersion: 1 as const, eventId: crypto.randomUUID(),
        ref: { ...record.ref }, source, trust: 'client-reported' as const };
      events.push(processed ? { ...common, kind: 'attempt-result', result: record.status as 'accepted' | 'incorrect' | 'uncertain' }
        : { ...common, kind: 'attempt-invalidated' });
    }
    previous = ledger;
    if (!emit || !sink || !events.length) return;
    try {
      void sink.submit(events).then(result => { if (result.status !== 'committed') onError(); }, onError);
    } catch { onError(); }
  };
}
