import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CurrentUser, Role } from '../../../contracts';
import { AccountShell, type LoginApi } from '../AccountShell';
import { AdminUsers, type AdminUsersApi } from '../../administration';
import { ProfessorStudents, type ProfessorApi } from '../../professor';
const params = new URLSearchParams(location.search);
const scenario = params.get('scenario');
const role = (params.get('role') || 'professor') as Role;
const actor: CurrentUser = { id: 'fixture-actor', role, capabilities: { granted: ['fixture:list', 'fixture:progress'] } };
const calls = { list: 0, progress: 0, login: 0 };
Object.assign(window, { p3Calls: calls });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const professorApi: ProfessorApi = {
  async listAllStudents(cursor) {
    calls.list++;
    if (scenario === 'loading') await delay(600);
    if (scenario === 'error' && calls.list === 1) throw new Error('Private transport detail');
    if (scenario === 'denied') return { status: 'denied' };
    return { status: 'ok', value: { items: scenario === 'empty' ? [] : [{ id: cursor ? 'student-outside-subset' : 'student-first', role: 'student' }], nextCursor: cursor || scenario === 'empty' ? null : 'page-two' } };
  },
  async readProgress(studentId) {
    calls.progress++;
    if (scenario === 'late') await delay(studentId === 'student-first' ? 900 : 20);
    return { status: 'ok', value: { studentId, sessions: [{ sessionId: 'session-one', feedback: 'succeeded', comment: { sessionId: scenario === 'mismatch' ? 'wrong-session' : 'session-one', text: `Mock comment for ${studentId}: <script>unsafe</script>`, provenanceVersion: 'mock-only-v1' } }, { sessionId: 'session-two', feedback: 'insufficient-evidence', comment: null }] } };
  },
};
const adminApi: AdminUsersApi = { listUsers: (cursor, signal) => professorApi.listAllStudents(cursor, signal) };
const loginApi: LoginApi = { async login() { calls.login++; await delay(100); return scenario === 'login-error' ? null : actor; } };
function Fixture() {
  const [user, setUser] = useState<CurrentUser | null>(scenario?.startsWith('login') ? null : actor);
  return <><p>Mock fixture only — no live accounts or provider.</p><button onClick={() => setUser(user ? { ...user, capabilities: { granted: [] } } : null)}>Revoke grants</button>
    <AccountShell state={user ? { status: 'authenticated', user } : { status: 'anonymous' }} loginApi={loginApi} onAuthenticated={setUser}>
      {params.get('view') === 'admin' ? <AdminUsers user={user} capability="fixture:list" api={adminApi} /> : <ProfessorStudents user={user} listCapability={scenario === 'unbound' ? null : 'fixture:list'} progressCapability="fixture:progress" api={professorApi} />}
    </AccountShell></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
