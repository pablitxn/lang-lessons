import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { migrateLearningDatabase } from '../server/data/migrations';
import { createBrokerAuthority } from '../server/broker/authority';
import { createRealtimeServer } from '../server/realtime';
import { createLearningRepository } from '../server/data/repository';
import { RepositoryError } from '../server/data/database';
import type { createAuthAdapter } from '../server/auth/better-auth';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
test('authenticated broker binds canonical segments and durable release receipts without inventing connected time', { skip: !database }, async () => {
  assert.ok(database); const url = new URL(database); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/p2_test');
  const admin = new Pool({ connectionString: database }); const schema = `broker_${randomUUID().replaceAll('-', '')}`;
  const lock = await admin.connect(); await lock.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  await admin.query(`CREATE SCHEMA ${schema}`); const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  const servers: ReturnType<typeof createRealtimeServer>[] = [];
  try {
    await migrateLearningDatabase(pool); await pool.query("INSERT INTO learning_users(id,role) VALUES ('student','student'),('other','student'),('teacher','professor')");
    const policy = { allowStructuredStorage: true, access: { grants: (role: string) => role === 'student' ? ['practice:own'] : [] } };
    const repo = createLearningRepository(pool, { userId: 'student' }, policy);
    const session = await repo.commands.create({ mode: 'verb-image', operationId: 'create' });
    const call = await repo.commands.startCall({ sessionId: session.sessionId, operationId: 'start', expectedRevision: 0 });
    const origin = 'http://127.0.0.1:5200';
    // Auth identity is a labeled fixture; production passes the actual Better Auth adapter.
    const auth = { identity: async (headers: Headers) => {
      const userId = headers.get('x-fixture-user'); if (!userId) throw new RepositoryError('unauthenticated'); return { userId };
    } } as ReturnType<typeof createAuthAdapter>;
    const authority = createBrokerAuthority({ pool, auth, access: policy.access, origin, allowRequest: async () => true });
    const upstream: string[] = [];
    const provider: typeof fetch = async input => {
      upstream.push(String(input));
      return String(input).endsWith('/hangup') ? new Response(null, { status: 200 })
        : new Response('v=0\r\ns=synthetic-answer\r\n', { status: 201, headers: { location: '/v1/realtime/calls/fixture-call-id' } });
    };
    async function launch() {
      const server = createRealtimeServer({ enabled: true, apiKey: 'synthetic-no-network', model: 'fixture', allowedOrigins: [origin], maxDurationSeconds: 600 }, provider, undefined, undefined, authority);
      servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
      const address = server.address(); assert.ok(address && typeof address !== 'string'); return `http://127.0.0.1:${address.port}`;
    }
    let base = await launch();
    const post = (user: string, path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-fixture-user': user }, body: JSON.stringify(body) });
    assert.equal((await fetch(base + '/api/realtime/status')).status, 401);
    assert.equal((await post('teacher', '/api/realtime/session', { sdp: 'v=0\r\n', segment: call.segment })).status, 403);
    assert.equal((await post('other', '/api/realtime/session', { sdp: 'v=0\r\n', segment: call.segment })).status, 404);
    assert.equal((await post('student', '/api/realtime/session', { sdp: 'v=0\r\n', segment: { ...call.segment, connectionEpoch: 999 } })).status, 409);
    assert.equal(upstream.length, 0);
    const started = await post('student', '/api/realtime/session', { sdp: 'v=0\r\n', segment: call.segment }); assert.equal(started.status, 200);
    const receipt = await started.json() as { releaseToken: string };
    assert.equal(upstream.length, 1);
    const rows = await pool.query('SELECT * FROM learning_broker_receipts');
    assert.equal(rows.rows[0].state, 'created'); assert.equal(rows.rows[0].user_id, 'student');
    assert.ok(!JSON.stringify(rows.rows).includes(receipt.releaseToken));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM learning_time_intervals WHERE source='tutor'")).rows[0].n, 0, 'SDP acceptance is not genuine connection evidence');
    assert.equal((await post('other', '/api/realtime/session/end', { releaseToken: receipt.releaseToken })).status, 403);
    assert.equal(upstream.length, 1);
    // A restart loses the in-memory lease, but must retain the explicit hangup obligation.
    servers[0]!.closeAllConnections(); await new Promise<void>(resolve => servers[0]!.close(() => resolve())); base = await launch();
    assert.equal((await post('student', '/api/realtime/session/end', { releaseToken: receipt.releaseToken })).status, 200);
    assert.equal(upstream.length, 2); assert.ok(upstream[1]!.endsWith('/fixture-call-id/hangup'));
    assert.equal((await post('student', '/api/realtime/session/end', { releaseToken: receipt.releaseToken })).status, 200);
    assert.equal(upstream.length, 2, 'durable ended receipt makes replay free of another provider call');
  } finally {
    for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await lock.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); lock.release(); await admin.end();
  }
});
