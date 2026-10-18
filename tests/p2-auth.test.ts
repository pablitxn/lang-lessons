import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createUserManagementRepository } from '../server/accounts/management';
import { hashPassword } from 'better-auth/crypto';
import { createAuthAdapter, authOptions } from '../server/auth/better-auth';
import type { AuthConfiguration } from '../server/auth/better-auth';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
const origin = 'http://127.0.0.1:3000';
const fixturePolicy = { sessionExpiresIn: 3600, sessionUpdateAge: 600, sessionFreshAge: 600,
  minPasswordLength: 12, maxPasswordLength: 128, allowRememberMe: false, refreshSessions: false, rateLimitWindow: 60, rateLimitMax: 50 };
function request(path: string, body: unknown, cookie = '', requestOrigin = origin) {
  return new Request(`${origin}/api/auth/${path}`, { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
}

test('P2 auth rejects unresolved settings without constructing an auth instance', () => {
  assert.throws(() => authOptions({ pool: {} as Pool, origin, secret: 'fixture-only-not-live-secret-32-characters' } as AuthConfiguration), /policy-unresolved/);
});

test('P2 Better Auth isolated login/logout, expiry, disabled identity and blocked account routes', { skip: !database }, async () => {
  assert.ok(database); const url = new URL(database);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/p2_test');
  const admin = new Pool({ connectionString: database }); const schema = `p2_auth_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  try {
    await pool.query(await readFile(new URL('../server/data/migrations/p2-auth.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../server/data/migrations/p2-learning.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../server/data/migrations/p2-admin.sql', import.meta.url), 'utf8'));
    // Disposable synthetic user only: no public signup or production account provisioning.
    await pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES ($1,$2,$3,true)', ['fixture', 'Fixture', 'fixture@example.invalid']);
    await pool.query('INSERT INTO account(id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)', ['account', 'fixture', 'credential', 'fixture', await hashPassword('disposable-fixture-password')]);
    await pool.query("INSERT INTO learning_users(id,role) VALUES ('fixture','student')");
    const rawAdapter = createAuthAdapter({ pool, origin, secret: 'disposable-fixture-only-not-a-live-secret', policy: fixturePolicy });
    const adapter = { identity: rawAdapter.identity, handle: (input: Request) => rawAdapter.handle(input, '127.0.0.1') };
    await assert.rejects(adapter.identity(new Headers()), /unauthenticated/);
    for (const path of ['sign-up/email', 'request-password-reset', 'change-password', 'get-session']) assert.equal((await adapter.handle(request(path, {}))).status, 404);
    assert.equal((await adapter.handle(request('sign-in/email', {}, '', 'https://foreign.invalid'))).status, 403);
    assert.equal((await adapter.handle(request('sign-in/email', { email: 'fixture@example.invalid', password: 'disposable-fixture-password', role: 'administrator' }))).status, 400);
    assert.equal((await adapter.handle(request('sign-in/email', { email: 'fixture@example.invalid', password: 'disposable-fixture-password', rememberMe: true }))).status, 400);
    assert.equal((await adapter.handle(request('sign-in/email', { email: 'fixture@example.invalid', password: 'x'.repeat(17000) }))).status, 413);
    const wrong = await adapter.handle(request('sign-in/email', { email: 'fixture@example.invalid', password: 'incorrect-password' })); assert.equal(wrong.ok, false);
    const login = await adapter.handle(request('sign-in/email', { email: 'fixture@example.invalid', password: 'disposable-fixture-password' }));
    assert.equal(login.status, 200); assert.deepEqual(await login.json(), { ok: true }); assert.equal(login.headers.get('cache-control'), 'no-store');
    const cookies = login.headers.getSetCookie(); assert.ok(cookies.some(cookie => /httponly/i.test(cookie) && /samesite=lax/i.test(cookie)));
    const cookie = cookies.map(value => value.split(';')[0]).join('; ');
    assert.deepEqual(await adapter.identity(new Headers({ cookie })), { userId: 'fixture' });
    const remaining = (await pool.query('SELECT EXTRACT(EPOCH FROM ("expiresAt"-CURRENT_TIMESTAMP)) AS seconds FROM session')).rows[0].seconds;
    assert.ok(Number(remaining) <= 3600 && Number(remaining) > 3500, 'Explicit expiry overrides the library rememberMe=false default');
    await pool.query("UPDATE learning_users SET disabled=true WHERE id='fixture'");
    await assert.rejects(adapter.identity(new Headers({ cookie })), /forbidden/);
    const disabled = await adapter.handle(request('sign-in/email', { email: 'fixture@example.invalid', password: 'disposable-fixture-password' })); assert.equal(disabled.ok, false);
    await pool.query("UPDATE learning_users SET disabled=false WHERE id='fixture'");
    assert.equal((await adapter.handle(request('sign-out', {}, cookie))).status, 200);
    await assert.rejects(adapter.identity(new Headers({ cookie })), /unauthenticated/);
    const again = await adapter.handle(request('sign-in/email', { email: 'fixture@example.invalid', password: 'disposable-fixture-password' }));
    assert.equal(again.status, 200);
    const againCookie = again.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const priorSession = (await pool.query('SELECT * FROM session')).rows[0];
    await pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES ($1,$1,$2,false)', ['admin', 'admin@example.invalid']);
    await pool.query("INSERT INTO learning_users(id,role) VALUES ('admin','administrator')");
    const management = createUserManagementRepository(pool);
    await management.update({ userId: 'admin' }, { operationId: 'disable', userId: 'fixture', expectedRevision: 0, kind: 'set-disabled', disabled: true });
    await management.update({ userId: 'admin' }, { operationId: 'reactivate', userId: 'fixture', expectedRevision: 1, kind: 'set-disabled', disabled: false });
    // Simulate a login insert racing deactivation: even a surviving old signed cookie stays revoked.
    await pool.query('INSERT INTO session SELECT * FROM jsonb_populate_record(NULL::session,$1::jsonb)', [JSON.stringify(priorSession)]);
    await assert.rejects(adapter.identity(new Headers({ cookie: againCookie })), /unauthenticated/);
    await pool.query('UPDATE session SET "expiresAt"=CURRENT_TIMESTAMP - interval \'1 second\'');
    await assert.rejects(adapter.identity(new Headers({ cookie: againCookie })), /unauthenticated/);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
});
