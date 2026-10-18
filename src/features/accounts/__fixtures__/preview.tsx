import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CurrentUser, Role } from '../../../contracts';
import { AccountShell, type LoginApi } from '../AccountShell';
import { AdminUsers, type AdminUsersApi, type ManagedUser, type UserManagementApi, type UserChange } from '../../administration';
import { ProfessorStudents, type ProfessorApi } from '../../professor';
const params = new URLSearchParams(location.search);
const scenario = params.get('scenario');
const role = (params.get('role') || 'professor') as Role;
const actor: CurrentUser = { id: 'fixture-actor', role, capabilities: { granted: ['fixture:list', 'fixture:progress', ...(scenario?.startsWith('manage') ? ['fixture:create', 'fixture:role', 'fixture:disable', 'fixture:enable'] : [])] } };
const calls = { list: 0, progress: 0, login: 0, mutation: 0, changes: [] as UserChange[] };
const managed: ManagedUser[] = [{ id: 'admin-only', role: 'administrator', disabled: false }, { id: 'student-managed', role: 'student', disabled: false }];
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
    if (scenario === 'daily' || scenario === 'daily-unselected') return { status: 'ok', value: { studentId, sessions: [], daily: {
      timeZone: 'Fixture timezone only', days: [{ dayId: 'fixture-day-one', label: 'Fixture day one',
        written: scenario === 'daily-unselected' ? null : { definitionVersion: 'mock-only-v1', performed: 12, solved: 9, mistakes: 3 },
        sessions: ['morning', 'evening'].map((visit, index) => ({ sessionId: visit, startedAt: `Fixture start ${index + 1}`, endedAt: `Fixture end ${index + 1}`, feedback: 'succeeded' as const, comment: { sessionId: visit, text: `Mock ${visit} comment`, provenanceVersion: 'mock-only-v1' } })) },
        { dayId: 'fixture-day-two', label: 'Fixture day two', written: { definitionVersion: 'mock-only-v1', performed: 2, solved: 0, mistakes: 0 }, sessions: [] }],
    } } };
    return { status: 'ok', value: { studentId, sessions: [{ sessionId: 'session-one', feedback: 'succeeded', comment: { sessionId: scenario === 'mismatch' ? 'wrong-session' : 'session-one', text: `Mock comment for ${studentId}: <script>unsafe</script>`, provenanceVersion: 'mock-only-v1' } }, { sessionId: 'session-two', feedback: 'insufficient-evidence', comment: null }] } };
  },
};
const adminApi: AdminUsersApi = { listUsers: async (cursor, signal) => scenario?.startsWith('manage') ? { status: 'ok', value: { items: [...managed], nextCursor: null } } : professorApi.listAllStudents(cursor, signal) };
const managementApi: UserManagementApi = { async apply(change) {
  calls.mutation++; calls.changes.push(change); await delay(150);
  if (scenario === 'manage-unknown') throw new Error('private backend error');
  if (scenario === 'manage-denied') return { status: 'denied' };
  if (scenario === 'manage-conflict') return { status: 'conflict' };
  if (scenario === 'manage-policy') return { status: 'policy-unresolved' };
  if (change.kind === 'create') { managed.push({ id: 'new-fixture-user', role: change.role, disabled: false }); return { status: 'applied' }; }
  const index = managed.findIndex(user => user.id === change.userId);
  const target = managed[index]!;
  if (target.role === 'administrator' && ((change.kind === 'change-role' && change.role !== 'administrator') || (change.kind === 'set-disabled' && change.disabled))) return { status: 'last-administrator' };
  managed[index] = change.kind === 'change-role' ? { ...target, role: change.role } : { ...target, disabled: change.disabled };
  return { status: 'applied' };
} };
const managementCapabilities = { create: 'fixture:create', changeRole: 'fixture:role', deactivate: 'fixture:disable', reactivate: 'fixture:enable' };
const loginApi: LoginApi = { async login() { calls.login++; await delay(100); return scenario === 'login-error' ? null : actor; } };
function Fixture() {
  const [user, setUser] = useState<CurrentUser | null>(scenario?.startsWith('login') ? null : actor);
  return <><p>Mock fixture only — no live accounts or provider.</p><button onClick={() => setUser(user ? { ...user, capabilities: { granted: [] } } : null)}>Revoke grants</button>
    <AccountShell state={user ? { status: 'authenticated', user } : { status: 'anonymous' }} loginApi={loginApi} onAuthenticated={setUser}>
      {params.get('view') === 'admin' ? <AdminUsers user={user} capability="fixture:list" api={adminApi} managementApi={scenario?.startsWith('manage') ? managementApi : null} managementCapabilities={managementCapabilities} /> : <ProfessorStudents user={user} listCapability={scenario === 'unbound' ? null : 'fixture:list'} progressCapability="fixture:progress" api={professorApi} />}
    </AccountShell></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
