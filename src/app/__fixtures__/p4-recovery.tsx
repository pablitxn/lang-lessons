import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SessionRecovery } from '../SessionRecovery';
import { createSessionRecovery, type RecoveryRecord } from '../session-recovery';
import { createSessionLifecycle } from '../session-lifecycle';
import { createSessionRuntime } from '../session-runtime';
import { createMockVoiceAdapter } from '../../voice/mock';
import type { SessionCommands } from '../../contracts';

function Fixture({ called }: { called: boolean }) {
  const [counts, setCounts] = useState({ close: 0, retry: 0, resume: 0 });
  const [fixture] = useState(() => {
    let current = true; let invalidate = () => {}; let sequence = 0;
    let record: RecoveryRecord = { accountId: 'fixture-account', sessionId: 'fixture-session',
      session: { sessionId: 'fixture-session', mode: 'verb-image', status: 'open', revision: 1 },
      hadConnectedCall: called, feedback: 'not-requested' };
    const sessions: SessionCommands = {
      async create() { throw new Error('Unexpected create'); }, async read() { return record.session; },
      async startCall() { throw new Error('Unexpected call'); }, async stopCall() { return record.session; },
      async confirmClose(request) {
        setCounts(value => ({ ...value, close: value.close + 1 }));
        record = { ...record, session: { ...record.session, status: 'closed', revision: 2 }, feedback: called ? 'failed' : 'not-requested' };
        return { ...request, status: 'closed', revision: 2, feedback: record.feedback };
      }, async readClose() { return null; },
    };
    const recovery = createSessionRecovery({
      identity: record, isCurrent: () => current,
      subscribeInvalidation(listener) { invalidate = listener; return () => {}; },
      async read() { return record; },
      async preparePractice(saved) {
        const lifecycle = createSessionLifecycle(createSessionRuntime(createMockVoiceAdapter(), saved.sessionId), {
          hadConnectedCall: saved.hadConnectedCall, sessions,
          progress: { async flush() { return { sessionId: saved.sessionId, journalRevision: 1 }; } },
          freezeWrites() {}, releasePreparation() {}, operationId: () => `close-${++sequence}`,
          isCurrent: () => current, navigate() {},
        });
        return { lifecycle, release() {} };
      },
      resume() { setCounts(value => ({ ...value, resume: value.resume + 1 })); },
      async retryFeedback() {
        setCounts(value => ({ ...value, retry: value.retry + 1 })); record = { ...record, feedback: 'pending' }; return record;
      }, operationId: () => `retry-${++sequence}`,
    });
    return { recovery, switchAccount() { current = false; invalidate(); } };
  });
  useEffect(() => { void fixture.recovery.load(); return () => fixture.recovery.dispose(); }, [fixture]);
  return <>
    <p>Mock recovery and storage ports. No real IndexedDB, account or provider.</p>
    <button type="button" onClick={fixture.switchAccount}>Switch account fixture</button>
    <output aria-label="Fixture counts">{JSON.stringify(counts)}</output>
    <SessionRecovery recovery={fixture.recovery} exitTarget="home" />
  </>;
}
function App() {
  const [called, setCalled] = useState(true);
  return <><button type="button" onClick={() => setCalled(false)}>Use no-call fixture</button><Fixture key={String(called)} called={called} /></>;
}
createRoot(document.getElementById('root')!).render(<App />);
