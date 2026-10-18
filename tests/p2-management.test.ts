import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createUserManagementRepository } from '../server/accounts/management';
import { approvedAccountAccess } from '../server/accounts/approved-policy';
import { createAccountRepository } from '../server/accounts/repository';
import { transaction } from '../server/data/database';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
const isolated = { skip: !database };
async function fixture() {
  assert.ok(database); const url = new URL(database);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/p2_test');
  const admin = new Pool({ connectionString: database }); const schema = `p2_management_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  for (const name of ['p2-auth', 'p2-learning', 'p2-admin']) {
    await transaction(pool, async client => { await client.query(await readFile(new URL(`../server/data/migrations/${name}.sql`, import.meta.url), 'utf8')); });
  }
  await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES
    ('admin','admin','admin@example.invalid',false),('prof','prof','prof@example.invalid',false),('student','student','student@example.invalid',false)`);
  await pool.query("INSERT INTO learning_users(id,role) VALUES ('admin','administrator'),('prof','professor'),('student','student')");
  return { pool, repo: createUserManagementRepository(pool), cleanup: async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); } };
}
const actor = { userId: 'admin' };
const createInput = () => ({ operationId: randomUUID(), email: 'new@example.invalid', role: 'student' as const, disabled: false });

test('P2 approved management policy grants only bounded admin operations and professor all-student lists', () => {
  assert.deepEqual(approvedAccountAccess.grants('administrator'), ['users:list', 'users:manage']);
  assert.deepEqual(approvedAccountAccess.grants('professor'), ['students:list', 'students:daily-progress:read']);
  assert.deepEqual(approvedAccountAccess.grants('student'), []);
});

test('P2 admin creates matching auth/application records once without credentials or verified email', isolated, async () => {
  const f = await fixture();
  try {
    const input = createInput(); const results = await Promise.all([f.repo.create(actor, input), f.repo.create(actor, input)]);
    assert.deepEqual(results[0], results[1]); const result = results[0]!;
    assert.equal(result.credentialSetup, 'pending-policy'); assert.equal(result.user.revision, 0); assert.equal(result.user.disabled, false);
    const users = await f.pool.query('SELECT id,email,"emailVerified" FROM "user" WHERE id=$1', [result.user.id]);
    assert.equal(users.rowCount, 1); assert.equal(users.rows[0].emailVerified, false);
    assert.equal((await f.pool.query('SELECT * FROM account')).rowCount, 0);
    await assert.rejects(f.repo.create(actor, { ...input, role: 'professor' }), /conflict/);
    await assert.rejects(f.repo.create(actor, { ...input, operationId: 'another', email: 'NEW@example.invalid' }), /conflict/);
    assert.equal((await f.pool.query('SELECT * FROM learning_users')).rowCount, 4);
    const first = await f.repo.list(actor, null, 2); assert.equal(first.items.length, 2); assert.ok(first.nextCursor);
    const second = await f.repo.list(actor, first.nextCursor, 2); assert.equal(second.items.length, 2); assert.equal(second.nextCursor, null);
    assert.ok(first.items.every(item => !('email' in item) && !('password' in item)));
    assert.throws(() => f.repo.create(actor, { ...createInput(), password: 'not-accepted' } as ReturnType<typeof createInput>), /invalid-input/);
  } finally { await f.cleanup(); }
});

test('P2 management denies students, professors, disabled admins and stale role sessions', isolated, async () => {
  const f = await fixture();
  try {
    for (const userId of ['student', 'prof', 'missing']) {
      await assert.rejects(f.repo.create({ userId }, createInput()), /forbidden/);
      await assert.rejects(f.repo.list({ userId }), /forbidden/);
      await assert.rejects(f.repo.update({ userId }, { kind: 'set-role', userId: 'student', role: 'administrator', expectedRevision: 0, operationId: randomUUID() }), /forbidden/);
    }
    const accounts = createAccountRepository(f.pool, approvedAccountAccess);
    assert.equal((await accounts.listAllStudents({ userId: 'prof' })).items.length, 1);
    await assert.rejects(accounts.readProgressPage({ userId: 'prof' }, 'student'), /forbidden/);
    await assert.rejects(accounts.readProgressPage(actor, 'student'), /forbidden/);
    await f.pool.query("UPDATE learning_users SET disabled=true WHERE id='admin'");
    await assert.rejects(f.repo.list(actor), /forbidden/);
    await f.pool.query("UPDATE learning_users SET disabled=false,role='student' WHERE id='admin'");
    await assert.rejects(f.repo.list(actor), /forbidden/);
  } finally { await f.cleanup(); }
});

test('P2 last enabled administrator cannot be demoted or disabled, including concurrent self-removals', isolated, async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.repo.update(actor, { operationId: 'disable-last', userId: 'admin', expectedRevision: 0, kind: 'set-disabled', disabled: true }), /conflict/);
    await assert.rejects(f.repo.update(actor, { operationId: 'demote-last', userId: 'admin', expectedRevision: 0, kind: 'set-role', role: 'student' }), /conflict/);
    const second = await f.repo.create(actor, { ...createInput(), role: 'administrator', disabled: true });
    await assert.rejects(f.repo.update(actor, { operationId: 'disabled-does-not-count', userId: 'admin', expectedRevision: 0, kind: 'set-disabled', disabled: true }), /conflict/);
    await f.repo.update(actor, { operationId: 'enable-second', userId: second.user.id, expectedRevision: 0, kind: 'set-disabled', disabled: false });
    await assert.rejects(f.repo.update(actor, { operationId: 'pending-admin-does-not-count', userId: 'admin', expectedRevision: 0, kind: 'set-disabled', disabled: true }), /conflict/);
    // Fixture credential rows only; production credential handoff remains unimplemented.
    await f.pool.query('INSERT INTO account(id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$1,$2,$1,$3,CURRENT_TIMESTAMP),($4,$4,$2,$4,$3,CURRENT_TIMESTAMP)', ['admin', 'credential', 'fixture-only-placeholder', second.user.id]);
    const race = await Promise.allSettled([
      f.repo.update(actor, { operationId: 'self-disable', userId: 'admin', expectedRevision: 0, kind: 'set-disabled', disabled: true }),
      f.repo.update({ userId: second.user.id }, { operationId: 'second-self-demote', userId: second.user.id, expectedRevision: 1, kind: 'set-role', role: 'student' }),
    ]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(race.filter(r => r.status === 'rejected').length, 1);
    assert.equal((await f.pool.query("SELECT id FROM learning_users WHERE role='administrator' AND NOT disabled")).rowCount, 1);
  } finally { await f.cleanup(); }
});

test('P2 management revisions, replay conflicts and deactivate/reactivate session revocation', isolated, async () => {
  const f = await fixture();
  try {
    const change = { operationId: 'promote', userId: 'student', expectedRevision: 0, kind: 'set-role' as const, role: 'professor' as const };
    const changed = await f.repo.update(actor, change); assert.equal(changed.revision, 1);
    assert.deepEqual(await f.repo.update(actor, change), changed);
    await assert.rejects(f.repo.update(actor, { ...change, role: 'administrator' }), /conflict/);
    await assert.rejects(f.repo.update(actor, { ...change, operationId: 'stale' }), /conflict/);
    await f.pool.query('INSERT INTO session(id,token,"expiresAt","updatedAt","userId") VALUES ($1,$2,CURRENT_TIMESTAMP+interval \'1 hour\',CURRENT_TIMESTAMP,$3)', ['session', 'fixture-session-token', 'student']);
    const disabled = await f.repo.update(actor, { operationId: 'disable', userId: 'student', expectedRevision: 1, kind: 'set-disabled', disabled: true });
    assert.equal(disabled.disabled, true); assert.equal((await f.pool.query('SELECT * FROM session')).rowCount, 0);
    const enabled = await f.repo.update(actor, { operationId: 'enable', userId: 'student', expectedRevision: 2, kind: 'set-disabled', disabled: false });
    assert.equal(enabled.disabled, false); assert.equal(enabled.revision, 3);
    assert.ok((await f.pool.query("SELECT auth_valid_after FROM learning_users WHERE id='student'")).rows[0].auth_valid_after);
  } finally { await f.cleanup(); }
});

test('P2 management auth/application insertion rolls back together and admin migration preserves existing users', isolated, async () => {
  const f = await fixture();
  try {
    await f.pool.query("CREATE FUNCTION fail_create() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$");
    await f.pool.query('CREATE TRIGGER fail_create BEFORE INSERT ON learning_users FOR EACH ROW EXECUTE FUNCTION fail_create()');
    await assert.rejects(f.repo.create(actor, createInput()), /fixture failure/);
    assert.equal((await f.pool.query('SELECT * FROM "user"')).rowCount, 3);
    assert.equal((await f.pool.query('SELECT * FROM learning_operations')).rowCount, 0);
    assert.equal((await f.repo.list(actor)).items.find(item => item.id === 'admin')?.revision, 0);
    await assert.rejects(transaction(f.pool, async client => { await client.query(await readFile(new URL('../server/data/migrations/p2-admin.sql', import.meta.url), 'utf8')); }), /already exists/);
    assert.equal((await f.pool.query('SELECT * FROM learning_users')).rowCount, 3);
  } finally { await f.cleanup(); }
});
