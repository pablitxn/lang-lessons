import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createDailyProgressRepository } from '../server/accounts/daily-progress';
import { createLearningRepository } from '../server/data/repository';
import type { PracticeEvent } from '../src/contracts/progress';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
async function fixture() {
  assert.ok(database); const url = new URL(database);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/p2_test');
  const admin = new Pool({ connectionString: database });
  // Better Auth introspects every accessible schema; serialize fixture lifetimes, not tested operations.
  const guard = await admin.connect(); await guard.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))"); const schema = `p2_daily_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  for (const file of ['p2-learning', 'p2-day-projection', 'p2-usage']) await pool.query(await readFile(new URL(`../server/data/migrations/${file}.sql`, import.meta.url), 'utf8'));
  await pool.query("INSERT INTO learning_users(id,role) VALUES ('student','student'),('other','student'),('prof','professor'),('admin','administrator')");
  const repo = createLearningRepository(pool, { userId: 'student' }, { allowStructuredStorage: true, access: { grants: () => ['practice:own'] }, evaluateClose: async () => 'not-requested' });
  async function visit(called: boolean) {
    const session = await repo.commands.create({ mode: 'verb-image', operationId: randomUUID() }); const id = session.sessionId;
    await repo.registerInstance({ sessionId: id, exerciseId: 'exercise', generation: 0 });
    const event: PracticeEvent = { schemaVersion: 1, eventId: 'same-id-per-visit', source: 'typed', trust: 'client-reported', kind: 'attempt-result', result: 'accepted',
      ref: { sessionId: id, exerciseId: 'exercise', generation: 0, obligation: 'spelling:past', attemptId: 'attempt', revision: 1 } };
    await repo.submit(id, [event]);
    if (called) await repo.commands.startCall({ sessionId: id, operationId: randomUUID(), expectedRevision: 0 });
    return { id, event, close: () => repo.commands.confirmClose({ sessionId: id, operationId: randomUUID(), expectedRevision: called ? 1 : 0, finalProgress: { sessionId: id, journalRevision: 1 } }) };
  }
  return { pool, repo, visit, cleanup: async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await guard.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); guard.release(); await admin.end(); } };
}
const isolated = { skip: !database };

test('P2 daily written events span called/no-call visits and survive close, replay and pagination', isolated, async () => {
  const f = await fixture();
  try {
    const first = await f.visit(false); const second = await f.visit(true);
    await first.close(); await second.close(); await f.repo.commands.create({ mode: 'sentence', operationId: 'third-visit' });
    await f.pool.query("UPDATE learning_events SET received_at='2026-10-18T12:00:00Z'");
    await f.pool.query("UPDATE learning_sessions SET started_at='2026-10-18T11:00:00Z',closed_at=CASE WHEN status='closed' THEN '2026-10-18T13:00:00Z'::timestamptz ELSE NULL END");
    const daily = createDailyProgressRepository(f.pool, { timeZone: 'UTC', eventAttribution: 'server-received' });
    const page = await daily.read({ userId: 'prof' }, 'student', { day: '2026-10-18', limit: 1 });
    assert.equal(page.writtenEvents.items.length, 1); assert.ok(page.writtenEvents.nextCursor);
    const next = await daily.read({ userId: 'prof' }, 'student', { day: '2026-10-18', limit: 1, eventCursor: page.writtenEvents.nextCursor });
    assert.equal(next.writtenEvents.items.length, 1); assert.equal(next.writtenEvents.nextCursor, null);
    assert.notEqual(next.writtenEvents.items[0]!.event.ref.sessionId, page.writtenEvents.items[0]!.event.ref.sessionId);
    assert.equal(page.totals, null); assert.equal(page.usageTime.totalMs, 0);
    const all = await daily.read({ userId: 'prof' }, 'student', { day: '2026-10-18' });
    assert.equal(all.writtenEvents.items.length, 2); assert.equal(all.sessions.items.length, 3);
    assert.equal(all.sessions.items.filter(s => s.closedAt !== null).length, 2);
    assert.ok(all.sessions.items.every(s => s.feedback === null && s.comment === null));
    assert.equal(all.hasUnattributedLegacyRecords, false);
    assert.equal((await daily.read({ userId: 'prof' }, 'other', { day: '2026-10-18' })).writtenEvents.items.length, 0);
  } finally { await f.cleanup(); }
});

test('P2 daily timezone remains unselected and explicit DST grouping uses a local calendar day', isolated, async () => {
  const f = await fixture();
  try {
    const first = await f.visit(false); const second = await f.visit(false);
    await f.pool.query("UPDATE learning_events SET received_at='2026-03-09T03:30:00Z' WHERE session_id=$1", [first.id]);
    await f.pool.query("UPDATE learning_events SET received_at='2026-03-09T04:00:00Z' WHERE session_id=$1", [second.id]);
    await assert.rejects(createDailyProgressRepository(f.pool).read({ userId: 'prof' }, 'student', { day: '2026-03-08' }), /policy-unresolved/);
    const daily = createDailyProgressRepository(f.pool, { timeZone: 'America/New_York', eventAttribution: 'server-received' });
    const result = await daily.read({ userId: 'prof' }, 'student', { day: '2026-03-08' });
    assert.equal(result.writtenEvents.items.length, 1); assert.equal(result.writtenEvents.items[0]!.event.ref.sessionId, first.id);
    await assert.rejects(daily.read({ userId: 'admin' }, 'student', { day: '2026-03-08' }), /forbidden/);
    await assert.rejects(daily.read({ userId: 'student' }, 'student', { day: '2026-03-08' }), /forbidden/);
    await assert.rejects(daily.read({ userId: 'prof' }, 'student', { day: '2026-02-30' }), /invalid-input/);
  } finally { await f.cleanup(); }
});

test('P2 daily projection preserves invalidations, excludes oral results and flags unattributed legacy rows', isolated, async () => {
  const f = await fixture();
  try {
    const visit = await f.visit(false);
    const invalidated: PracticeEvent = { schemaVersion: 1, eventId: 'invalidation', source: 'typed', trust: 'client-reported', kind: 'attempt-invalidated', ref: { ...visit.event.ref, revision: 2 } };
    await f.repo.submit(visit.id, [invalidated, { ...visit.event, eventId: 'oral', source: 'audio', ref: { ...visit.event.ref, obligation: 'pronunciation:past' } }]);
    await f.pool.query("UPDATE learning_events SET received_at='2026-10-18T12:00:00Z'");
    const daily = createDailyProgressRepository(f.pool, { timeZone: 'UTC', eventAttribution: 'server-received' });
    const day = await daily.read({ userId: 'prof' }, 'student', { day: '2026-10-18' });
    assert.equal(day.writtenEvents.items.length, 2); assert.ok(day.writtenEvents.items.some(row => row.event.kind === 'attempt-invalidated'));
    await f.pool.query("UPDATE learning_events SET received_at=NULL,event_payload=NULL WHERE event_id='same-id-per-visit'");
    await f.pool.query('UPDATE learning_sessions SET started_at=NULL');
    const legacy = await daily.read({ userId: 'prof' }, 'student', { day: '2026-10-18' });
    assert.equal(legacy.sessions.items[0]?.startedAt, null);
    assert.equal(legacy.hasUnattributedLegacyRecords, true); assert.equal(legacy.writtenEvents.items.length, 1);
    assert.equal((await f.pool.query('SELECT * FROM learning_events')).rowCount, 3);
  } finally { await f.cleanup(); }
});
