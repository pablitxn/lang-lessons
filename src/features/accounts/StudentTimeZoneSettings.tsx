import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { CurrentUser } from '../../contracts';
import { hasCapability } from './access';
import { ReadPanel } from './ReadPanel';
import { canonicalStudentTimeZone, type StudentTimeZone, type StudentTimeZoneApi, type StudentTimeZoneRequest } from './student-timezone';

/** Student-owned configuration only. Admin/professor capabilities do not imply edit access. */
export function StudentTimeZoneSettings({ user, capability = null, api = null }: {
  user: CurrentUser | null; capability?: string | null; api?: StudentTimeZoneApi | null;
}) {
  return <section className="p3-accounts" aria-label="Your daily timezone"><h2>Your daily timezone</h2>
    {user?.role !== 'student' || !hasCapability(user, capability) ? <p role="alert">Access denied.</p> : api === null ? <p role="status">Timezone configuration is unavailable. No default has been selected.</p> :
      <Settings key={JSON.stringify([user.id, user.capabilities, capability])} api={api} />}
  </section>;
}
function Settings({ api }: { api: StudentTimeZoneApi }) {
  const [reload, setReload] = useState(0);
  const load = useCallback((signal: AbortSignal) => api.read(signal), [api, reload]);
  return <ReadPanel load={load}>{current => <Editor key={current?.revision ?? 0} initial={current} api={api} refresh={() => setReload(value => value + 1)} />}</ReadPanel>;
}
function Editor({ initial, api, refresh }: { initial: StudentTimeZone | null; api: StudentTimeZoneApi; refresh: () => void }) {
  const [current, setCurrent] = useState(initial);
  const [selection, setSelection] = useState(initial?.timeZone ?? '');
  const [status, setStatus] = useState<'idle' | 'pending' | 'unknown' | 'conflict' | 'denied'>('idle');
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const request = useRef<StudentTimeZoneRequest | null>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const listId = useId();
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, [api]);
  useEffect(() => { if (message) feedback.current?.focus(); }, [message]);
  async function send(input: StudentTimeZoneRequest) {
    if (controller.current) return;
    const active = new AbortController(); controller.current = active;
    setStatus('pending'); setMessage('');
    try {
      const result = await api.set(input, active.signal);
      if (active.signal.aborted) return;
      if (result.status === 'ok') {
        setCurrent(result.value); setSelection(result.value.timeZone); setStatus('idle'); request.current = null;
        setMessage('Timezone saved. Earlier records keep their original attribution.');
      } else if (result.status === 'denied') { setStatus('denied'); request.current = null; }
      else if (result.status === 'conflict') { setStatus('conflict'); request.current = null; setMessage('Your setting changed elsewhere. Reload it before choosing again.'); }
      else { setStatus('idle'); request.current = null; setMessage('The server did not accept this timezone. Choose a valid IANA timezone.'); }
    } catch {
      if (!active.signal.aborted) { setStatus('unknown'); setMessage('The save outcome is unknown. Retry the same request to reconcile it; no new change will be created.'); }
    } finally { if (controller.current === active) controller.current = null; }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== 'idle' || controller.current) return;
    const timeZone = canonicalStudentTimeZone(selection);
    if (timeZone === null) { setMessage('Choose an IANA timezone such as America/Argentina/Buenos_Aires, or UTC. Abbreviations and numeric offsets are not accepted.'); return; }
    const input = { operationId: crypto.randomUUID(), expectedRevision: current?.revision ?? 0, timeZone };
    request.current = input; void send(input);
  }
  if (status === 'denied') return <p role="alert">Access denied. Your permissions may have changed.</p>;
  return <>
    {current ? <dl><dt>Configured timezone</dt><dd>{current.timeZone}</dd><dt>Effective from</dt><dd>{current.effectiveAt}</dd></dl> : <p role="status">No timezone configured. Daily grouping is unavailable until you explicitly choose one. Session history remains available.</p>}
    <p>Changes apply from the server-recorded time onward. Earlier records retain their original timezone; a professor's viewing timezone does not change your day.</p>
    <form onSubmit={submit} aria-busy={status === 'pending'}>
      <label>Your IANA timezone<input value={selection} onChange={event => setSelection(event.target.value)} list={listId} autoComplete="off" required disabled={status !== 'idle'} /></label>
      <datalist id={listId}><option value="UTC" />{Intl.supportedValuesOf('timeZone').map(zone => <option key={zone} value={zone} />)}</datalist>
      <button type="submit" disabled={status !== 'idle'}>{status === 'pending' ? 'Saving timezone…' : 'Save timezone'}</button>
    </form>
    {message && <p ref={feedback} tabIndex={-1} role="status">{message}</p>}
    {status === 'unknown' && <button onClick={() => { if (request.current) void send(request.current); }}>Retry same timezone request</button>}
    {status === 'conflict' && <button onClick={refresh}>Reload timezone setting</button>}
  </>;
}
