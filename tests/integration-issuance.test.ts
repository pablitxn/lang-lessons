import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { migrateLearningDatabase } from '../server/data/migrations';
import { createInstanceIssuer } from '../server/instance-issuance';
import { createLearningRepository } from '../server/data/repository';
import { createIssuedProgressSender } from '../src/foundation/issued-progress';
import type { PracticeEvent } from '../src/contracts';
const database = process.env.P2_DISPOSABLE_DATABASE_URL;
test('canonical issuance is owned, atomic and replay stable across sender reconstruction', { skip: !database }, async () => {
  assert.ok(database); const url = new URL(database); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/p2_test');
  const admin = new Pool({ connectionString: database }); const schema = `issue_${randomUUID().replaceAll('-', '')}`;
  // Coordinate with Better Auth introspection fixtures, while keeping races within this test concurrent.
  const lock = await admin.connect(); await lock.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  await admin.query(`CREATE SCHEMA ${schema}`); const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  try {
    await migrateLearningDatabase(pool); await pool.query("INSERT INTO learning_users(id,role) VALUES ('student','student'),('other','student')");
    const policy = { allowStructuredStorage: true, access: { grants: () => ['practice:own'] } };
    const identity = { userId: 'student' }; const repo = createLearningRepository(pool, identity, policy);
    const session = await repo.commands.create({ mode: 'sentence', operationId: 'create' });
    const issue = createInstanceIssuer(pool, policy);
    const requests = await Promise.all([issue(identity, { sessionId: session.sessionId, operationId: 'issue' }), issue(identity, { sessionId: session.sessionId, operationId: 'issue' })]);
    assert.deepEqual(requests[0], requests[1]);
    await assert.rejects(issue({ userId: 'other' }, { sessionId: session.sessionId, operationId: 'issue' }), /not-found/);
    assert.throws(() => issue(identity, { sessionId: session.sessionId, operationId: 'bad', exerciseId: 'chosen' }), /invalid-input/);
    const input: PracticeEvent = { schemaVersion: 1, eventId: 'result', kind: 'attempt-result', result: 'accepted', source: 'typed', trust: 'client-reported',
      ref: { sessionId: session.sessionId, exerciseId: 'local-ref', generation: 1, obligation: 'written:translation', attemptId: 'attempt', revision: 1 } };
    const ports = { issue: (value: { sessionId: string; operationId: string }) => issue(identity, value), send: (id: string, events: readonly PracticeEvent[]) => repo.submit(id, events) };
    const first = await createIssuedProgressSender(ports)([input]);
    const replay = await createIssuedProgressSender(ports)([input]);
    assert.equal(first.status, 'committed'); assert.equal(replay.status, 'committed');
    if (replay.status === 'committed') assert.equal(replay.acknowledgments[0]!.status, 'duplicate');
    assert.equal(input.ref.exerciseId, 'local-ref');
    const persisted = await pool.query('SELECT event_payload FROM learning_events WHERE event_id=$1', ['result']);
    assert.notEqual(persisted.rows[0].event_payload.ref.exerciseId, 'local-ref');
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await lock.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); lock.release(); await admin.end(); }
});
