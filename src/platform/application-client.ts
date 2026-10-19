import { parsePracticeEvent } from '../foundation/progress-batch';
import type { ActivePractice, CurrentUser, ExerciseIdentity, LessonMode, ProgressBatchResult, SessionCommands, SessionSnapshot, CloseResult, CallSegmentRef } from '../contracts';
import type { LoginApi } from '../features/accounts';
import type { AdminUsersApi } from '../features/administration';
import type { UserManagementApi } from '../features/administration/management';
import type { ProfessorApi, StudentSessionView } from '../features/professor';
import { parseSettings } from './settings-store';
import type { AccountSettingsApi } from './account-settings';
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const email = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
const instant = (value: unknown) => value === null || typeof value === 'string' && Number.isFinite(Date.parse(value));
const timeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 128 || !(value === 'UTC' || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/u.test(value))) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
};
const role = (value: unknown) => ['administrator', 'professor', 'student'].includes(String(value));
const revision = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
export class ApplicationRequestError extends Error { constructor(readonly status: number) { super('Application request failed'); } }
export function createApplicationClient(request: typeof fetch = fetch, expired: () => void = () => {}, authenticationGeneration: () => number = () => 0) {
  const revisions = new Map<string, number>();
  async function json(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const generation = authenticationGeneration();
    const headers: Record<string, string> = {};
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timeZone(zone)) headers['x-learning-time-zone'] = zone;
    } catch { /* The server retains the saved timezone when navigation context is unavailable. */ }
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await request(path, { credentials: 'same-origin', cache: 'no-store', ...(signal ? { signal } : {}),
      headers, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    if (!response.ok) { if (response.status === 401 && generation === authenticationGeneration()) expired(); throw new ApplicationRequestError(response.status); }
    return response.json();
  }
  function snapshot(value: unknown): SessionSnapshot {
    if (!object(value) || !id(value.sessionId) || !['sentence', 'verb-image', 'verb-visible'].includes(value.mode)
      || !['open', 'closed'].includes(value.status) || !revision(value.revision)) throw new Error('Invalid session response');
    return { sessionId: value.sessionId, mode: value.mode, status: value.status, revision: value.revision };
  }
  function activePractice(value: unknown): ActivePractice {
    if (!object(value) || !['none', 'active', 'uncertain'].includes(value.callState)) throw new Error('Invalid active practice response');
    const session = snapshot(value.session);
    if (session.status !== 'open') throw new Error('Active practice is not open');
    return { session, callState: value.callState as ActivePractice['callState'] };
  }
  const practice = {
    async enter(input: { mode: LessonMode; operationId: string }): Promise<ActivePractice> {
      const result = activePractice(await json('/api/learning/session/enter', input));
      if (result.session.mode !== input.mode) throw new Error('Practice mode mismatch');
      return result;
    },
    async current(): Promise<ActivePractice | null> {
      const value = await json('/api/learning/session/current');
      return value === null ? null : activePractice(value);
    },
  };
  function close(value: unknown): CloseResult {
    if (!object(value) || !id(value.sessionId) || !id(value.operationId) || value.status !== 'closed' || !revision(value.revision)
      || !['not-requested', 'pending', 'running', 'succeeded', 'failed', 'insufficient-evidence'].includes(value.feedback)) throw new Error('Invalid close response');
    return value as unknown as CloseResult;
  }
  function currentUser(value: unknown): CurrentUser {
    if (!object(value) || !id(value.id) || !role(value.role) || !object(value.capabilities) || !Array.isArray(value.capabilities.granted)
      || value.capabilities.granted.some((grant: unknown) => !id(grant)) || value.email !== undefined && !email(value.email)
      || value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 80)
      || value.image !== undefined && value.image !== null && (typeof value.image !== 'string' || value.image.length > 180000
        || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/u.test(value.image))) throw new Error('Invalid account response');
    return { id: value.id, ...(value.email ? { email: value.email } : {}), ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.image !== undefined ? { image: value.image } : {}), role: value.role, capabilities: { granted: [...value.capabilities.granted] } };
  }
  async function me(): Promise<CurrentUser> { return currentUser(await json('/api/me')); }
  const profile = { async update(input: { name: string; image: string | null }, signal: AbortSignal): Promise<CurrentUser> {
    return currentUser(await json('/api/learning/profile', input, signal));
  } };
  function preferencesSnapshot(value: unknown) {
    if (!object(value) || !revision(value.revision)) throw new Error('Invalid preferences response');
    const settings = value.settings === null ? null : parseSettings(value.settings);
    if (value.settings !== null && !settings || settings === null && value.revision !== 0 || settings !== null && value.revision === 0) throw new Error('Invalid preferences response');
    return { settings, revision: value.revision as number };
  }
  const preferences: AccountSettingsApi = {
    async read(signal) { return preferencesSnapshot(await json('/api/learning/preferences', undefined, signal)); },
    async update(input, signal) { return preferencesSnapshot(await json('/api/learning/preferences', input, signal)); },
  };
  async function readPage(path: string, cursor: string | null, signal: AbortSignal) {
    try {
      const value = await json(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, signal);
      if (!object(value) || !Array.isArray(value.items) || value.items.length > 100 || !(value.nextCursor === null || id(value.nextCursor))) throw new Error('Invalid list response');
      const items = value.items.map((item: unknown) => {
        if (!object(item) || !id(item.id) || !role(item.role)) throw new Error('Invalid user response');
        if (item.email !== undefined && !email(item.email) || item.credentialStatus !== undefined && !['ready', 'setup-required'].includes(item.credentialStatus)) throw new Error('Invalid account details');
        if (revision(item.revision)) revisions.set(item.id, item.revision);
        return { id: item.id, role: item.role, ...(typeof item.disabled === 'boolean' ? { disabled: item.disabled } : {}),
          ...(path === '/api/learning/users' && item.email ? { email: item.email } : {}),
          ...(path === '/api/learning/users' && item.credentialStatus ? { credentialStatus: item.credentialStatus } : {}) };
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
  const professor: ProfessorApi & {
    readSessionPage(studentId: string, cursor: string | null, signal: AbortSignal): Promise<import('../features/accounts/access').ReadResult<{ studentId: string; sessions: import('../contracts').ResultPage<StudentSessionView> }>>;
    readDaily(studentId: string, input: import('../contracts').DailyPageRequest, signal: AbortSignal): Promise<import('../features/accounts/access').ReadResult<import('../contracts').DailyProgressPage> | { status: 'policy-unresolved' }>;
  } = {
    async readSessionPage(studentId, cursor, signal) {
      try {
        const value = await json(`/api/learning/student-progress?studentId=${encodeURIComponent(studentId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, signal);
        if (!object(value) || value.studentId !== studentId || !object(value.sessions) || !Array.isArray(value.sessions.items) || value.sessions.items.length > 100
          || !(value.sessions.nextCursor === null || id(value.sessions.nextCursor))) throw new Error('Invalid progress page');
        for (const session of value.sessions.items) {
          if (!object(session) || !id(session.sessionId) || !instant(session.startedAt) || !instant(session.endedAt) || !['not-requested','pending','running','succeeded','failed','insufficient-evidence'].includes(session.feedback)
            || session.comment !== null && (!object(session.comment) || session.comment.sessionId !== session.sessionId || typeof session.comment.text !== 'string' || !id(session.comment.provenanceVersion))) throw new Error('Invalid session feedback');
        }
        return { status: 'ok', value: { studentId, sessions: { items: value.sessions.items, nextCursor: value.sessions.nextCursor } } };
      } catch (error) { if (error instanceof ApplicationRequestError && [401,403].includes(error.status)) return { status: 'denied' }; throw error; }
    },
    async readDaily(studentId, input, signal) {
      try {
        const params = new URLSearchParams({ studentId, day: input.day });
        if (input.eventCursor) params.set('eventCursor', input.eventCursor);
        if (input.sessionCursor) params.set('sessionCursor', input.sessionCursor);
        const value = await json(`/api/learning/daily-progress?${params}`, undefined, signal);
        const page = (page: unknown) => object(page) && Array.isArray(page.items) && page.items.length <= 100 && (page.nextCursor === null || id(page.nextCursor));
        if (!object(value) || value.studentId !== studentId || value.day !== input.day || !timeZone(value.timeZone) || !Array.isArray(value.attributionTimeZones) || value.attributionTimeZones.some((zone: unknown) => !timeZone(zone)) || value.eventAttribution !== 'server-received'
          || !page(value.writtenEvents) || !page(value.sessions) || value.totals !== null || typeof value.hasUnattributedLegacyRecords !== 'boolean'
          || !object(value.usageTime) || value.usageTime.writtenTrust !== 'client-reported-interaction' || value.usageTime.tutorTrust !== 'server-observed-connection'
          || ['writtenMs','tutorConnectedMs','totalMs'].some(key => !Number.isFinite(value.usageTime[key]) || value.usageTime[key] < 0)) throw new Error('Invalid daily progress');
        for (const key of ['orientativeTutorMs','orientativeTotalMs']) if (value.usageTime[key] !== undefined && value.usageTime[key] !== null && (!Number.isFinite(value.usageTime[key]) || value.usageTime[key] < 0)) throw new Error('Invalid orientative duration');
        new Intl.DateTimeFormat('en', { timeZone: value.timeZone });
        for (const row of value.writtenEvents.items) {
          const event = object(row) ? parsePracticeEvent(row.event) : null;
          if (!timeZone(row.timeZone) || !value.attributionTimeZones.includes(row.timeZone) || !event || event.source !== 'typed' || !revision(row.committedRevision) || row.committedRevision < 1 || typeof row.receivedAt !== 'string' || !Number.isFinite(Date.parse(row.receivedAt))) throw new Error('Invalid daily event');
        }
        for (const row of value.sessions.items) {
          if (!object(row) || !id(row.sessionId) || !['sentence','verb-image','verb-visible'].includes(row.mode)
            || ![row.startedAt,row.closedAt].every(value => value === null || typeof value === 'string' && Number.isFinite(Date.parse(value)))
            || ![null,'not-requested','pending','running','succeeded','failed','insufficient-evidence'].includes(row.feedback)
            || row.comment !== null && (!object(row.comment) || row.comment.sessionId !== row.sessionId || typeof row.comment.text !== 'string' || !id(row.comment.provenanceVersion))) throw new Error('Invalid daily session');
        }
        return { status: 'ok', value: value as unknown as import('../contracts').DailyProgressPage };
      } catch (error) { if (error instanceof ApplicationRequestError && [401,403].includes(error.status)) return { status: 'denied' };
        if (error instanceof ApplicationRequestError && error.status === 503) return { status: 'policy-unresolved' }; throw error; }
    },
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
            if (!object(session) || !id(session.sessionId) || !instant(session.startedAt) || !instant(session.endedAt) || !['not-requested','pending','running','succeeded','failed','insufficient-evidence'].includes(session.feedback)) throw new Error('Invalid session feedback');
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
  async function recoveryPage(path: string, cursor: string | null, signal: AbortSignal) {
    const value = await json(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, signal);
    if (!object(value) || !Array.isArray(value.items) || value.items.length > 100 || !(value.nextCursor === null || id(value.nextCursor))) throw new Error('Invalid recovery page');
    return { items: value.items.map(snapshot), nextCursor: value.nextCursor as string | null };
  }
  const recovery = {
    list: (cursor: string | null, signal: AbortSignal) => recoveryPage('/api/learning/open-sessions', cursor, signal),
    listFailed: (cursor: string | null, signal: AbortSignal) => recoveryPage('/api/learning/failed-feedback', cursor, signal),
    async read(sessionId: string, signal: AbortSignal): Promise<import('../app/p2-recovery-adapter').P2RecoverySnapshot> {
      const value = await json(`/api/learning/recovery?sessionId=${encodeURIComponent(sessionId)}`, undefined, signal);
      if (!object(value) || !object(value.progress) || value.progress.sessionId !== sessionId || !revision(value.progress.journalRevision)
        || !Array.isArray(value.activeSegments) || value.activeSegments.some((segment: unknown) => !object(segment) || segment.sessionId !== sessionId || !id(segment.segmentId) || !revision(segment.connectionEpoch) || segment.connectionEpoch < 1)) throw new Error('Invalid recovery snapshot');
      const session = snapshot(value.session); if (session.sessionId !== sessionId) throw new Error('Recovery session mismatch');
      if (value.feedback !== null && (!object(value.feedback) || !id(value.feedback.jobId) || !revision(value.feedback.retryRevision)
        || !['not-requested','pending','running','succeeded','failed','insufficient-evidence'].includes(value.feedback.state))) throw new Error('Invalid recovery feedback');
      return { session, progress: { sessionId, journalRevision: value.progress.journalRevision }, activeSegments: value.activeSegments.map((segment: import('../contracts').CallSegmentRef) => ({ ...segment })), feedback: value.feedback };
    },
    async readCallHistory(sessionId: string, signal: AbortSignal): Promise<boolean | null> {
      const value = await json(`/api/learning/session/history?sessionId=${encodeURIComponent(sessionId)}`, undefined, signal);
      if (!object(value) || value.sessionId !== sessionId || (value.hadConnectedCall !== null && typeof value.hadConnectedCall !== 'boolean')) throw new Error('Invalid call history');
      return value.hadConnectedCall;
    },
    async reconcile(sessionId: string, intent: 'resume' | 'finalize', signal: AbortSignal): Promise<void> {
      const value = await json('/api/learning/session/reconcile', { sessionId, intent }, signal);
      if (!object(value) || value.sessionId !== sessionId || value.status !== 'reconciled') throw new Error('Session transport remains active');
    },
    async retryFailedFeedback(input: import('../app/p2-recovery-adapter').P2RetryFeedbackRequest, signal: AbortSignal): Promise<import('../app/p2-recovery-adapter').P2RetryFeedbackResult> {
      const value = await json('/api/learning/feedback/retry', input, signal);
      if (!object(value) || value.sessionId !== input.sessionId || value.jobId !== input.jobId || value.state !== 'pending' || value.retryRevision !== input.expectedRetryRevision + 1) throw new Error('Invalid feedback retry receipt');
      return { sessionId: value.sessionId, jobId: value.jobId, state: 'pending', retryRevision: value.retryRevision };
    },
  };
  function setting(value: unknown): import('../contracts').StudentTimeZoneSetting {
    if (!object(value) || !timeZone(value.timeZone) || !revision(value.revision) || value.revision < 1 || typeof value.effectiveAt !== 'string' || !instant(value.effectiveAt)) throw new Error('Invalid timezone setting');
    return { timeZone: value.timeZone, revision: value.revision, effectiveAt: value.effectiveAt };
  }
  const studentTimeZone = {
    async read(signal: AbortSignal): Promise<import('../features/accounts/access').ReadResult<import('../contracts').StudentTimeZoneSetting | null>> {
      try { const value = await json('/api/learning/time-zone', undefined, signal); return { status: 'ok', value: value === null ? null : setting(value) }; }
      catch (error) { if (error instanceof ApplicationRequestError && [401,403].includes(error.status)) return { status: 'denied' }; throw error; }
    },
    async set(input: { operationId: string; expectedRevision: number; timeZone: string }, signal: AbortSignal): Promise<{ status: 'ok'; value: import('../contracts').StudentTimeZoneSetting } | { status: 'denied' | 'conflict' | 'invalid-input' }> {
      try { return { status: 'ok', value: setting(await json('/api/learning/time-zone', input, signal)) }; }
      catch (error) {
        if (error instanceof ApplicationRequestError) {
          if ([401,403].includes(error.status)) return { status: 'denied' };
          if (error.status === 409) return { status: 'conflict' };
          if (error.status === 400) return { status: 'invalid-input' };
        }
        throw error;
      }
    },
  };
  return { profile, preferences, practice, timeZone: studentTimeZone, json, me, login, administration, management, professor, commands, recovery,
    async signOut(): Promise<void> {
      const value = await json('/api/auth/sign-out', {}, AbortSignal.timeout(15000));
      if (!object(value) || value.ok !== true) throw new Error('Sign out was not confirmed');
      revisions.clear();
    },
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
