import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { createAuthAdapter } from './auth/better-auth';
import type { createAccountRepository } from './accounts/repository';
import type { AuthenticatedIdentity } from './accounts/authorization';
import type { createLearningRepository } from './data/repository';
import { RepositoryError, exactKeys, requireId } from './data/database';
import { readBoundedJson } from './data/request-body';

export interface LearningHttpServices {
  origin: string;
  feedback?: Pick<ReturnType<typeof import('./feedback/service').createFeedbackService>, 'afterConfirmedClose' | 'afterManualRetry'>;
  reconcile?: (identity: AuthenticatedIdentity, input: unknown) => Promise<{ sessionId: string; status: 'reconciled' }>;
  brokerAuthority?: import('./broker/authority').BrokerAuthority;
  management?: ReturnType<typeof import('./accounts/management').createUserManagementRepository>;
  daily?: ReturnType<typeof import('./accounts/daily-progress').createDailyProgressRepository>;
  usage?: (identity: AuthenticatedIdentity) => ReturnType<typeof import('./data/usage').createUsageRepository>;
  recovery?: (identity: AuthenticatedIdentity) => ReturnType<typeof import('./data/recovery').createRecoveryRepository>;
  issueInstance?: (identity: AuthenticatedIdentity, input: unknown) => Promise<import('../src/contracts').ExerciseIdentity>;
  auth: ReturnType<typeof createAuthAdapter>;
  accounts: ReturnType<typeof createAccountRepository>;
  learning(identity: AuthenticatedIdentity): ReturnType<typeof createLearningRepository>;
  /** Required explicit limiter; no rate or trusted-proxy policy is invented here. */
  allowRequest(clientAddress: string): Promise<boolean>;
}
const statuses = { unauthenticated: 401, forbidden: 403, 'not-found': 404, conflict: 409, 'invalid-input': 400, 'policy-unresolved': 503 } as const;
function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
const owns = (path: string) => path === '/api/me' || path.startsWith('/api/auth/') || path.startsWith('/api/learning/');
/** Unselected services fail closed; no auth/storage object is constructed as an import side effect. */
export function createLearningHttpHandler(services: LearningHttpServices | null) {
  return async (request: Request, clientAddress: string): Promise<Response | null> => {
    const url = new URL(request.url);
    // An account-enabled application must not inherit the old unauthenticated broker.
    // Keep provider routes unavailable until canonical segment/auth binding is supplied.
    if (services && url.pathname.startsWith('/api/realtime/')) return services.brokerAuthority ? null : reply(503, { error: 'provider-binding-unresolved' });
    if (!owns(url.pathname)) return null;
    if (url.pathname === '/api/learning/config' && request.method === 'GET') return reply(200, { accountsEnabled: Boolean(services) });
    if (!services) return reply(503, { error: 'policy-unresolved' });
    try {
      if (url.origin !== services.origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply(403, { error: 'forbidden' });
      if (!await services.allowRequest(clientAddress)) return reply(429, { error: 'rate-limited' });
      if (request.method !== 'GET' && request.method !== 'POST') return reply(405, { error: 'method-not-allowed' });
      if (request.method === 'POST' && request.headers.get('origin') !== services.origin) return reply(403, { error: 'forbidden' });
      if (request.method === 'POST' && request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return reply(415, { error: 'invalid-content-type' });
      if (url.pathname === '/api/auth/sign-out') return reply(503, { error: 'policy-unresolved' });
      if (url.pathname.startsWith('/api/auth/')) {
        if (url.pathname !== '/api/auth/sign-in/email' || request.method !== 'POST') return reply(404, { error: 'not-found' });
        const response = await services.auth.handle(request, clientAddress);
        response.headers.set('cache-control', 'private, no-store'); return response;
      }
      const identity = await services.auth.identity(request.headers);
      const cursor = url.searchParams.get('cursor');
      const id = url.searchParams.get('sessionId');
      if (request.method === 'GET') {
        if (url.pathname === '/api/learning/session/history' && id && services.recovery) return reply(200, await services.recovery(identity).readCallHistory(id));
        if (url.pathname === '/api/learning/failed-feedback' && services.recovery) return reply(200, await services.recovery(identity).listFailedFeedback(cursor));
        if (url.pathname === '/api/learning/open-sessions' && services.recovery) return reply(200, await services.recovery(identity).listOpen(cursor));
        if (url.pathname === '/api/learning/recovery' && id && services.recovery) return reply(200, await services.recovery(identity).read(id));
        if (url.pathname === '/api/learning/daily-progress' && services.daily) return reply(200, await services.daily.read(identity, url.searchParams.get('studentId') ?? '', {
          day: url.searchParams.get('day') ?? '', eventCursor: url.searchParams.get('eventCursor'), sessionCursor: url.searchParams.get('sessionCursor'),
        }));
        if (url.pathname === '/api/me') return reply(200, await services.accounts.me(identity));
        if (url.pathname === '/api/learning/users') return reply(200, services.management ? await services.management.list(identity, cursor) : await services.accounts.listUsers(identity, cursor));
        if (url.pathname === '/api/learning/students') return reply(200, await services.accounts.listAllStudents(identity, cursor));
        if (url.pathname === '/api/learning/student-progress') return reply(200, await services.accounts.readProgressPage(identity, url.searchParams.get('studentId') ?? '', cursor));
        if (url.pathname === '/api/learning/session' && id) return reply(200, await services.learning(identity).commands.read(id));
        if (url.pathname === '/api/learning/session/close' && id) return reply(200, await services.learning(identity).commands.readClose(id));
        return reply(404, { error: 'not-found' });
      }
      const repository = services.learning(identity);
      const commands = repository.commands;
      // Repository methods validate exact keys and values before any write. Never accept identity or grants from JSON.
      const body = await readBoundedJson(request);
      if (url.pathname === '/api/learning/session/reconcile' && services.reconcile) return reply(200, await services.reconcile(identity, body));
      if (url.pathname === '/api/learning/users/create' && services.management) return reply(200, await services.management.create(identity, body as never));
      if (url.pathname === '/api/learning/users/update' && services.management) return reply(200, await services.management.update(identity, body as never));
      if (url.pathname === '/api/learning/usage/open' && services.usage) {
        exactKeys(body, ['sessionId']); requireId(body.sessionId);
        return reply(200, { streamId: await services.usage(identity).openWrittenStream(body.sessionId) });
      }
      if (url.pathname === '/api/learning/usage/written' && services.usage) return reply(200, await services.usage(identity).written(body as never));
      if (url.pathname === '/api/learning/feedback/retry' && services.recovery) {
        const retried = await services.recovery(identity).retryFailedFeedback(body as never);
        if (services.feedback) void services.feedback.afterManualRetry(retried.jobId).catch(() => {});
        return reply(200, retried);
      }
      if (url.pathname === '/api/learning/instance/issue') return services.issueInstance ? reply(200, await services.issueInstance(identity, body)) : reply(503, { error: 'policy-unresolved' });
      if (url.pathname === '/api/learning/progress' && id) return reply(200, await repository.submit(id, body));
      const operations = {
        '/api/learning/session/create': commands.create,
        '/api/learning/session/start-call': commands.startCall,
        '/api/learning/session/stop-call': commands.stopCall,
        '/api/learning/session/confirm-close': commands.confirmClose,
      };
      const operation = operations[url.pathname as keyof typeof operations];
      if (!operation) return reply(404, { error: 'not-found' });
      const result = await operation(body as never);
      if (url.pathname === '/api/learning/session/confirm-close' && services.feedback && services.recovery) {
        const closed = result as import('../src/contracts').CloseResult;
        // Only server-resolved canonical job IDs reach the internal worker.
        const recovered = await services.recovery(identity).read(closed.sessionId);
        if (recovered.feedback?.state === 'pending') void services.feedback.afterConfirmedClose(recovered.feedback.jobId).catch(() => {});
      }
      return reply(200, result);
    } catch (error) {
      return error instanceof RepositoryError ? reply(statuses[error.code], { error: error.code }) : reply(500, { error: 'request-failed' });
    }
  };
}
/** Existing broker validates Host before this bridge. Socket address is never taken from headers. */
export function learningNodeBridge(services: LearningHttpServices | null, fallbackOrigin: string) {
  const handler = createLearningHttpHandler(services);
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', services?.origin ?? fallbackOrigin);
    if (!owns(url.pathname) && !(services && url.pathname.startsWith('/api/realtime/'))) return false;
    // Hand the original stream to the authenticated broker. Wrapping it in a
    // Web Request here would consume bytes before the broker reads its JSON.
    if (services?.brokerAuthority && url.pathname.startsWith('/api/realtime/')) return false;
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      const init = { method: request.method ?? 'GET', headers,
        ...(['GET', 'HEAD'].includes(request.method ?? 'GET') ? {} : { body: Readable.toWeb(request) as ReadableStream<Uint8Array>, duplex: 'half' }) };
      const result = await handler(new Request(url, init), request.socket.remoteAddress ?? '');
      if (!result) return false;
      response.statusCode = result.status;
      result.headers.forEach((value, key) => { if (key !== 'set-cookie') response.setHeader(key, value); });
      const cookies = result.headers.getSetCookie(); if (cookies.length) response.setHeader('set-cookie', cookies);
      response.end(Buffer.from(await result.arrayBuffer())); return true;
    } catch { response.writeHead(500, { 'cache-control': 'private, no-store' }); response.end(); return true; }
  };
}
