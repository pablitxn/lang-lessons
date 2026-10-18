import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrateLearningDatabase } from '../server/data/migrations';
import { createApplicationServices } from '../server/application-services';
import { clientCallTimeForWindows } from '../server/data/client-call-time';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
test('direct WebRTC closes unknown history after cleanup with explicit insufficient evidence; client time stays separate', { skip: !database }, async () => {
  assert.ok(database); const url = new URL(database); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/p2_test');
  const admin = new Pool({ connectionString: database }); const schema = `direct_${randomUUID().replaceAll('-', '')}`;
  const lock = await admin.connect(); await lock.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  await admin.query(`CREATE SCHEMA ${schema}`); const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  try {
    await migrateLearningDatabase(pool); assert.deepEqual(await migrateLearningDatabase(pool), []);
    await pool.query("INSERT INTO learning_users(id,role) VALUES ('student','student'),('other','student')");
    let terminate = false; let cleanups = 0;
    const services = createApplicationServices({ pool, origin: 'http://127.0.0.1:5174', secret: randomUUID()+randomUUID(),
      login: { sessionExpiresIn: 3600, sessionUpdateAge: 300, sessionFreshAge: 300, minPasswordLength: 12, maxPasswordLength: 128, allowRememberMe: false, refreshSessions: false, rateLimitWindow: 60, rateLimitMax: 10 },
      allowRequest: async () => true, terminateProviderCall: async () => { cleanups++; return terminate; } });
    const actor = { userId: 'student' }; const repo = services.learning(actor);
    const session = await repo.commands.create({ operationId: 'create', mode: 'verb-image' });
    const call = await repo.commands.startCall({ sessionId: session.sessionId, operationId: 'start', expectedRevision: 0 });
    assert.equal((await services.recovery!(actor).readCallHistory(session.sessionId)).hadConnectedCall, null);
    const broker = await services.brokerAuthority!.reserve(actor, call.segment, randomUUID()); await services.brokerAuthority!.created(broker, 'rtc_fixture');
    const close = { sessionId: session.sessionId, operationId: 'close', expectedRevision: 1, finalProgress: { sessionId: session.sessionId, journalRevision: 0 } };
    await assert.rejects(repo.commands.confirmClose(close));
    await assert.rejects(services.reconcile!(actor, { sessionId: session.sessionId, intent: 'finalize' }));
    const now = new Date(); const start = new Date(now.getTime()-10000);
    await pool.query('UPDATE learning_sessions SET started_at=$2 WHERE id=$1', [session.sessionId,start]);
    const windows = [{ start: new Date(now.getTime()-20000), end: new Date(now.getTime()+20000) }];
    const db = await pool.connect();
    assert.equal((await clientCallTimeForWindows(db, 'student', windows)).orientativeTutorMs, null);
    const observation = { segment: call.segment, intervals: [{ start: start.toISOString(), end: now.toISOString() }] };
    await assert.rejects(services.clientCallTime!({ userId: 'other' }, observation));
    assert.equal((await services.clientCallTime!(actor, observation)).status, 'recorded');
    assert.equal((await services.clientCallTime!(actor, observation)).status, 'duplicate');
    await assert.rejects(services.clientCallTime!(actor, { ...observation, intervals: [] }));
    assert.equal((await clientCallTimeForWindows(db, 'student', windows)).orientativeTutorMs, 10000);
    await db.query("INSERT INTO learning_time_streams(id,session_id,source) VALUES ('written-stream',$1,'written')", [session.sessionId]);
    await db.query("INSERT INTO learning_time_intervals(id,stream_id,session_id,source,started_at,ended_at) VALUES ('written-time','written-stream',$1,'written',$2,$3)", [session.sessionId, new Date(start.getTime()-5000), new Date(start.getTime()+5000)]);
    assert.equal((await clientCallTimeForWindows(db, 'student', windows)).orientativeTotalMs, 15000, 'overlap is counted once'); db.release();
    assert.equal((await pool.query("SELECT count(*)::integer n FROM learning_time_streams WHERE source='tutor'")).rows[0].n, 0);
    terminate = true; await services.reconcile!(actor, { sessionId: session.sessionId, intent: 'finalize' }); assert.equal(cleanups, 2);
    const snapshot = await repo.commands.read(session.sessionId);
    const result = await repo.commands.confirmClose({ ...close, expectedRevision: snapshot.revision });
    assert.equal(result.feedback, 'insufficient-evidence');
    assert.equal((await pool.query('SELECT count(*)::integer n FROM learning_comments')).rows[0].n, 0);
    const written = await repo.commands.create({ operationId: 'written', mode: 'sentence' });
    assert.equal((await repo.commands.confirmClose({ sessionId: written.sessionId, operationId: 'written-close', expectedRevision: 0, finalProgress: { sessionId: written.sessionId, journalRevision: 0 } })).feedback, 'not-requested');
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await lock.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); lock.release(); await admin.end(); }
});
