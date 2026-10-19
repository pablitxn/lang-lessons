import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createActivePracticeRepository } from '../server/data/active-practice';
import { createLearningRepository, type DataPolicy } from '../server/data/repository';
import { createRecoveryRepository } from '../server/data/recovery';
import { createUsageRepository } from '../server/data/usage';
import { createBrokerAuthority } from '../server/broker/authority';
import { OPENAI_CALL_LIFETIME_MS } from '../server/broker/lifetime';
import { createLearningHttpHandler, type LearningHttpServices } from '../server/learning-http';
import { RepositoryError } from '../server/data/database';
import type { PracticeEvent, LessonMode } from '../src/contracts';

const origin = 'http://127.0.0.1:5174';
test('entry HTTP uses the authenticated actor, supports current reads and preserves legacy create response shape', async () => {
  const envelope = { session: { sessionId: 'canonical', mode: 'sentence', status: 'open', revision: 2 }, callState: 'none' };
  const calls: unknown[] = []; let signedIn = true; let conflict = false;
  const services = { origin, allowRequest: async () => true,
    auth: { identity: async () => { if (!signedIn) throw new RepositoryError('unauthenticated'); return { userId: 'owner' }; } },
    activePractice: {
      enter: async (identity: unknown, input: unknown) => { calls.push(['enter', identity, input]); if (conflict) throw new RepositoryError('conflict'); return envelope; },
      readCurrent: async (identity: unknown) => { calls.push(['current', identity]); return envelope; },
    },
    timeZone: () => ({ observe: async (zone: unknown) => calls.push(['zone', zone]) }),
  } as unknown as LearningHttpServices;
  const handler = createLearningHttpHandler(services);
  const send = (path: string, input?: unknown, extra: Record<string, string> = {}) => handler(new Request(origin + '/api/learning/session/' + path,
    input === undefined ? {} : { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-learning-time-zone': 'Africa/Casablanca', ...extra }, body: JSON.stringify(input) }), '127.0.0.1');
  const input = { mode: 'sentence', operationId: 'enter' };
  const result = await send('enter', input); assert.equal(result?.status, 200); assert.deepEqual(await result?.json(), envelope);
  assert.deepEqual(calls, [['zone', 'Africa/Casablanca'], ['enter', { userId: 'owner' }, input]]);
  assert.deepEqual(await (await send('create', input))?.json(), envelope.session);
  assert.deepEqual(await (await send('current'))?.json(), envelope);
  assert.deepEqual(calls.at(-1), ['current', { userId: 'owner' }]);
  const before = calls.length;
  assert.equal((await send('enter', input, { origin: 'https://other.invalid' }))?.status, 403); assert.equal(calls.length, before);
  conflict = true; assert.equal((await send('enter', input))?.status, 409);
  signedIn = false; assert.equal((await send('current'))?.status, 401); assert.equal((await send('enter', input))?.status, 401);
});

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
const isolated = { skip: !database };
const policy: DataPolicy = { allowStructuredStorage: true, activePractice: true, providerCallLifetimeMs: OPENAI_CALL_LIFETIME_MS, access: { grants: role => role === 'student' ? ['practice:own'] : [] } };
const alice = { userId: 'alice' };
async function fixture() {
  assert.ok(database); const url = new URL(database);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/p2_test');
  const admin = new Pool({ connectionString: database }); const guard = await admin.connect();
  await guard.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  const schema = `active_${randomUUID().replaceAll('-', '')}`; await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  for (const name of ['p2-learning', 'p2-day-projection', 'p2-usage', 'p2-call-history', 'active-practice', 'practice-reentry']) await pool.query(await readFile(new URL(`../server/data/migrations/${name}.sql`, import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../server/broker/receipts.sql', import.meta.url), 'utf8'));
  await pool.query("INSERT INTO learning_users(id,role) VALUES ('alice','student'),('bob','student'),('professor','professor')");
  const active = createActivePracticeRepository(pool, policy);
  const repository = createLearningRepository(pool, alice, policy);
  const broker = createBrokerAuthority({ pool, access: policy.access, origin, activePractice: true, providerCallLifetimeMs: OPENAI_CALL_LIFETIME_MS, allowRequest: async () => true, auth: {} as LearningHttpServices['auth'] });
  return { pool, active, repository, broker,
    enter: (mode: LessonMode, operationId: string = randomUUID()) => active.enter(alice, { mode, operationId }),
    cleanup: async () => {
      await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await guard.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); guard.release(); await admin.end();
    },
  };
}

test('concurrent and repeated direct entries select one canonical session and stale replay cannot switch modes', isolated, async () => {
  const f = await fixture();
  try {
    assert.equal(await f.active.readCurrent(alice), null);
    const entries = await Promise.all(Array.from({ length: 8 }, (_, i) => f.enter('verb-image', i < 4 ? 'duplicate' : `parallel-${i}`)));
    assert.equal(new Set(entries.map(entry => entry.session.sessionId)).size, 1);
    const first = entries[0]!; assert.equal(first.callState, 'none');
    assert.deepEqual(await f.enter('verb-image', 'reload'), first);
    assert.equal((await f.pool.query('SELECT * FROM learning_sessions')).rowCount, 1);
    assert.equal((await f.pool.query('SELECT * FROM learning_active_practice')).rowCount, 1);
    const next = await f.enter('sentence', 'switch'); assert.notEqual(next.session.sessionId, first.session.sessionId);
    await assert.rejects(f.enter('verb-image', 'duplicate'), /conflict/);
    await assert.rejects(f.enter('verb-visible', 'switch'), /conflict/);
    assert.deepEqual(await f.active.readCurrent(alice), next);
    assert.equal((await f.pool.query('SELECT * FROM learning_sessions')).rowCount, 2);
  } finally { await f.cleanup(); }
});

test('switching all modes retains canonical progress and only the current practice is discoverable', isolated, async () => {
  const f = await fixture();
  try {
    const first = await f.enter('verb-image'); const sessionId = first.session.sessionId;
    await f.repository.registerInstance({ sessionId, exerciseId: 'issued', generation: 0 });
    const event: PracticeEvent = { schemaVersion: 1, eventId: 'written', kind: 'attempt-result', source: 'typed', trust: 'client-reported', result: 'accepted',
      ref: { sessionId, exerciseId: 'issued', generation: 0, obligation: 'spelling:past', attemptId: 'attempt', revision: 1 } };
    assert.equal((await f.repository.submit(sessionId, [event])).status, 'committed');
    const usage = createUsageRepository(f.pool, alice, policy);
    const streamId = await usage.openWrittenStream(sessionId);
    for (const [i, kind] of (['visible', 'input'] as const).entries()) await usage.written({ schemaVersion: 1, sessionId, streamId, eventId: `usage-${i}`, sequence: i + 1, kind });
    const ids = [sessionId];
    for (const mode of ['verb-visible', 'sentence'] as const) {
      const entry = await f.enter(mode); ids.push(entry.session.sessionId);
      const available = await createRecoveryRepository(f.pool, alice, policy).listOpen();
      assert.deepEqual(available.items, [entry.session]);
    }
    const stream = (await f.pool.query('SELECT visible,active_interval_id FROM learning_time_streams WHERE id=$1', [streamId])).rows[0];
    assert.deepEqual(stream, { visible: false, active_interval_id: null });
    // A queued result from the previous mode can still be committed after entry changes.
    assert.equal((await f.repository.submit(sessionId, [{ ...event, eventId: 'written-late', ref: { ...event.ref, revision: 2 } }])).status, 'committed');
    for (const [i, mode] of (['verb-image', 'verb-visible', 'sentence'] as const).entries()) assert.equal((await f.enter(mode)).session.sessionId, ids[i]);
    assert.equal((await f.pool.query('SELECT * FROM learning_sessions')).rowCount, 3);
    assert.equal((await f.pool.query('SELECT * FROM learning_events')).rowCount, 2);
    assert.equal((await f.pool.query('SELECT journal_revision FROM learning_sessions WHERE id=$1', [sessionId])).rows[0].journal_revision, 2);
    assert.equal((await f.pool.query('SELECT * FROM learning_closes')).rowCount, 0);
  } finally { await f.cleanup(); }
});

test('legacy entries choose the newest owned open mode deterministically without changing historical rows', isolated, async () => {
  const f = await fixture();
  try {
    await f.pool.query(`INSERT INTO learning_sessions(id,user_id,mode,status,started_at) VALUES
      ('older','alice','sentence','open','2026-01-01'),('newer-a','alice','sentence','open','2026-02-01'),
      ('newer-z','alice','sentence','open','2026-02-01'),('closed','alice','sentence','closed','2026-03-01'),
      ('legacy-null','alice','sentence','open',NULL),('other','bob','sentence','open','2026-04-01')`);
    assert.equal((await f.enter('sentence')).session.sessionId, 'newer-z');
    assert.equal((await f.pool.query('SELECT * FROM learning_sessions')).rowCount, 6);
    assert.equal(await f.active.readCurrent({ userId: 'bob' }), null);
    assert.equal((await f.active.enter({ userId: 'bob' }, { mode: 'sentence', operationId: 'bob-entry' })).session.sessionId, 'other');
    await assert.rejects(f.pool.query("UPDATE learning_active_practice SET session_id='other' WHERE user_id='alice'"), /foreign key|unique/);
  } finally { await f.cleanup(); }
});

test('safe orphan segments are ended during direct entry while recorded progress and call history remain', isolated, async () => {
  const f = await fixture();
  try {
    for (const state of [null, 'rejected', 'ended'] as const) {
      const entry = await f.enter('verb-image');
      const started = await f.repository.commands.startCall({ sessionId: entry.session.sessionId, expectedRevision: entry.session.revision, operationId: randomUUID() });
      if (state) {
        const binding = await f.broker.reserve(alice, started.segment, randomUUID());
        await f.broker[state](binding);
      }
      const restored = await f.enter('verb-image');
      assert.equal(restored.session.sessionId, entry.session.sessionId); assert.equal(restored.callState, 'none');
      assert.equal(restored.session.revision, started.session.revision + 1);
      assert.equal((await f.pool.query('SELECT ended FROM learning_segments WHERE id=$1', [started.segment.segmentId])).rows[0].ended, true);
    }
    assert.equal((await f.pool.query('SELECT * FROM learning_segments')).rowCount, 3);
    assert.equal((await f.pool.query('SELECT * FROM learning_broker_receipts')).rowCount, 2);
  } finally { await f.cleanup(); }
});

test('returning to a mode retains its previously selected older legacy record after a call expires', isolated, async () => {
  const f = await fixture();
  try {
    await f.pool.query(`INSERT INTO learning_sessions(id,user_id,mode,started_at) VALUES
      ('older-selected','alice','verb-image','2026-01-01'),('newer-duplicate','alice','verb-image','2026-02-01')`);
    await f.pool.query("INSERT INTO learning_segments(id,session_id,epoch) VALUES ('older-call','older-selected',1)");
    await f.pool.query(`INSERT INTO learning_broker_receipts(segment_id,session_id,user_id,epoch,token_digest,state)
      VALUES ('older-call','older-selected','alice',1,'older-digest','created')`);
    assert.equal((await f.enter('verb-image')).session.sessionId, 'older-selected');
    await f.pool.query("UPDATE learning_broker_receipts SET created_at=clock_timestamp()-interval '66 minutes'");
    assert.equal((await f.enter('verb-image')).callState, 'none');
    for (const mode of ['verb-visible', 'sentence'] as const) {
      await f.enter(mode);
      assert.equal((await f.enter('verb-image')).session.sessionId, 'older-selected');
    }
    assert.equal((await f.pool.query("SELECT * FROM learning_sessions WHERE mode='verb-image'")).rowCount, 2);
    assert.equal((await f.pool.query("SELECT last_entered_at FROM learning_sessions WHERE id='newer-duplicate'")).rows[0].last_entered_at, null);
  } finally { await f.cleanup(); }
});

test('live and uncertain calls survive same-mode entry and block switching until explicitly released', isolated, async () => {
  const f = await fixture();
  try {
    const entry = await f.enter('verb-image');
    const started = await f.repository.commands.startCall({ sessionId: entry.session.sessionId, expectedRevision: entry.session.revision, operationId: 'call' });
    const binding = await f.broker.reserve(alice, started.segment, 'fixture-token');
    for (const [state, status] of [['reserved', 'uncertain'], ['created', 'active']] as const) {
      if (state === 'created') await f.broker.created(binding, 'fixture-provider-call');
      const current = await f.enter('verb-image'); assert.equal(current.callState, status); assert.deepEqual(current.session, started.session);
      await assert.rejects(f.enter('sentence'), /conflict/);
      assert.deepEqual(await f.active.readCurrent(alice), current);
      assert.equal((await f.pool.query('SELECT * FROM learning_sessions')).rowCount, 1);
      assert.equal((await f.pool.query('SELECT ended FROM learning_segments')).rows[0].ended, false);
      assert.equal((await f.pool.query('SELECT state FROM learning_broker_receipts')).rows[0].state, state);
    }
    await f.broker.ended(binding);
    assert.equal((await f.enter('sentence')).callState, 'none');
    assert.equal((await f.pool.query('SELECT ended FROM learning_segments')).rows[0].ended, true);
  } finally { await f.cleanup(); }
});

test('current reads expose legacy outstanding calls even without a pointer and never mutate them', isolated, async () => {
  const f = await fixture();
  try {
    const session = await createLearningRepository(f.pool, alice, { ...policy, activePractice: false }).commands.create({ mode: 'sentence', operationId: 'legacy' });
    await f.pool.query("INSERT INTO learning_segments(id,session_id,epoch) VALUES ('legacy-call',$1,1)", [session.sessionId]);
    await f.pool.query("INSERT INTO learning_broker_receipts(segment_id,session_id,user_id,epoch,token_digest,state) VALUES ('legacy-call',$1,'alice',1,'digest','created')", [session.sessionId]);
    assert.deepEqual(await f.active.readCurrent(alice), { session, callState: 'active' });
    assert.equal((await f.pool.query('SELECT * FROM learning_active_practice')).rowCount, 0);
    await assert.rejects(f.enter('verb-image'), /conflict/);
    assert.deepEqual(await f.enter('sentence'), { session, callState: 'active' });
    assert.equal((await f.pool.query('SELECT * FROM learning_active_practice')).rowCount, 1);
    assert.equal(await f.active.readCurrent({ userId: 'bob' }), null);
  } finally { await f.cleanup(); }
});

test('the provider lifetime expires stale transport receipts without rewriting connection evidence', isolated, async () => {
  const f = await fixture();
  try {
    for (const state of ['reserved', 'created'] as const) {
      const entry = await f.enter('sentence');
      const started = await f.repository.commands.startCall({ sessionId: entry.session.sessionId, expectedRevision: entry.session.revision, operationId: randomUUID() });
      const binding = await f.broker.reserve(alice, started.segment, randomUUID());
      if (state === 'created') {
        await f.broker.created(binding, 'fixture-call');
        await f.pool.query("INSERT INTO learning_call_observations(session_id,event_id,segment_id,epoch,kind) VALUES ($1,'connected',$2,$3,'connected')", [entry.session.sessionId, started.segment.segmentId, started.segment.connectionEpoch]);
      }
      await f.pool.query("UPDATE learning_broker_receipts SET created_at=clock_timestamp()-interval '64 minutes' WHERE segment_id=$1", [started.segment.segmentId]);
      assert.equal((await f.active.readCurrent(alice))?.callState, state === 'reserved' ? 'uncertain' : 'active');
      await assert.rejects(f.enter('verb-image'), /conflict/);
      await f.pool.query("UPDATE learning_broker_receipts SET created_at=clock_timestamp()-interval '66 minutes' WHERE segment_id=$1", [started.segment.segmentId]);
      const before = (await f.pool.query('SELECT * FROM learning_call_observations ORDER BY event_id')).rows;
      assert.equal((await f.active.readCurrent(alice))?.callState, 'none');
      assert.equal((await f.pool.query('SELECT state FROM learning_broker_receipts WHERE segment_id=$1', [started.segment.segmentId])).rows[0].state, state, 'Current reads do not mutate receipts');
      const restored = await f.enter('sentence'); assert.equal(restored.callState, 'none');
      assert.equal(restored.session.revision, started.session.revision + 1);
      const expired = (await f.pool.query('SELECT state,ended_at-created_at AS lifetime FROM learning_broker_receipts WHERE segment_id=$1', [started.segment.segmentId])).rows[0];
      assert.equal(expired.state, 'ended'); assert.equal(expired.lifetime.hours, 1); assert.equal(expired.lifetime.minutes, 5);
      assert.equal((await f.pool.query('SELECT ended FROM learning_segments WHERE id=$1', [started.segment.segmentId])).rows[0].ended, true);
      assert.deepEqual((await f.pool.query('SELECT * FROM learning_call_observations ORDER BY event_id')).rows, before);
      assert.equal((await f.pool.query('SELECT * FROM learning_feedback_jobs')).rowCount, 0);
      await f.enter('verb-image');
    }
  } finally { await f.cleanup(); }
});

test('new call starts expire an old transport atomically and keep the requested revision fence meaningful', isolated, async () => {
  const f = await fixture();
  try {
    const entry = await f.enter('sentence');
    const started = await f.repository.commands.startCall({ sessionId: entry.session.sessionId, expectedRevision: entry.session.revision, operationId: 'first' });
    const binding = await f.broker.reserve(alice, started.segment, 'expired-call'); await f.broker.created(binding, 'fixture-call');
    await f.pool.query("UPDATE learning_broker_receipts SET created_at=clock_timestamp()-interval '66 minutes'");
    await assert.rejects(f.repository.commands.startCall({ sessionId: entry.session.sessionId, expectedRevision: 0, operationId: 'stale' }), /conflict/);
    const next = await f.repository.commands.startCall({ sessionId: entry.session.sessionId, expectedRevision: started.session.revision, operationId: 'next' });
    assert.equal(next.segment.connectionEpoch, 2); assert.equal(next.session.revision, started.session.revision + 2);
    assert.equal((await f.pool.query('SELECT state FROM learning_broker_receipts')).rows[0].state, 'ended');
    assert.equal((await f.pool.query('SELECT * FROM learning_segments WHERE NOT ended')).rowCount, 1);
    await f.broker.reserve(alice, next.segment, 'next-call');
    assert.equal((await f.active.readCurrent(alice))?.callState, 'uncertain');
  } finally { await f.cleanup(); }
});

test('broker reservation reconciles expired receipts globally before allowing a new canonical call', isolated, async () => {
  const f = await fixture();
  try {
    const legacy = await createLearningRepository(f.pool, alice, { ...policy, activePractice: false }).commands.create({ mode: 'verb-image', operationId: 'legacy' });
    await f.pool.query("INSERT INTO learning_segments(id,session_id,epoch,ended) VALUES ('legacy-call',$1,1,true)", [legacy.sessionId]);
    const entry = await f.enter('sentence');
    const started = await f.repository.commands.startCall({ sessionId: entry.session.sessionId, expectedRevision: entry.session.revision, operationId: 'current-call' });
    await f.pool.query(`INSERT INTO learning_broker_receipts(segment_id,session_id,user_id,epoch,token_digest,state,created_at)
      VALUES ('legacy-call',$1,'alice',1,'old-digest','reserved',clock_timestamp()-interval '66 minutes')`, [legacy.sessionId]);
    await f.broker.reserve(alice, started.segment, 'current-token');
    assert.equal((await f.pool.query("SELECT state FROM learning_broker_receipts WHERE segment_id='legacy-call'")).rows[0].state, 'ended');
    assert.deepEqual((await f.pool.query("SELECT session_id FROM learning_broker_receipts WHERE state='reserved'")).rows.map(row => row.session_id), [entry.session.sessionId]);
  } finally { await f.cleanup(); }
});

test('stale tabs cannot start or reserve calls after switching and entry races never hijack a provider receipt', isolated, async () => {
  const f = await fixture();
  try {
    const first = await f.enter('verb-image');
    const started = await f.repository.commands.startCall({ sessionId: first.session.sessionId, expectedRevision: first.session.revision, operationId: 'old-call' });
    await f.enter('sentence');
    await assert.rejects(f.repository.commands.startCall({ sessionId: first.session.sessionId, expectedRevision: first.session.revision, operationId: 'old-call' }), /conflict/);
    await assert.rejects(f.broker.reserve(alice, started.segment, 'late-token'), /conflict/);
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await f.enter('verb-image');
      const call = await f.repository.commands.startCall({ sessionId: current.session.sessionId, expectedRevision: current.session.revision, operationId: randomUUID() });
      const [reservation, switching] = await Promise.allSettled([
        f.broker.reserve(alice, call.segment, randomUUID()), f.enter('sentence'),
      ]);
      assert.notEqual(reservation.status, switching.status);
      if (reservation.status === 'fulfilled') {
        assert.equal((await f.active.readCurrent(alice))?.session.sessionId, current.session.sessionId);
        await f.broker.rejected(reservation.value);
      } else {
        assert.equal((await f.active.readCurrent(alice))?.session.mode, 'sentence');
        assert.equal((await f.pool.query('SELECT ended FROM learning_segments WHERE id=$1', [call.segment.segmentId])).rows[0].ended, true);
      }
    }
  } finally { await f.cleanup(); }
});

test('entry validates exact input and rejects disabled or unauthorized users without creating practice', isolated, async () => {
  const f = await fixture();
  try {
    for (const input of [null, {}, { mode: ['sentence'], operationId: 'x' }, { mode: 'other', operationId: 'x' },
      { mode: 'sentence', operationId: '' }, { mode: 'sentence', operationId: 'x', userId: 'bob' }]) assert.throws(() => f.active.enter(alice, input), /invalid-input/);
    await assert.rejects(f.active.enter({ userId: 'professor' }, { mode: 'sentence', operationId: 'x' }), /forbidden/);
    await assert.rejects(f.active.readCurrent({ userId: 'missing' }), /forbidden/);
    await f.pool.query("UPDATE learning_users SET disabled=true WHERE id='alice'");
    await assert.rejects(f.enter('sentence'), /forbidden/); await assert.rejects(f.active.readCurrent(alice), /forbidden/);
    assert.equal((await f.pool.query('SELECT * FROM learning_sessions')).rowCount, 0);
  } finally { await f.cleanup(); }
});
