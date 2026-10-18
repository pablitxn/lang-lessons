import { useEffect, useRef, useState } from 'react';
import type { SessionSnapshot } from '../contracts';
import type { SessionRecovery as RecoveryController } from './session-recovery';
import { SessionRecovery } from './SessionRecovery';

export interface RecoveryCatalogPorts {
  list(cursor: string | null, signal: AbortSignal): Promise<{ items: readonly SessionSnapshot[]; nextCursor: string | null }>;
  pending(signal: AbortSignal): Promise<readonly string[]>;
  controller(sessionId: string): RecoveryController;
}
/** Account-scoped candidates combine durable server sessions and this device's pending journals. */
export function RecoveryCatalog({ ports }: { ports: RecoveryCatalogPorts }) {
  const pagination = useRef<AbortController | null>(null);
  useEffect(() => () => { pagination.current?.abort(); }, [ports]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); pagination.current?.abort(); setBusy(true); setFailed(false); setLoaded(false); setSessions([]); setCursor(null);
    void Promise.allSettled([ports.list(null, abort.signal), ports.pending(abort.signal)]).then(([server, device]) => {
      if (abort.signal.aborted) return;
      const page = server.status === 'fulfilled' ? server.value : null;
      const local = device.status === 'fulfilled' ? device.value : [];
      setSessions([...new Set([...(page?.items.map(item => item.sessionId) ?? []), ...local])]);
      setCursor(page?.nextCursor ?? null); setLoaded(true);
      setFailed(server.status === 'rejected' || device.status === 'rejected');
    })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [ports, attempt]);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true); setFailed(false);
    try {
      const abort = new AbortController(); pagination.current = abort;
      const page = await ports.list(cursor, abort.signal);
      if (abort.signal.aborted) return;
      if (page.nextCursor === cursor) throw new Error('Repeated recovery cursor');
      setSessions(previous => [...new Set([...previous, ...page.items.map(item => item.sessionId)])]); setCursor(page.nextCursor);
    } catch { if (!pagination.current?.signal.aborted) setFailed(true); } finally { if (!pagination.current?.signal.aborted) setBusy(false); }
  }
  return <section aria-label="Saved practice"><h2>Saved practice</h2>
    {busy && <p role="status">Checking saved practice…</p>}
    {failed && <p role="alert">Saved practice could not be loaded. Pending work on this device has not been discarded.</p>}
    {loaded && !failed && sessions.length === 0 && <p>No unfinished sessions or pending device results found.</p>}
    {sessions.map(sessionId => <RecoveryEntry key={sessionId} sessionId={sessionId} ports={ports} />)}
    {cursor && <button disabled={busy} onClick={() => { void more(); }}>More saved sessions</button>}
    <button disabled={busy} onClick={() => setAttempt(value => value + 1)}>Refresh saved practice</button>
  </section>;
}
function RecoveryEntry({ sessionId, ports }: { sessionId: string; ports: RecoveryCatalogPorts }) {
  const [recovery, setRecovery] = useState<RecoveryController | null>(null);
  useEffect(() => {
    const controller = ports.controller(sessionId); setRecovery(controller); void controller.load();
    return () => controller.dispose();
  }, [ports, sessionId]);
  return recovery ? <SessionRecovery recovery={recovery} exitTarget="#/" /> : null;
}
