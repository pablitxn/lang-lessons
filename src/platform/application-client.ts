import type { CurrentUser, ExerciseIdentity, ProgressBatchResult, SessionCommands, SessionSnapshot, CloseResult, CallSegmentRef } from '../contracts';
import type { LoginApi } from '../features/accounts';
import type { AdminUsersApi } from '../features/administration';
import type { UserManagementApi } from '../features/administration/management';
import type { ProfessorApi, StudentSessionView } from '../features/professor';
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const role = (value: unknown) => ['administrator', 'professor', 'student'].includes(String(value));
const revision = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
export class ApplicationRequestError extends Error { constructor(readonly status: number) { super('Application request failed'); } }
export function createApplicationClient(request: typeof fetch = fetch, expired: () => void = () => {}) {
  const revisions = new Map<string, number>();
  async function json(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await request(path, { credentials: 'same-origin', cache: 'no-store', ...(signal ? { signal } : {}),
      ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    if (!response.ok) { if (response.status === 401) expired(); throw new ApplicationRequestError(response.status); }
    return response.json();
  }
  function snapshot(value: unknown): SessionSnapshot {
    if (!object(value) || !id(value.sessionId) || !['sentence', 'verb-image', 'verb-visible'].includes(value.mode)
      || !['open', 'closed'].includes(value.status) || !revision(value.revision)) throw new Error('Invalid session response');
    return { sessionId: value.sessionId, mode: value.mode, status: value.status, revision: value.revision };
  }
  function close(value: unknown): CloseResult {
    if (!object(value) || !id(value.sessionId) || !id(value.operationId) || value.status !== 'closed' || !revision(value.revision)
      || !['not-requested', 'pending', 'running', 'succeeded', 'failed', 'insufficient-evidence'].includes(value.feedback)) throw new Error('Invalid close response');
    return value as unknown as CloseResult;
  }
  async function me(): Promise<CurrentUser> {
    const value = await json('/api/me');
    if (!object(value) || !id(value.id) || !role(value.role) || !object(value.capabilities) || !Array.isArray(value.capabilities.granted)
      || value.capabilities.granted.some((grant: unknown) => !id(grant))) throw new Error('Invalid account response');
    return { id: value.id, role: value.role, capabilities: { granted: [...value.capabilities.granted] } };
  }
  async function readPage(path: string, cursor: string | null, signal: AbortSignal) {
    try {
      const value = await json(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, signal);
      if (!object(value) || !Array.isArray(value.items) || value.items.length > 100 || !(value.nextCursor === null || id(value.nextCursor))) throw new Error('Invalid list response');
      const items = value.items.map((item: unknown) => {
        if (!object(item) || !id(item.id) || !role(item.role)) throw new Error('Invalid user response');
        if (revision(item.revision)) revisions.set(item.id, item.revision);
        return { id: item.id, role: item.role, ...(typeof item.disabled === 'boolean' ? { disabled: item.disabled } : {}) };
      });
      return { status: 'ok' as const, value: { items, nextCursor: value.nextCursor as string | null } };
    } catch (error) { if (error instanceof ApplicationRequestError && [401,403].includes(error.status)) return { status: 'denied' as const }; throw error; }
  }
  const commands: SessionCommands = {
    create: async input => snapshot(await json('/api/learning/session/create', input)),
    read: async sessionId => snapshot(await json(`/api/learning/session?sessionId=${encodeURIComponent(sessionId)}`)),
    startCall: async input => {
      const value = await json('/api/learning/session/start-call', input);
      if (!object(value) || !object(value.segment) || !id(value.segment.sessionId) || !id(value.segment.segmentId)
        || !Number.isSafeInteger(value.segment.connectionEpoch) || value.segment.connectionEpoch < 1) throw new Error('Invalid segment response');
      return { session: snapshot(value.session), segment: value.segment as CallSegmentRef };
    },
    stopCall: async input => snapshot(await json('/api/learning/session/stop-call', input)),
    confirmClose: async input => close(await json('/api/learning/session/confirm-close', input)),
    readClose: async sessionId => { const value = await json(`/api/learning/session/close?sessionId=${encodeURIComponent(sessionId)}`); return value === null ? null : close(value); },
  };
  const login: LoginApi = { async login(credentials, signal) { await json('/api/auth/sign-in/email', credentials, signal); return me(); } };
  const administration: AdminUsersApi = { listUsers: (cursor, signal) => readPage('/api/learning/users', cursor, signal) };
  const management: UserManagementApi = { async apply(change, signal) {
    try {
      const operationId = crypto.randomUUID();
      if (change.kind === 'create') await json('/api/learning/users/create', { operationId, email: change.email, role: change.role, disabled: false }, signal);
      else {
        const expectedRevision = revisions.get(change.userId); if (expectedRevision === undefined) return { status: 'conflict' };
        await json('/api/learning/users/update', { operationId, userId: change.userId, expectedRevision,
          ...(change.kind === 'change-role' ? { kind: 'set-role', role: change.role } : { kind: 'set-disabled', disabled: change.disabled }) }, signal);
      }
      return { status: 'applied' };
    } catch (error) {
      if (!(error instanceof ApplicationRequestError)) throw error;
      if ([401,403].includes(error.status)) return { status: 'denied' };
      if (error.status === 409) return { status: 'conflict' };
      if (error.status === 400) return { status: 'invalid-input' };
      if (error.status === 503) return { status: 'policy-unresolved' };
      throw error;
    }
  } };
  const professor: ProfessorApi = {
    listAllStudents: (cursor, signal) => readPage('/api/learning/students', cursor, signal),
    async readProgress(studentId, signal) {
      // Preserve all pages for the current P3 array adapter. Reject oversized/cyclic data, never truncate silently.
      const sessions: StudentSessionView[] = []; const seen = new Set<string>(); let cursor: string | null = null;
      try {
        do {
          const value = await json(`/api/learning/student-progress?studentId=${encodeURIComponent(studentId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, signal);
          if (!object(value) || value.studentId !== studentId || !object(value.sessions) || !Array.isArray(value.sessions.items)
            || value.sessions.items.length > 100 || !(value.sessions.nextCursor === null || id(value.sessions.nextCursor))) throw new Error('Invalid progress page');
          for (const session of value.sessions.items) {
            if (!object(session) || !id(session.sessionId) || !['not-requested','pending','running','succeeded','failed','insufficient-evidence'].includes(session.feedback)) throw new Error('Invalid session feedback');
            if (session.comment !== null && (!object(session.comment) || session.comment.sessionId !== session.sessionId || typeof session.comment.text !== 'string' || !id(session.comment.provenanceVersion))) throw new Error('Invalid comment response');
            sessions.push(session as unknown as StudentSessionView);
          }
          cursor = value.sessions.nextCursor;
          if (cursor && (seen.has(cursor) || seen.size >= 100)) throw new Error('Session pagination needs a narrower view');
          if (cursor) seen.add(cursor);
        } while (cursor);
        return { status: 'ok', value: { studentId, sessions, daily: null } };
      } catch (error) { if (error instanceof ApplicationRequestError && [401,403].includes(error.status)) return { status: 'denied' }; throw error; }
    },
  };
  return { json, me, login, administration, management, professor, commands,
    async readFence(sessionId: string): Promise<import('../contracts').ProgressFence> {
      const value = await json(`/api/learning/recovery?sessionId=${encodeURIComponent(sessionId)}`);
      if (!object(value) || !object(value.progress) || value.progress.sessionId !== sessionId || !revision(value.progress.journalRevision)) throw new Error('Invalid progress fence');
      return { sessionId, journalRevision: value.progress.journalRevision };
    },
    usage: {
      async openWrittenStream(sessionId: string): Promise<string> {
        const value = await json('/api/learning/usage/open', { sessionId });
        if (!object(value) || !id(value.streamId)) throw new Error('Invalid usage stream');
        return value.streamId;
      },
      async written(row: import('../features/progress/written-usage-store').WrittenObservation): Promise<import('../features/progress/written-usage-store').UsageReceipt> {
        return await json('/api/learning/usage/written', row) as import('../features/progress/written-usage-store').UsageReceipt;
      },
    },
    async issue(input: { sessionId: string; operationId: string }): Promise<ExerciseIdentity> {
      const value = await json('/api/learning/instance/issue', input);
      if (!object(value) || value.sessionId !== input.sessionId || !id(value.exerciseId) || !revision(value.generation)) throw new Error('Invalid issuance response');
      return { sessionId: value.sessionId, exerciseId: value.exerciseId, generation: value.generation };
    },
    async send(sessionId: string, events: readonly import('../contracts').PracticeEvent[]): Promise<ProgressBatchResult> {
      return await json(`/api/learning/progress?sessionId=${encodeURIComponent(sessionId)}`, events) as ProgressBatchResult;
    },
  };
}
