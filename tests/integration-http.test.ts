import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearningHttpHandler, type LearningHttpServices } from '../server/learning-http';
import { RepositoryError, exactKeys } from '../server/data/database';

const origin = 'http://127.0.0.1:5200';
function fixture() {
  const calls: unknown[] = []; let allowed = true; let denied = false;
  const services = {
    origin, allowRequest: async (address: string) => { calls.push(['limit', address]); return allowed; },
    auth: { identity: async () => { if (denied) throw new RepositoryError('unauthenticated'); return { userId: 'canonical' }; },
      handle: async () => { calls.push('login'); return new Response('{"ok":true}'); } },
    accounts: { me: async (identity: unknown) => { calls.push(identity); return { id: 'canonical', role: 'student', capabilities: { granted: [] } }; },
      readProgressPage: async (identity: unknown, studentId: string, cursor: string | null) => { calls.push([identity, studentId, cursor]); return { studentId, sessions: { items: [], nextCursor: 'next-page' } }; } },
    learning: (identity: unknown) => { calls.push(identity); return { commands: {
      create: async (body: unknown) => { exactKeys(body, ['mode', 'operationId']); calls.push(body); return { sessionId: 'server-issued' }; },
    }, submit: async (id: string, body: unknown) => { calls.push([id, body]); return { status: 'committed' }; } }; },
  } as unknown as LearningHttpServices;
  const handler = createLearningHttpHandler(services);
  const request = (path: string, body?: unknown, headers?: Record<string, string>) => handler(new Request(origin + path, body === undefined ? { headers: headers ?? {} } : {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  }), '127.0.0.1');
  return { calls, request, disallow: () => { allowed = false; }, deny: () => { denied = true; } };
}
test('root HTTP leaves unowned routes alone and gates unresolved services/logout/signup', async () => {
  const blocked = createLearningHttpHandler(null);
  assert.equal(await blocked(new Request(origin + '/api/realtime/status'), '127.0.0.1'), null);
  const response = await blocked(new Request(origin + '/api/me'), '127.0.0.1');
  assert.equal(response?.status, 503); assert.equal(response?.headers.get('cache-control'), 'private, no-store');
  const f = fixture();
  assert.equal((await f.request('/api/realtime/session', {}))?.status, 503);
  assert.equal((await f.request('/api/auth/sign-out', {}))?.status, 503);
  assert.equal((await f.request('/api/auth/sign-up/email', {}))?.status, 404);
  assert.equal(f.calls.includes('login'), false);
});
test('root HTTP enforces origin/type/limiter, canonical actor and bounded validated bodies', async () => {
  const f = fixture();
  assert.equal((await f.request('/api/learning/session/create', {}, { origin: 'https://other.invalid' }))?.status, 403);
  assert.equal((await f.request('/api/learning/session/create', {}, { 'content-type': 'text/plain' }))?.status, 415);
  assert.equal((await f.request('/api/learning/session/create', { mode: 'sentence', operationId: 'op', userId: 'victim' }))?.status, 400);
  assert.equal((await f.request('/api/learning/session/create', { mode: 'sentence', operationId: 'op' }))?.status, 200);
  assert.ok(f.calls.some(item => JSON.stringify(item) === '{"userId":"canonical"}'));
  assert.equal((await f.request('/api/learning/progress?sessionId=s1', ['x'.repeat(300000)]))?.status, 400);
  assert.equal((await f.request('/api/learning/register-instance', {}))?.status, 404);
  f.disallow(); assert.equal((await f.request('/api/me'))?.status, 429);
});
test('root HTTP keeps session pagination and rejects expired authentication without exposing exceptions', async () => {
  const f = fixture();
  const result = await f.request('/api/learning/student-progress?studentId=student&cursor=opaque');
  assert.deepEqual(await result?.json(), { studentId: 'student', sessions: { items: [], nextCursor: 'next-page' } });
  assert.deepEqual(f.calls.at(-1), [{ userId: 'canonical' }, 'student', 'opaque']);
  f.deny(); assert.equal((await f.request('/api/me'))?.status, 401);
});

test('root dispatches canonical feedback jobs only after close or committed manual retry', async () => {
  const dispatched: string[] = []; const calls: string[] = [];
  const services = {
    origin, allowRequest: async () => true, auth: { identity: async () => ({ userId: 'actor' }) },
    learning: () => ({ commands: {
      confirmClose: async () => { calls.push('close-committed'); return { sessionId: 'canonical-session', operationId: 'close', status: 'closed', revision: 3, feedback: 'pending' }; },
      stopCall: async () => { calls.push('stop-committed'); return { sessionId: 'canonical-session', status: 'open', mode: 'sentence', revision: 2 }; },
    } }),
    recovery: () => ({ read: async (sessionId: string) => {
      assert.equal(sessionId, 'canonical-session'); assert.equal(calls.at(-1), 'close-committed');
      return { feedback: { jobId: 'canonical-job', state: 'pending', retryRevision: 0 } };
    }, retryFailedFeedback: async () => { calls.push('retry-committed'); return { sessionId: 'canonical-session', jobId: 'canonical-job', state: 'pending', retryRevision: 1 }; } }),
    feedback: {
      afterConfirmedClose: async (jobId: string) => { dispatched.push(`close:${jobId}`); return { status: 'stored' }; },
      afterManualRetry: async (jobId: string) => { assert.equal(calls.at(-1), 'retry-committed'); dispatched.push(`retry:${jobId}`); return { status: 'stored' }; },
    },
  } as unknown as LearningHttpServices;
  const handler = createLearningHttpHandler(services);
  const post = (path: string) => handler(new Request(origin + path, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' }), '127.0.0.1');
  assert.equal((await post('/api/learning/session/stop-call'))?.status, 200); assert.deepEqual(dispatched, []);
  assert.equal((await post('/api/learning/session/confirm-close'))?.status, 200);
  assert.deepEqual(dispatched, ['close:canonical-job']);
  assert.equal((await post('/api/learning/feedback/retry'))?.status, 200);
  assert.deepEqual(dispatched, ['close:canonical-job', 'retry:canonical-job']);
});
