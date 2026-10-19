import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createAccountRepository } from '../server/accounts/repository';
import { createStudentTimeZoneRepository } from '../server/accounts/student-timezone';
import { approvedAccountAccess } from '../server/accounts/approved-policy';
import { PROFILE_IMAGE_MAX_BYTES, publicProfileImage, validateProfileImage, validateProfileInput } from '../server/accounts/profile';
import { createLearningHttpHandler, type LearningHttpServices } from '../server/learning-http';
import { RepositoryError } from '../server/data/database';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=';

test('profile input accepts normalized own display fields and rejects account privilege fields', () => {
  assert.deepEqual(validateProfileInput({ name: '  Pablo Coronel  ', image: pixel }), { name: 'Pablo Coronel', image: pixel });
  assert.deepEqual(validateProfileInput({ name: 'Lucía', image: null }), { name: 'Lucía', image: null });
  for (const input of [null, {}, { name: '', image: null }, { name: '   ', image: null }, { name: 'a'.repeat(81), image: null },
    { name: 'hello\nworld', image: null }, { name: 'Pablo', image: null, userId: 'another' },
    { name: 'Pablo', image: null, role: 'administrator' }, { name: 'Pablo', image: null, email: 'changed@example.invalid' }]) {
    assert.throws(() => validateProfileInput(input), /invalid-input/);
  }
});

test('profile photos enforce raster signatures, canonical encoding, byte limits and dimension limits', () => {
  assert.equal(validateProfileImage(pixel), pixel);
  const oversizedDimensions = Buffer.from(pixel.split(',')[1]!, 'base64'); oversizedDimensions.writeUInt32BE(2049, 16);
  const emptyDimensions = Buffer.from(pixel.split(',')[1]!, 'base64'); emptyDimensions.writeUInt32BE(0, 20);
  for (const value of ['https://example.invalid/avatar.png', 'data:image/svg+xml;base64,PHN2Zy8+',
    pixel.replace('image/png', 'image/jpeg'), 'data:image/png;base64,' + Buffer.from('<svg/>').toString('base64'),
    pixel + '\n', pixel.slice(0, -1), 'data:image/png;base64,' + oversizedDimensions.toString('base64'),
    'data:image/png;base64,' + emptyDimensions.toString('base64'),
    'data:image/png;base64,' + Buffer.alloc(PROFILE_IMAGE_MAX_BYTES + 1).toString('base64')]) {
    assert.throws(() => validateProfileImage(value), /invalid-input/);
  }
  assert.equal(publicProfileImage('https://legacy.example.invalid/photo.jpg'), null);
});

const origin = 'http://127.0.0.1:5174';
test('profile HTTP updates use the authenticated actor and retain origin, size and authentication gates', async () => {
  const writes: unknown[] = []; let authenticated = true;
  const services = {
    origin, allowRequest: async () => true,
    auth: { identity: async () => { if (!authenticated) throw new RepositoryError('unauthenticated'); return { userId: 'actor' }; } },
    accounts: { updateProfile: async (identity: unknown, input: unknown) => { const profile = validateProfileInput(input); writes.push({ identity, profile }); return { id: 'actor', ...profile }; } },
  } as unknown as LearningHttpServices;
  const handler = createLearningHttpHandler(services);
  const post = (body: unknown, requestOrigin = origin) => handler(new Request(origin + '/api/learning/profile', {
    method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), '127.0.0.1');
  assert.equal((await post({ name: 'Pablo', image: pixel }, 'https://other.invalid'))?.status, 403);
  assert.equal((await post({ name: 'Pablo', image: pixel, userId: 'victim' }))?.status, 400);
  assert.equal((await post({ name: 'Pablo', image: 'x'.repeat(300_000) }))?.status, 400);
  assert.deepEqual(writes, []);
  assert.equal((await post({ name: 'Pablo', image: pixel }))?.status, 200);
  assert.deepEqual(writes, [{ identity: { userId: 'actor' }, profile: { name: 'Pablo', image: pixel } }]);
  authenticated = false;
  assert.equal((await post({ name: 'Changed', image: null }))?.status, 401);
  assert.equal(writes.length, 1);
});

test('request timezone context follows only the signed-in student on bootstrap and lesson creation', async () => {
  const observations: unknown[] = []; let role = 'student'; const order: string[] = [];
  const services = {
    origin, allowRequest: async () => true, auth: { identity: async () => ({ userId: 'actor' }) },
    accounts: { me: async () => ({ id: 'actor', role }) },
    timeZone: (identity: unknown) => ({ observe: async (zone: unknown) => { observations.push({ identity, zone }); order.push('zone'); } }),
    learning: () => ({ commands: { create: async () => { order.push('create'); return { sessionId: 'canonical' }; } } }),
  } as unknown as LearningHttpServices;
  const handler = createLearningHttpHandler(services);
  const headers = { 'x-learning-time-zone': 'Europe/Istanbul' };
  assert.equal((await handler(new Request(origin + '/api/me', { headers }), '127.0.0.1'))?.status, 200);
  assert.deepEqual(observations, [{ identity: { userId: 'actor' }, zone: 'Europe/Istanbul' }]);
  role = 'professor';
  await handler(new Request(origin + '/api/me', { headers }), '127.0.0.1');
  await handler(new Request(origin + '/api/me'), '127.0.0.1');
  assert.equal(observations.length, 1);
  order.length = 0;
  await handler(new Request(origin + '/api/learning/session/create', { method: 'POST', headers: { ...headers, origin, 'content-type': 'application/json' }, body: '{}' }), '127.0.0.1');
  assert.deepEqual(order, ['zone', 'create']);
});

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
const isolated = { skip: !database };
async function fixture() {
  assert.ok(database); const url = new URL(database);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/p2_test');
  const admin = new Pool({ connectionString: database }); const guard = await admin.connect();
  await guard.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  const schema = `profile_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  for (const name of ['p2-auth', 'p2-learning', 'p2-admin', 'p2-student-timezone']) await pool.query(await readFile(new URL(`../server/data/migrations/${name}.sql`, import.meta.url), 'utf8'));
  await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES
    ('student','Student','student@example.invalid',false),('other','Other','other@example.invalid',false),('prof','Professor','prof@example.invalid',false)`);
  await pool.query("INSERT INTO learning_users(id,role) VALUES ('student','student'),('other','student'),('prof','professor')");
  return { pool, cleanup: async () => {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await guard.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); guard.release(); await admin.end();
  } };
}

test('profile changes persist on the account without mutating roles, credentials or another user', isolated, async () => {
  const f = await fixture();
  try {
    const accounts = createAccountRepository(f.pool, approvedAccountAccess);
    const changed = await accounts.updateProfile({ userId: 'student' }, { name: '  Pablo  ', image: pixel });
    assert.equal(changed.name, 'Pablo'); assert.equal(changed.image, pixel); assert.equal(changed.role, 'student');
    assert.deepEqual(await accounts.me({ userId: 'student' }), changed);
    assert.equal((await accounts.me({ userId: 'other' })).name, 'Other');
    assert.equal((await f.pool.query('SELECT * FROM account')).rowCount, 0);
    await accounts.updateProfile({ userId: 'student' }, { name: 'Pablo', image: null });
    assert.equal((await accounts.me({ userId: 'student' })).image, null);
    await f.pool.query("UPDATE learning_users SET disabled=true WHERE id='student'");
    await assert.rejects(accounts.updateProfile({ userId: 'student' }, { name: 'Disabled', image: null }), /forbidden/);
    await assert.rejects(accounts.updateProfile({ userId: 'missing' }, { name: 'Missing', image: null }), /forbidden/);
    assert.equal((await f.pool.query('SELECT name FROM "user" WHERE id=$1', ['student'])).rows[0].name, 'Pablo');
  } finally { await f.cleanup(); }
});

test('legacy account IDs and malformed display names are cleaned only in the current-account response', isolated, async () => {
  const f = await fixture();
  try {
    const accounts = createAccountRepository(f.pool, approvedAccountAccess);
    await f.pool.query('UPDATE "user" SET name=id WHERE id=$1', ['student']);
    assert.equal((await accounts.me({ userId: 'student' })).name, '');
    assert.equal((await f.pool.query('SELECT name FROM "user" WHERE id=$1', ['student'])).rows[0].name, 'student');
    const legacy = '  ' + 'a'.repeat(90) + '\n';
    await f.pool.query('UPDATE "user" SET name=$2 WHERE id=$1', ['other', legacy]);
    assert.equal((await accounts.me({ userId: 'other' })).name, 'a'.repeat(80));
    assert.equal((await f.pool.query('SELECT name FROM "user" WHERE id=$1', ['other'])).rows[0].name, legacy);
  } finally { await f.cleanup(); }
});

test('automatic timezone initialization and concurrent observations are validated, own-only and idempotent', isolated, async () => {
  const f = await fixture();
  try {
    const zone = createStudentTimeZoneRepository(f.pool, { userId: 'student' });
    for (const value of [null, '', 'Not/AZone', 'EST', '+03:00']) assert.equal(await zone.observe(value), null);
    assert.equal(await zone.read(), null);
    const values = await Promise.all([zone.observe('Europe/Istanbul'), zone.observe('Europe/Istanbul')]);
    assert.deepEqual(values[0], values[1]); assert.equal(values[0]?.revision, 1);
    assert.equal((await f.pool.query('SELECT * FROM learning_student_timezones')).rowCount, 1);
    assert.equal(await createStudentTimeZoneRepository(f.pool, { userId: 'other' }).read(), null);
    await assert.rejects(createStudentTimeZoneRepository(f.pool, { userId: 'prof' }).observe('UTC'), /forbidden/);
    await f.pool.query("UPDATE learning_users SET disabled=true WHERE id='student'");
    await assert.rejects(zone.observe('UTC'), /forbidden/);
  } finally { await f.cleanup(); }
});

test('observed timezone changes append server-effective history without relabeling prior settings', isolated, async () => {
  const f = await fixture();
  try {
    await f.pool.query("INSERT INTO learning_student_timezones VALUES ('student',1,'UTC','2026-01-01T00:00:00Z')");
    const zone = createStudentTimeZoneRepository(f.pool, { userId: 'student' });
    const changed = await zone.observe('America/New_York');
    assert.equal(changed?.revision, 2); assert.equal(changed?.timeZone, 'America/New_York');
    assert.equal(await zone.observe('Invalid/Zone'), null);
    assert.deepEqual(await zone.read(), changed);
    const { rows } = await f.pool.query('SELECT revision,time_zone,effective_at FROM learning_student_timezones ORDER BY revision');
    assert.equal(rows.length, 2); assert.equal(rows[0].time_zone, 'UTC');
    assert.equal(rows[0].effective_at.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.ok(rows[1].effective_at > rows[0].effective_at);
  } finally { await f.cleanup(); }
});
