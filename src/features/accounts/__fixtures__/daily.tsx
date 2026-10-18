import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CurrentUser, DailyPageRequest, DailyProgressPage, DailyResult } from '../../../contracts';
import type { AttributionFields, EventAttributionFields } from '../../professor/ProfessorProgress';
import { ProfessorStudents, type ProfessorApi } from '../../professor';
const scenario = new URLSearchParams(location.search).get('scenario');
const requests = { daily: [] as { studentId: string; input: DailyPageRequest }[], history: [] as { studentId: string; cursor: string | null }[], legacy: 0 };
Object.assign(window, { p3DailyRequests: requests });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const api: ProfessorApi = {
  async listAllStudents() { return { status: 'ok', value: { items: [{ id: 'first-student', role: 'student' }, { id: 'second-student', role: 'student' }], nextCursor: null } }; },
  async readProgress() { requests.legacy++; throw new Error('Legacy adapter must not run'); },
  async readSessionPage(studentId, cursor) {
    requests.history.push({ studentId, cursor });
    if (scenario === 'late-student' && studentId === 'first-student') await wait(700);
    if (scenario === 'history-error' && requests.history.length === 1) throw new Error('private history transport');
    if (scenario === 'denied') return { status: 'denied' };
    return { status: 'ok', value: { studentId, sessions: { items: scenario === 'empty' ? [] : [{ sessionId: `${studentId}-history-${cursor ?? 'first'}`, feedback: 'succeeded', startedAt: '2026-10-18T09:00:00Z', endedAt: '2026-10-18T09:05:00Z', comment: { sessionId: `${studentId}-history-${cursor ?? 'first'}`, text: `${studentId} history ${cursor ?? 'first'}`, provenanceVersion: 'mock-v1' } }], nextCursor: cursor || scenario === 'empty' ? null : 'history-two' } } };
  },
  async readDaily(studentId, input) {
    requests.daily.push({ studentId, input });
    if (scenario === 'late-day' && input.day === '2026-10-17') await wait(800);
    if (scenario === 'loading') await wait(500);
    if (scenario === 'policy') return { status: 'policy-unresolved' };
    if (scenario === 'denied') return { status: 'denied' };
    if (scenario === 'error' && requests.daily.length === 1) throw new Error('private daily transport');
    const eventId = input.eventCursor ?? 'event-first';
    const sessionId = input.sessionCursor ?? 'daily-first';
    const result: DailyResult & EventAttributionFields = { ...(scenario === 'mixed-zones' ? { timeZone: input.eventCursor ? 'Europe/Paris' : 'America/New_York' } : {}), event: { schemaVersion: 1, eventId, source: 'typed', trust: 'client-reported', ...(input.eventCursor ? { kind: 'attempt-invalidated' as const } : { kind: 'attempt-result' as const, result: 'accepted' as const }), ref: { sessionId: 'written-session', exerciseId: eventId, generation: 1, obligation: 'written:translation', attemptId: 'attempt-one', revision: 1 } }, receivedAt: `${input.day}T23:30:00Z`, committedRevision: 2 };
    const page: DailyProgressPage & AttributionFields = { ...(scenario === 'mixed-zones' ? { attributionTimeZones: ['America/New_York', 'Europe/Paris'] } : {}), studentId: scenario === 'mismatch-student' ? 'wrong-student' : studentId, day: scenario === 'mismatch-day' ? '2026-10-01' : input.day, timeZone: 'America/Argentina/Buenos_Aires', eventAttribution: 'server-received', totals: null,
      writtenEvents: { items: scenario === 'empty' ? [] : [result], nextCursor: scenario === 'empty' ? null : scenario === 'cycle' ? 'event-two' : input.eventCursor ? null : 'event-two' },
      sessions: { items: scenario === 'empty' ? [] : [{ sessionId, mode: 'sentence', startedAt: `${input.day}T12:00:00Z`, closedAt: `${input.day}T12:00:20Z`, feedback: 'succeeded', comment: { sessionId, text: `${studentId} ${input.day} ${sessionId} comment`, provenanceVersion: 'mock-v1' } }], nextCursor: input.sessionCursor || scenario === 'empty' ? null : 'daily-two' },
      usageTime: { writtenMs: 10000, tutorConnectedMs: 20000, totalMs: 25000, writtenTrust: 'client-reported-interaction', tutorTrust: 'server-observed-connection' }, hasUnattributedLegacyRecords: true };
    return { status: 'ok', value: page };
  },
};
function Fixture() {
  const [user, setUser] = useState<CurrentUser>({ id: 'professor', role: 'professor', capabilities: { granted: ['students:list', 'students:feedback:read'] } });
  return <><p>Mock daily API only</p><button onClick={() => setUser({ ...user, capabilities: { granted: [] } })}>Revoke access</button><ProfessorStudents user={user} api={api} listCapability="students:list" progressCapability="students:feedback:read" /></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
