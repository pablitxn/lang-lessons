import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { DEFAULT_SETTINGS } from '../src/contracts';
import { createLearnerPreferencesRepository, validateLearnerPreferences } from '../server/accounts/preferences';
import { createLearningHttpHandler, type LearningHttpServices } from '../server/learning-http';
import { RepositoryError } from '../server/data/database';

test('account preferences require the complete exact schema and reject extra fields or coercible modes', () => {
  assert.deepEqual(validateLearnerPreferences(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  const { theme: _theme, ...missingTheme } = DEFAULT_SETTINGS;
  void _theme;
  for (const value of [null, [], missingTheme, { ...DEFAULT_SETTINGS, theme: undefined },
    { ...DEFAULT_SETTINGS, untimedHelp: undefined }, { ...DEFAULT_SETTINGS, sentenceTense: undefined },
    { ...DEFAULT_SETTINGS, role: 'administrator' }, { ...DEFAULT_SETTINGS, schemaVersion: 2 },
    { ...DEFAULT_SETTINGS, helpEnabled: 'true' }, { ...DEFAULT_SETTINGS, theme: 'sepia' },
    { ...DEFAULT_SETTINGS, preferredMode: ['sentence'] }, { ...DEFAULT_SETTINGS, sentenceTense: 'future-unknown' },
    { ...DEFAULT_SETTINGS, difficulty: { grammar: 1, vocabulary: 1, secret: true } },
    { ...DEFAULT_SETTINGS, difficulty: { grammar: 0, vocabulary: 1 } }]) {
    assert.throws(() => validateLearnerPreferences(value), /invalid-input/);
  }
  const copy = validateLearnerPreferences(DEFAULT_SETTINGS);
  assert.notEqual(copy, DEFAULT_SETTINGS); assert.notEqual(copy.difficulty, DEFAULT_SETTINGS.difficulty);
});

const origin = 'http://127.0.0.1:5174';
test('preferences HTTP preserves authenticated identity, origin guards, body bounds and revision conflicts', async () => {
  let authenticated = true; let stale = false; const calls: unknown[] = [];
  const preferences = {
    read: async (identity: unknown) => { calls.push(['read', identity]); return { settings: null, revision: 0 }; },
    update: async (identity: unknown, input: unknown) => {
      calls.push(['update', identity, input]); if (stale) throw new RepositoryError('conflict');
      return { settings: DEFAULT_SETTINGS, revision: 1 };
    },
  };
  const services = { origin, allowRequest: async () => true, preferences,
    auth: { identity: async () => { if (!authenticated) throw new RepositoryError('unauthenticated'); return { userId: 'canonical-actor' }; } },
  } as unknown as LearningHttpServices;
  const handler = createLearningHttpHandler(services);
  const request = (input?: unknown, headers: Record<string, string> = {}) => handler(new Request(origin + '/api/learning/preferences', input === undefined ? { headers } : {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(input),
  }), '127.0.0.1');
  const initial = await request(); assert.equal(initial?.status, 200);
  assert.equal(initial?.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await initial?.json(), { settings: null, revision: 0 });
  assert.deepEqual(calls.at(-1), ['read', { userId: 'canonical-actor' }]);
  const input = { settings: DEFAULT_SETTINGS, expectedRevision: 0 };
  assert.equal((await request(input, { origin: 'https://other.invalid' }))?.status, 403);
  assert.equal((await request(input, { 'content-type': 'text/plain' }))?.status, 415);
  assert.equal((await request({ settings: 'x'.repeat(5000), expectedRevision: 0 }))?.status, 400);
  assert.equal(calls.length, 1);
  assert.equal((await request(input))?.status, 200);
  assert.deepEqual(calls.at(-1), ['update', { userId: 'canonical-actor' }, input]);
  stale = true; assert.equal((await request(input))?.status, 409);
  authenticated = false; const before = calls.length;
  assert.equal((await request())?.status, 401); assert.equal((await request(input))?.status, 401); assert.equal(calls.length, before);
});

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
const isolated = { skip: !database };
async function fixture() {
  assert.ok(database); const url = new URL(database);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/p2_test');
  const admin = new Pool({ connectionString: database }); const guard = await admin.connect();
  await guard.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  const schema = `preferences_${randomUUID().replaceAll('-', '')}`; await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  for (const name of ['p2-learning', 'account-preferences']) await pool.query(await readFile(new URL(`../server/data/migrations/${name}.sql`, import.meta.url), 'utf8'));
  await pool.query("INSERT INTO learning_users(id,role) VALUES ('student','student'),('other','student'),('professor','professor'),('administrator','administrator')");
  return { pool, repository: createLearnerPreferencesRepository(pool), cleanup: async () => {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await guard.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); guard.release(); await admin.end();
  } };
}

test('preferences persist all fields for each enabled actor and remain isolated across accounts', isolated, async () => {
  const f = await fixture();
  try {
    const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const, helpEnabled: true, untimedHelp: true,
      difficulty: { grammar: 3 as const, vocabulary: 2 as const }, preferredMode: 'sentence' as const, sentenceTense: 'past-perfect' as const };
    for (const userId of ['student', 'professor', 'administrator']) {
      assert.deepEqual(await f.repository.read({ userId }), { settings: null, revision: 0 });
      assert.deepEqual(await f.repository.update({ userId }, { settings, expectedRevision: 0 }), { settings, revision: 1 });
      assert.deepEqual(await createLearnerPreferencesRepository(f.pool).read({ userId }), { settings, revision: 1 });
    }
    assert.deepEqual(await f.repository.read({ userId: 'other' }), { settings: null, revision: 0 });
    assert.equal((await f.pool.query('SELECT * FROM learning_user_preferences')).rowCount, 3);
  } finally { await f.cleanup(); }
});

test('concurrent first and subsequent preference writes accept one revision without losing the winner', isolated, async () => {
  const f = await fixture(); const identity = { userId: 'student' };
  try {
    const first = { ...DEFAULT_SETTINGS, theme: 'dark' as const };
    const second = { ...DEFAULT_SETTINGS, helpEnabled: true };
    for (const expectedRevision of [0, 1]) {
      const results = await Promise.allSettled([
        f.repository.update(identity, { settings: first, expectedRevision }),
        f.repository.update(identity, { settings: second, expectedRevision }),
      ]);
      const winners = results.filter(result => result.status === 'fulfilled');
      const losers = results.filter(result => result.status === 'rejected');
      assert.equal(winners.length, 1); assert.equal(losers.length, 1);
      assert.match(losers[0]!.reason.message, /conflict/);
      assert.deepEqual(await f.repository.read(identity), winners[0]!.value);
      assert.equal(winners[0]!.value.revision, expectedRevision + 1);
    }
    assert.equal((await f.pool.query('SELECT * FROM learning_user_preferences')).rowCount, 1);
  } finally { await f.cleanup(); }
});

test('invalid, disabled and cross-account preference changes cannot mutate persisted values', isolated, async () => {
  const f = await fixture(); const identity = { userId: 'student' };
  try {
    await f.repository.update(identity, { settings: DEFAULT_SETTINGS, expectedRevision: 0 });
    for (const input of [{ settings: DEFAULT_SETTINGS, expectedRevision: 1, userId: 'other' },
      { settings: DEFAULT_SETTINGS, expectedRevision: -1 }, { settings: DEFAULT_SETTINGS, expectedRevision: 0.5 },
      { settings: DEFAULT_SETTINGS, expectedRevision: Number.MAX_SAFE_INTEGER },
      { settings: null, expectedRevision: 1 }, { settings: { ...DEFAULT_SETTINGS, password: 'not-accepted' }, expectedRevision: 1 }]) {
      assert.throws(() => f.repository.update(identity, input), /invalid-input/);
    }
    assert.deepEqual(await f.repository.read(identity), { settings: DEFAULT_SETTINGS, revision: 1 });
    assert.deepEqual(await f.repository.read({ userId: 'other' }), { settings: null, revision: 0 });
    await f.pool.query("UPDATE learning_users SET disabled=true WHERE id='student'");
    await assert.rejects(f.repository.read(identity), /forbidden/);
    await assert.rejects(f.repository.update(identity, { settings: DEFAULT_SETTINGS, expectedRevision: 1 }), /forbidden/);
    await assert.rejects(f.repository.read({ userId: 'missing' }), /forbidden/);
    await assert.rejects(f.repository.update({ userId: 'missing' }, { settings: DEFAULT_SETTINGS, expectedRevision: 0 }), /forbidden/);
    assert.equal((await f.pool.query("SELECT revision FROM learning_user_preferences WHERE user_id='student'")).rows[0].revision, 1);
  } finally { await f.cleanup(); }
});


test('legacy account preferences adopt English and French selection remains an exact validated preference', () => {
  const { learningLanguage: _language, ...legacy } = DEFAULT_SETTINGS;
  assert.equal(validateLearnerPreferences(legacy).learningLanguage, 'en');
  assert.equal(validateLearnerPreferences({ ...DEFAULT_SETTINGS, learningLanguage: 'fr' }).learningLanguage, 'fr');
  assert.throws(() => validateLearnerPreferences({ ...DEFAULT_SETTINGS, learningLanguage: 'de' }), /invalid-input/);
});


test('French preferences survive repository recreation and legacy account snapshots remain readable', isolated, async () => {
  const f = await fixture(); const identity = { userId: 'student' };
  try {
    const { learningLanguage: _language, ...legacy } = DEFAULT_SETTINGS;
    await f.pool.query('INSERT INTO learning_user_preferences(user_id,revision,settings) VALUES ($1,1,$2)', [identity.userId, JSON.stringify(legacy)]);
    assert.equal((await f.repository.read(identity)).settings?.learningLanguage, 'en');
    const settings = { ...DEFAULT_SETTINGS, learningLanguage: 'fr' as const };
    assert.deepEqual(await f.repository.update(identity, { settings, expectedRevision: 1 }), { settings, revision: 2 });
    assert.deepEqual(await createLearnerPreferencesRepository(f.pool).read(identity), { settings, revision: 2 });
    await assert.rejects(f.repository.update(identity, { settings: DEFAULT_SETTINGS, expectedRevision: 1 }), /conflict/);
    assert.equal((await f.repository.read(identity)).settings?.learningLanguage, 'fr');
  } finally { await f.cleanup(); }
});
