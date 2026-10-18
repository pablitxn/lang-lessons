import { useEffect, useMemo, useRef, useState } from 'react';
import { App } from './App';
import type { LessonRenderer } from './LessonSession';
import type { PersistedSessionServices } from './PersistedLesson';
import type { createApplicationClient } from '../platform/application-client';
import { createIndexedDbProgressStore } from '../features/progress/pending-progress-store';
import { createIndexedDbWrittenUsageStore } from '../features/progress/written-usage-store';
import { createSessionRuntime } from './session-runtime';
import { createRealtimeVoiceAdapter } from '../voice/realtime';
import { createSessionLifecycle } from './session-lifecycle';
import { createSessionRecovery, type RecoveryRecord } from './session-recovery';
import { createP2RecoveryAdapter } from './p2-recovery-adapter';
import { RecoveryCatalog, type RecoveryCatalogPorts } from './RecoveryCatalog';
import { modeHref } from './routes';

export function StudentApplication({ services, client, renderLesson }: {
  services: PersistedSessionServices; client: ReturnType<typeof createApplicationClient>; renderLesson: LessonRenderer;
}) {
  const current = useRef(true);
  const invalidations = useRef(new Set<() => void>());
  const [resumed, setResumed] = useState<RecoveryRecord | null>(null);
  useEffect(() => { current.current = true; return () => { current.current = false; for (const invalidate of invalidations.current) invalidate(); }; }, []);
  const ports = useMemo<RecoveryCatalogPorts>(() => ({
    list: client.recovery.list,
    async pending(signal) {
      const progress = createIndexedDbProgressStore(); const usage = createIndexedDbWrittenUsageStore();
      try {
        const [events, observations] = await Promise.all([progress.pendingSessions(services.actorId), usage.pendingSessions(services.actorId)]);
        signal.throwIfAborted(); return [...new Set([...events, ...observations].map(row => row.sessionId))];
      } finally { await Promise.all([progress.close(), usage.close()]); }
    },
    controller(sessionId) {
      const resumeAbort = new AbortController();
      const identity = { accountId: services.actorId, sessionId };
      const adapter = createP2RecoveryAdapter({ identity, isCurrent: () => current.current, client: client.recovery, readCallHistory: client.recovery.readCallHistory });
      return createSessionRecovery({ identity, isCurrent: () => current.current,
        subscribeInvalidation(listener) {
          const invalidate = () => { resumeAbort.abort(); listener(); };
          invalidations.current.add(invalidate);
          return () => { resumeAbort.abort(); invalidations.current.delete(invalidate); adapter.dispose(); };
        },
        read: adapter.read, retryFeedback: adapter.retryFeedback, operationId: () => crypto.randomUUID(),
        async preparePractice(record, signal) {
          const progress = await services.progress(sessionId);
          if (signal.aborted || !current.current) { progress.dispose?.(); throw new Error('Recovery account changed'); }
          const runtime = createSessionRuntime(createRealtimeVoiceAdapter(), sessionId);
          const lifecycle = createSessionLifecycle(runtime, { sessions: services.commands, progress: { ...progress.sink, async flush() {
              // Lifecycle invokes this only after any required exit confirmation.
              await client.recovery.reconcile(sessionId, 'finalize', signal);
              return progress.sink.flush();
            } },
            hadConnectedCall: record.hadConnectedCall, freezeWrites: progress.freezeWrites, releasePreparation: progress.releasePreparation,
            isCurrent: () => current.current && !signal.aborted, operationId: () => crypto.randomUUID(), navigate: () => {} });
          return { lifecycle, release() { progress.dispose?.(); runtime.stop(); } };
        },
        async resume(record) { await client.recovery.reconcile(sessionId, 'resume', resumeAbort.signal);
          if (!current.current || resumeAbort.signal.aborted) throw new Error('Recovery account changed');
          setResumed(record); window.location.hash = modeHref(record.session.mode); },
      });
    },
  }), [client, services]);
  return <App renderLesson={renderLesson} sessionServices={services} resumedSession={resumed} onHome={() => setResumed(null)}
    homeContent={<RecoveryCatalog ports={ports} />} />;
}
