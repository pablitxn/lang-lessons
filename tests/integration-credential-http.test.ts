import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrateLearningDatabase } from '../server/data/migrations';
import { createApplicationServices } from '../server/application-services';
import { createLearningHttpHandler } from '../server/learning-http';
import { bootstrapInitialAdministrator } from '../server/auth/bootstrap';
const database = process.env.P2_DISPOSABLE_DATABASE_URL;
test('real PostgreSQL root credential HTTP covers bootstrap, login, manual setup, reset and revoked sessions', { skip: !database }, async () => {
  assert.ok(database); const url = new URL(database); assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/p2_test');
  const admin = new Pool({ connectionString: database }); const lock = await admin.connect(); await lock.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  const schema = `credential_http_${randomUUID().replaceAll('-','')}`; await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  const origin = 'http://127.0.0.1:5174'; const password = randomUUID()+randomUUID(); const replacement = randomUUID()+randomUUID();
  const policy = { sessionExpiresIn: 3600, sessionUpdateAge: 300, sessionFreshAge: 300, minPasswordLength: 12, maxPasswordLength: 128, allowRememberMe: false, refreshSessions: false, rateLimitWindow: 60, rateLimitMax: 100 };
  try {
    await migrateLearningDatabase(pool); assert.deepEqual(await migrateLearningDatabase(pool), []);
    const first = await bootstrapInitialAdministrator(pool, policy, { email: 'admin@example.invalid', password });
    await assert.rejects(bootstrapInitialAdministrator(pool, policy, { email: 'other@example.invalid', password }));
    const services = createApplicationServices({ pool, origin, secret: randomUUID()+randomUUID(), login: policy, allowRequest: async () => true });
    const handler = createLearningHttpHandler(services);
    const post = (path: string, body: unknown, cookie = '', requestOrigin = origin) => handler(new Request(origin+path, { method: 'POST', headers: { origin: requestOrigin, 'content-type':'application/json', cookie }, body: JSON.stringify(body) }), '127.0.0.1');
    const login = async (email: string, secret: string) => {
      const result = await post('/api/auth/sign-in/email', { email, password: secret }); assert.equal(result!.status,200);
      return result!.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    };
    const cookie = await login('admin@example.invalid',password);
    const created = await post('/api/learning/users/create', { operationId: 'student-create', email:'student@example.invalid', role:'student', disabled:false },cookie);
    assert.equal(created!.status,200); const userId = (await created!.json()).user.id;
    assert.equal((await post('/api/learning/credential-links/issue',{userId,purpose:'setup'}))!.status,401);
    assert.equal((await post('/api/learning/credential-links/issue',{userId,purpose:'setup'},cookie,'https://foreign.invalid'))!.status,403);
    const issue = await post('/api/learning/credential-links/issue',{userId,purpose:'setup'},cookie); assert.equal(issue!.status,200); assert.match(issue!.headers.get('cache-control')!,/no-store/);
    const value = await issue!.json(); const token = new URLSearchParams(new URL(value.link).hash.slice(1)).get('token');
    const raw = JSON.stringify((await pool.query('SELECT * FROM learning_credential_links')).rows); assert.equal(raw.includes(token!),false);
    const redeemed = await post('/api/learning/credential-links/redeem',{token,password}); assert.equal(redeemed!.status,200); assert.equal(redeemed!.headers.getSetCookie().length,0);
    assert.equal((await post('/api/learning/credential-links/redeem',{token,password}))!.status,400);
    const studentCookie = await login('student@example.invalid',password);
    assert.equal((await post('/api/learning/credential-links/issue',{userId:first.userId,purpose:'reset'},studentCookie))!.status,403);
    const reset = await post('/api/learning/credential-links/issue',{userId,purpose:'reset'},cookie); const resetLink = (await reset!.json()).link;
    assert.equal((await post('/api/learning/credential-links/redeem',{token:new URLSearchParams(new URL(resetLink).hash.slice(1)).get('token'),password:replacement}))!.status,200);
    assert.equal((await handler(new Request(origin+'/api/me',{headers:{cookie:studentCookie}}),'127.0.0.1'))!.status,401);
    await login('student@example.invalid',replacement);
    assert.notEqual((await post('/api/auth/sign-in/email',{email:'student@example.invalid',password}))!.status,200);
    assert.equal((await post('/api/auth/sign-up/email',{email:'public@example.invalid',password}))!.status,404);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await lock.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); lock.release(); await admin.end(); }
});
