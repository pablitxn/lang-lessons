import { isIP } from 'node:net';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import type { Pool } from 'pg';
import type { AuthenticatedIdentity } from '../accounts/authorization';
import { RepositoryError } from '../data/database';

/** Every account-policy value is supplied by the integrator after Q10 approval. */
export interface LoginPolicy {
  sessionExpiresIn: number;
  sessionUpdateAge: number;
  sessionFreshAge: number;
  minPasswordLength: number;
  maxPasswordLength: number;
  allowRememberMe: boolean;
  refreshSessions: boolean;
  rateLimitWindow: number;
  rateLimitMax: number;
}
export interface AuthConfiguration { pool: Pool; origin: string; secret: string; policy: LoginPolicy }
export function authOptions(config: AuthConfiguration): BetterAuthOptions {
  const { pool, origin, secret, policy } = config;
  if (!policy) throw new RepositoryError('policy-unresolved');
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new RepositoryError('invalid-input');
  if (typeof secret !== 'string' || secret.length < 32) throw new RepositoryError('invalid-input');
  for (const value of [policy.sessionExpiresIn, policy.sessionUpdateAge, policy.sessionFreshAge, policy.minPasswordLength,
    policy.maxPasswordLength, policy.rateLimitWindow, policy.rateLimitMax]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RepositoryError('invalid-input');
  }
  if (policy.maxPasswordLength < policy.minPasswordLength || typeof policy.allowRememberMe !== 'boolean' || typeof policy.refreshSessions !== 'boolean') throw new RepositoryError('invalid-input');
  return {
    database: pool, baseURL: origin, secret,
    trustedOrigins: [origin],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: policy.minPasswordLength, maxPasswordLength: policy.maxPasswordLength },
    session: { expiresIn: policy.sessionExpiresIn, updateAge: policy.sessionUpdateAge, freshAge: policy.sessionFreshAge,
      disableSessionRefresh: !policy.refreshSessions, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: policy.rateLimitWindow, max: policy.rateLimitMax,
      customRules: { '/sign-in/email': { window: policy.rateLimitWindow, max: policy.rateLimitMax } } },
    advanced: { ipAddress: { ipAddressHeaders: ['x-p2-client-ip'] }, useSecureCookies: url.protocol === 'https:', defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:' } },
    databaseHooks: { session: { create: { before: async session => {
      const { rows } = await pool.query<{ disabled: boolean; issued_at: Date }>('SELECT disabled,clock_timestamp() AS issued_at FROM learning_users WHERE id=$1', [session.userId]);
      if (!rows[0] || rows[0].disabled) return false;
      // Better Auth otherwise applies an implicit one-day lifetime for rememberMe=false.
      // Apply the explicitly supplied lifetime to both cookie modes.
      return { data: { ...session, createdAt: rows[0].issued_at, expiresAt: new Date(Date.now() + policy.sessionExpiresIn * 1000) } };
    } } } },
    logger: { disabled: true },
  };
}
export function createAuthAdapter(config: AuthConfiguration) {
  const auth = betterAuth(authOptions(config));
  return {
    async identity(headers: Headers): Promise<AuthenticatedIdentity> {
      const session = await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });
      if (!session) throw new RepositoryError('unauthenticated');
      const { rows } = await config.pool.query<{ disabled: boolean; auth_valid_after: Date | null }>('SELECT disabled,auth_valid_after FROM learning_users WHERE id=$1', [session.user.id]);
      if (!rows[0] || rows[0].disabled) throw new RepositoryError('forbidden');
      if (rows[0].auth_valid_after && session.session.createdAt.getTime() <= rows[0].auth_valid_after.getTime()) throw new RepositoryError('unauthenticated');
      return { userId: session.user.id };
    },
    /** Root must expose only this wrapper, never auth.handler or library signup/settings/recovery routes. */
    async handle(request: Request, clientAddress: string): Promise<Response> {
      // Root supplies the actual socket/trusted-proxy address; browser headers cannot select the rate key.
      if (!isIP(clientAddress)) return new Response(null, { status: 400 });
      const path = new URL(request.url).pathname;
      if (request.method !== 'POST' || !['/api/auth/sign-in/email', '/api/auth/sign-out'].includes(path)) return new Response(null, { status: 404 });
      if (request.headers.get('origin') !== config.origin) return new Response(null, { status: 403 });
      if (!request.headers.get('content-type')?.startsWith('application/json')) return new Response(null, { status: 415 });
      // Read streaming input with a hard byte limit; Content-Length alone is not trustworthy.
      const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      if (reader) {
        try {
          while (true) {
            const next = await reader.read(); if (next.done) break;
            size += next.value.byteLength;
            if (size > 16_384) { await reader.cancel(); return new Response(null, { status: 413 }); }
            chunks.push(next.value);
          }
        } finally { reader.releaseLock(); }
      }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return new Response(null, { status: 400 }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return new Response(null, { status: 400 });
      const input = body as Record<string, unknown>;
      if (path.endsWith('/email')) {
        if (Object.keys(input).some(key => !['email', 'password', 'rememberMe'].includes(key))
          || typeof input.email !== 'string' || typeof input.password !== 'string'
          || (input.rememberMe !== undefined && typeof input.rememberMe !== 'boolean')
          || (!config.policy.allowRememberMe && input.rememberMe === true)) return new Response(null, { status: 400 });
        if (!config.policy.allowRememberMe) input.rememberMe = false;
      } else if (Object.keys(input).length) return new Response(null, { status: 400 });
      const forwardedHeaders = new Headers(request.headers); forwardedHeaders.set('x-p2-client-ip', clientAddress);
      const response = await auth.handler(new Request(request.url, { method: 'POST', headers: forwardedHeaders, body: JSON.stringify(input) }));
      // Keep the library's Set-Cookie headers; never expose its bearer token or user profile DTO.
      const headers = new Headers(response.headers); headers.set('cache-control', 'no-store'); headers.delete('content-length');
      return new Response(JSON.stringify({ ok: response.ok }), { status: response.status, headers });
    },
  };
}
