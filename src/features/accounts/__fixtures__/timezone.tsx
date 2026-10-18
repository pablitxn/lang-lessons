import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CurrentUser, Role } from '../../../contracts';
import { StudentTimeZoneSettings } from '../StudentTimeZoneSettings';
import type { StudentTimeZoneApi, StudentTimeZoneRequest } from '../student-timezone';
const params = new URLSearchParams(location.search);
const scenario = params.get('scenario');
const role = (params.get('role') ?? 'student') as Role;
const calls = { read: 0, requests: [] as StudentTimeZoneRequest[] };
Object.assign(window, { p3TimezoneCalls: calls });
const api: StudentTimeZoneApi = {
  async read() {
    calls.read++;
    if (scenario === 'read-error' && calls.read === 1) throw new Error('private read detail');
    if (scenario === 'read-denied') return { status: 'denied' };
    return { status: 'ok', value: scenario === 'configured' || (scenario === 'conflict' && calls.read > 1) ? { timeZone: 'Europe/Paris', revision: 4, effectiveAt: '2026-10-18T11:00:00Z' } : null };
  },
  async set(input) {
    calls.requests.push(input);
    await new Promise(resolve => setTimeout(resolve, scenario === 'late' ? 700 : 100));
    if (scenario === 'unknown' && calls.requests.length === 1) throw new Error('private lost reply');
    if (scenario === 'conflict') return { status: 'conflict' };
    if (scenario === 'set-denied') return { status: 'denied' };
    if (scenario === 'invalid-server') return { status: 'invalid-input' };
    return { status: 'ok', value: { timeZone: input.timeZone, revision: input.expectedRevision + 1, effectiveAt: '2026-10-18T12:00:00Z' } };
  },
};
function Fixture() {
  const [user, setUser] = useState<CurrentUser>({ id: 'fixture-student', role, capabilities: { granted: scenario === 'no-grant' ? [] : ['timezone:own'] } });
  return <><p>Mock own-timezone API only</p><button onClick={() => setUser({ ...user, capabilities: { granted: [] } })}>Revoke timezone access</button>
    <StudentTimeZoneSettings user={user} capability="timezone:own" api={scenario === 'unbound' ? null : api} />
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
