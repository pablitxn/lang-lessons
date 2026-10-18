import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createLearningRepository } from '../server/data/repository';
import type { DataPolicy } from '../server/data/repository';
import { createFeedbackRepository } from '../server/data/feedback-repository';
import { createAccountRepository } from '../server/accounts/repository';
import { transaction } from '../server/data/database';
import type { PracticeEvent } from '../src/contracts/progress';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
const policy: DataPolicy = { allowStructuredStorage: true, access: { grants: role => role === 'student' ? ['practice:own'] : role === 'professor' ? ['students:list'] : [] } };
async function fixture() {
  assert.ok(database);
  const url = new URL(database);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/p2_test', 'Only the explicitly named disposable loopback database is allowed');
  const admin = new Pool({ connectionString: database });
  const schema = `p2_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  const migration = await readFile(new URL('../server/data/migrations/p2-learning.sql', import.meta.url), 'utf8');
  await transaction(pool, async client => { await client.query(migration); });
  await pool.query(await readFile(new URL('../server/data/migrations/p2-day-projection.sql', import.meta.url), 'utf8'));
  await pool.query("INSERT INTO learning_users(id,role) VALUES ('alice','student'),('bob','student'),('prof','professor'),('admin','administrator')");
  return { pool, migration, cleanup: async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); } };
}
function event(sessionId: string, revision = 1, eventId = `event-${revision}`, obligation: PracticeEvent['ref']['obligation'] = 'spelling:past'): PracticeEvent {
  return { schemaVersion: 1, eventId, kind: 'attempt-result', ref: { sessionId, exerciseId: 'issued', generation: 0, obligation, attemptId: `attempt-${revision}`, revision }, source: 'typed', trust: 'client-reported', result: 'accepted' };
}
async function opened(pool: Pool, selectedPolicy = policy) {
  const repo = createLearningRepository(pool, { userId: 'alice' }, selectedPolicy);
  const session = await repo.commands.create({ mode: 'verb-image', operationId: randomUUID() });
  await repo.registerInstance({ sessionId: session.sessionId, exerciseId: 'issued', generation: 0 });
  return { repo, session };
}
const isolated = { skip: !database };

test('P2 PostgreSQL atomic batches reject stale members and preserve original replay revisions', isolated, async () => {
  const f = await fixture();
  try {
    const { repo, session } = await opened(f.pool); const id = session.sessionId;
    const first = await repo.submit(id, [event(id)]); assert.equal(first.status, 'committed');
    const rejected = await repo.submit(id, [event(id, 2), event(id, 1, 'stale')]);
    assert.deepEqual(rejected, { status: 'rejected', reason: 'stale-attempt', current: { sessionId: id, journalRevision: 1 } });
    assert.equal((await f.pool.query('SELECT * FROM learning_events')).rowCount, 1);
    const next = await repo.submit(id, [event(id, 2), event(id, 2)]);
    assert.equal(next.status, 'committed');
    if (next.status === 'committed') assert.deepEqual(next.acknowledgments.map(a => [a.status, a.committedRevision]), [['accepted', 2], ['duplicate', 2]]);
    const duplicate = await repo.submit(id, [event(id)]);
    assert.equal(duplicate.status, 'committed');
    if (duplicate.status === 'committed') { assert.equal(duplicate.acknowledgments[0]!.committedRevision, 1); assert.equal(duplicate.current.journalRevision, 2); }
    assert.equal((await repo.commands.read(id)).revision, 0);
    const conflict = await repo.submit(id, [{ ...event(id), result: 'incorrect' }]); assert.equal(conflict.status, 'rejected');
    const malformed = await repo.submit(id, [{ ...event(id, 3), answer: 'must never persist' }]); assert.equal(malformed.status, 'rejected');
    const unknown = event(id, 3); unknown.ref.exerciseId = 'never-issued'; assert.equal((await repo.submit(id, [unknown])).status, 'rejected');
    const cross = event(id, 3); cross.ref.sessionId = 'other-session'; assert.equal((await repo.submit(id, [cross])).status, 'rejected');
  } finally { await f.cleanup(); }
});

test('P2 PostgreSQL ownership, current role, disabled users and unresolved grants fail closed', isolated, async () => {
  const f = await fixture();
  try {
    const { repo, session } = await opened(f.pool);
    const bob = createLearningRepository(f.pool, { userId: 'bob' }, policy);
    await assert.rejects(bob.commands.read(session.sessionId), /not-found/);
    await assert.rejects(bob.submit(session.sessionId, [event(session.sessionId)]), /not-found/);
    await assert.rejects(createLearningRepository(f.pool, { userId: 'alice' }).commands.read(session.sessionId), /forbidden/);
    await assert.rejects(createLearningRepository(f.pool, { userId: 'alice' }, { ...policy, allowStructuredStorage: false }).submit(session.sessionId, [event(session.sessionId)]), /policy-unresolved/);
    const accounts = createAccountRepository(f.pool, policy.access);
    assert.deepEqual(await accounts.listStudents({ userId: 'prof' }), [{ id: 'alice', role: 'student' }, { id: 'bob', role: 'student' }]);
    await assert.rejects(accounts.listStudents({ userId: 'admin' }), /forbidden/);
    await assert.rejects(accounts.listStudents({ userId: 'alice' }), /forbidden/);
    await f.pool.query("UPDATE learning_users SET role='student' WHERE id='prof'");
    await assert.rejects(accounts.listStudents({ userId: 'prof' }), /forbidden/);
    await f.pool.query("UPDATE learning_users SET disabled=true WHERE id='alice'");
    await assert.rejects(repo.commands.read(session.sessionId), /forbidden/);
  } finally { await f.cleanup(); }
});

test('P2 PostgreSQL concurrent replay commits once and SQL failure returns no saved receipt', isolated, async () => {
  const f = await fixture();
  try {
    const { repo, session } = await opened(f.pool); const id = session.sessionId;
    const results = await Promise.all([repo.submit(id, [event(id)]), repo.submit(id, [event(id)])]);
    assert.deepEqual(results.map(r => r.status === 'committed' ? r.acknowledgments[0]!.status : r.status).sort(), ['accepted', 'duplicate']);
    await f.pool.query("CREATE FUNCTION reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_id='fail' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$");
    await f.pool.query('CREATE TRIGGER reject_event BEFORE INSERT ON learning_events FOR EACH ROW EXECUTE FUNCTION reject_event()');
    await assert.rejects(repo.submit(id, [event(id, 2), event(id, 3, 'fail')]), /fixture failure/);
    assert.equal((await f.pool.query('SELECT * FROM learning_events')).rowCount, 1);
    assert.equal((await f.pool.query('SELECT journal_revision FROM learning_sessions')).rows[0].journal_revision, 1);
  } finally { await f.cleanup(); }
});

test('P2 PostgreSQL exact close fences serialize against events and replay lost close responses', isolated, async () => {
  const f = await fixture();
  try {
    const { repo, session } = await opened(f.pool); const id = session.sessionId;
    await repo.submit(id, [event(id)]);
    const close = { sessionId: id, operationId: 'close', expectedRevision: 0, finalProgress: { sessionId: id, journalRevision: 0 } };
    await assert.rejects(repo.commands.confirmClose(close), /conflict/);
    const request = { ...close, finalProgress: { sessionId: id, journalRevision: 1 } };
    const result = await repo.commands.confirmClose(request);
    assert.equal(result.feedback, 'not-requested');
    assert.deepEqual(await repo.commands.confirmClose(request), result);
    assert.deepEqual(await repo.commands.readClose(id), result);
    await assert.rejects(repo.commands.confirmClose({ ...request, expectedRevision: 1 }), /conflict/);
    await assert.rejects(repo.submit(id, [event(id, 2)]), /conflict/);
    await assert.rejects(repo.commands.startCall({ sessionId: id, operationId: 'late-call', expectedRevision: 1 }), /conflict/);
    assert.equal((await f.pool.query('SELECT * FROM learning_feedback_jobs')).rowCount, 0);
    const other = await opened(f.pool); const otherId = other.session.sessionId;
    const race = await Promise.allSettled([
      other.repo.submit(otherId, [event(otherId)]),
      other.repo.commands.confirmClose({ sessionId: otherId, operationId: 'race-close', expectedRevision: 0, finalProgress: { sessionId: otherId, journalRevision: 0 } }),
    ]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(race.filter(r => r.status === 'rejected').length, 1);
  } finally { await f.cleanup(); }
});

test('P2 PostgreSQL call starts use fresh epochs, stop never enqueues, and called close needs policy', isolated, async () => {
  const f = await fixture();
  try {
    const { repo, session } = await opened(f.pool); const id = session.sessionId;
    const firstRequest = { sessionId: id, operationId: 'start', expectedRevision: 0 };
    const first = await repo.commands.startCall(firstRequest);
    assert.deepEqual(await repo.commands.startCall(firstRequest), first);
    await assert.rejects(repo.commands.startCall({ ...firstRequest, operationId: 'concurrent', expectedRevision: 1 }), /conflict/);
    await repo.commands.stopCall({ sessionId: id, operationId: 'stop', expectedRevision: 1, segment: first.segment });
    const second = await repo.commands.startCall({ sessionId: id, operationId: 'restart', expectedRevision: 2 });
    assert.equal(second.segment.connectionEpoch, 2); assert.notEqual(second.segment.segmentId, first.segment.segmentId);
    assert.equal((await f.pool.query('SELECT * FROM learning_feedback_jobs')).rowCount, 0);
    await assert.rejects(repo.commands.confirmClose({ sessionId: id, operationId: 'close', expectedRevision: 3, finalProgress: { sessionId: id, journalRevision: 0 } }), /policy-unresolved/);
    assert.equal((await repo.commands.read(id)).status, 'open');
  } finally { await f.cleanup(); }
});

test('P2 PostgreSQL feedback atomic enqueue, one claimant, foreign/stale fences and terminal failure', isolated, async () => {
  const f = await fixture();
  try {
    const { repo, session } = await opened(f.pool, { ...policy, feedbackOnClose: () => 'pending' }); const id = session.sessionId;
    await repo.commands.startCall({ sessionId: id, operationId: 'start', expectedRevision: 0 });
    const request = { sessionId: id, operationId: 'close', expectedRevision: 1, finalProgress: { sessionId: id, journalRevision: 0 } };
    await Promise.all([repo.commands.confirmClose(request), repo.commands.confirmClose(request)]);
    const jobs = await f.pool.query<{ id: string }>('SELECT id FROM learning_feedback_jobs'); assert.equal(jobs.rowCount, 1);
    const jobId = jobs.rows[0]!.id;
    await assert.rejects(createFeedbackRepository(f.pool).claim(jobId), /policy-unresolved/);
    const feedback = createFeedbackRepository(f.pool, { acceptComment: comment => comment.text.length <= 100 && comment.provenanceVersion === 'fixture-v1' });
    const claims = await Promise.all([feedback.claim(jobId), feedback.claim(jobId)]);
    const claim = claims.find(value => value !== null)!; assert.equal(claims.filter(Boolean).length, 1);
    const comment = { sessionId: id, text: 'Fixture qualitative comment.', provenanceVersion: 'fixture-v1' };
    assert.equal(await feedback.complete({ ...claim, claimToken: 'old' }, comment), 'stale');
    await assert.rejects(feedback.complete(claim, { ...comment, sessionId: 'other' }), /invalid-input/);
    assert.equal(await feedback.complete(claim, comment), 'stored');
    assert.equal(await feedback.complete(claim, comment), 'stale');
    assert.equal(await feedback.fail(claim), 'stale');
    assert.equal(await feedback.claim(jobId), null);
    assert.equal((await f.pool.query('SELECT * FROM learning_comments')).rowCount, 1);
    const other = await opened(f.pool, { ...policy, feedbackOnClose: () => 'pending' }); const otherId = other.session.sessionId;
    await other.repo.commands.startCall({ sessionId: otherId, operationId: 'other-start', expectedRevision: 0 });
    await other.repo.commands.confirmClose({ sessionId: otherId, operationId: 'other-close', expectedRevision: 1, finalProgress: { sessionId: otherId, journalRevision: 0 } });
    const secondId = (await f.pool.query<{ id: string }>('SELECT id FROM learning_feedback_jobs WHERE session_id=$1', [otherId])).rows[0]!.id;
    const failed = (await feedback.claim(secondId))!;
    assert.equal(await feedback.fail(failed), 'recorded'); assert.equal(await feedback.claim(secondId), null);
  } finally { await f.cleanup(); }
});

test('P2 migration body is atomic when the registry transaction fails', isolated, async () => {
  const f = await fixture();
  try {
    await assert.rejects(transaction(f.pool, async client => {
      await client.query('CREATE TABLE migration_probe(id integer)');
      await client.query('SELECT missing_column FROM learning_users');
    }), /missing_column/);
    const result = await f.pool.query("SELECT to_regclass('migration_probe') AS name");
    assert.equal(result.rows[0].name, null);
    await assert.rejects(transaction(f.pool, async client => { await client.query(f.migration); }), /already exists/);
    assert.equal((await f.pool.query('SELECT * FROM learning_users')).rowCount, 4);
  } finally { await f.cleanup(); }
});

test('P2 PostgreSQL insufficient-evidence is terminal and fenced across every claim coordinate', isolated, async () => {
  const f = await fixture();
  try {
    const { repo, session } = await opened(f.pool, { ...policy, feedbackOnClose: () => 'pending' }); const id = session.sessionId;
    await repo.commands.startCall({ sessionId: id, operationId: 'start', expectedRevision: 0 });
    await repo.commands.confirmClose({ sessionId: id, operationId: 'close', expectedRevision: 1, finalProgress: { sessionId: id, journalRevision: 0 } });
    const jobId = (await f.pool.query<{ id: string }>('SELECT id FROM learning_feedback_jobs')).rows[0]!.id;
    const feedback = createFeedbackRepository(f.pool, { acceptComment: () => true }); const claim = (await feedback.claim(jobId))!;
    for (const changed of [{ ...claim, sessionId: 'other' }, { ...claim, jobId: 'other' }, { ...claim, claimToken: 'other' }]) {
      assert.equal(await feedback.recordInsufficient(changed), 'stale');
    }
    assert.equal(await feedback.recordInsufficient(claim), 'recorded');
    assert.equal(await feedback.recordInsufficient(claim), 'stale');
    assert.equal(await feedback.fail(claim), 'stale');
    assert.equal(await feedback.complete(claim, { sessionId: id, text: 'Fixture', provenanceVersion: 'fixture' }), 'stale');
    assert.equal(await feedback.claim(jobId), null);
    assert.equal((await f.pool.query('SELECT state FROM learning_feedback_jobs')).rows[0].state, 'insufficient-evidence');
    assert.equal((await f.pool.query('SELECT * FROM learning_comments')).rowCount, 0);
    const malformed = await opened(f.pool);
    await f.pool.query("INSERT INTO learning_feedback_jobs(id,session_id,state) VALUES ('ineligible',$1,'pending')", [malformed.session.sessionId]);
    assert.equal(await feedback.claim('ineligible'), null);
  } finally { await f.cleanup(); }
});

test('P2 PostgreSQL paginated account views require explicit grants and disclosure policy', isolated, async () => {
  const f = await fixture();
  try {
    await opened(f.pool);
    const access = { grants: () => ['students:list', 'users:list', 'students:feedback:read'] };
    const accounts = createAccountRepository(f.pool, access, { allowStudentFeedback: true });
    const first = await accounts.listAllStudents({ userId: 'prof' }, null, 1);
    assert.deepEqual(first.items, [{ id: 'alice', role: 'student' }]); assert.ok(first.nextCursor);
    const second = await accounts.listAllStudents({ userId: 'prof' }, first.nextCursor, 1);
    assert.deepEqual(second.items, [{ id: 'bob', role: 'student' }]); assert.equal(second.nextCursor, null);
    assert.equal((await accounts.listUsers({ userId: 'admin' })).items.length, 4);
    assert.equal((await accounts.readProgressPage({ userId: 'prof' }, 'alice')).sessions.items.length, 1);
    assert.equal((await accounts.readProgressPage({ userId: 'prof' }, 'bob')).sessions.items.length, 0);
    await assert.rejects(createAccountRepository(f.pool, access).readProgressPage({ userId: 'prof' }, 'alice'), /policy-unresolved/);
    await assert.rejects(createAccountRepository(f.pool).listUsers({ userId: 'admin' }), /forbidden/);
    await assert.rejects(accounts.listAllStudents({ userId: 'prof' }, 'bad cursor'), /invalid-input/);
  } finally { await f.cleanup(); }
});

test('P2 PostgreSQL close/job and comment/state writes roll back together on storage failure', isolated, async () => {
  const f = await fixture();
  try {
    const { repo, session } = await opened(f.pool, { ...policy, feedbackOnClose: () => 'pending' }); const id = session.sessionId;
    await repo.commands.startCall({ sessionId: id, operationId: 'start', expectedRevision: 0 });
    const close = { sessionId: id, operationId: 'close', expectedRevision: 1, finalProgress: { sessionId: id, journalRevision: 0 } };
    await f.pool.query("CREATE FUNCTION reject_storage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture storage failure'; END $$");
    await f.pool.query('CREATE TRIGGER reject_job BEFORE INSERT ON learning_feedback_jobs FOR EACH ROW EXECUTE FUNCTION reject_storage()');
    await assert.rejects(repo.commands.confirmClose(close), /fixture storage failure/);
    assert.equal((await repo.commands.read(id)).status, 'open'); assert.equal(await repo.commands.readClose(id), null);
    await f.pool.query('DROP TRIGGER reject_job ON learning_feedback_jobs');
    await repo.commands.confirmClose(close);
    const jobId = (await f.pool.query<{ id: string }>('SELECT id FROM learning_feedback_jobs')).rows[0]!.id;
    const feedback = createFeedbackRepository(f.pool, { acceptComment: () => true }); const claim = (await feedback.claim(jobId))!;
    const comment = { sessionId: id, text: 'Fixture comment', provenanceVersion: 'fixture' };
    await f.pool.query('CREATE TRIGGER reject_comment BEFORE INSERT ON learning_comments FOR EACH ROW EXECUTE FUNCTION reject_storage()');
    await assert.rejects(feedback.complete(claim, comment), /fixture storage failure/);
    assert.equal((await f.pool.query('SELECT state FROM learning_feedback_jobs')).rows[0].state, 'running');
    await f.pool.query('DROP TRIGGER reject_comment ON learning_comments');
    assert.equal(await feedback.complete(claim, comment), 'stored');
  } finally { await f.cleanup(); }
});

test('P2 actual P6 coordinator records insufficient evidence through the PostgreSQL fence', { skip: !database || !process.env.P2_P6_COORDINATOR }, async () => {
  const { createFeedbackCoordinator } = await import(process.env.P2_P6_COORDINATOR!);
  const f = await fixture();
  try {
    const { repo, session } = await opened(f.pool, { ...policy, feedbackOnClose: () => 'pending' }); const id = session.sessionId;
    await repo.commands.startCall({ sessionId: id, operationId: 'start', expectedRevision: 0 });
    await repo.commands.confirmClose({ sessionId: id, operationId: 'close', expectedRevision: 1, finalProgress: { sessionId: id, journalRevision: 0 } });
    const jobId = (await f.pool.query<{ id: string }>('SELECT id FROM learning_feedback_jobs')).rows[0]!.id;
    const repository = createFeedbackRepository(f.pool, { acceptComment: () => true }); let calls = 0;
    const coordinator = createFeedbackCoordinator({ repository, recordInsufficient: repository.recordInsufficient,
      policy: { provenanceVersion: 'fixture', maxCommentCharacters: 100, evidence: async () => ({ status: 'insufficient-evidence' }), accepts: () => true },
      client: { generate: async () => { calls++; return { text: 'Fixture' }; } } });
    assert.deepEqual(await coordinator.run(jobId), { status: 'insufficient-evidence', sessionId: id });
    assert.deepEqual(await coordinator.run(jobId), { status: 'not-claimed' }); assert.equal(calls, 0);
    assert.equal((await f.pool.query('SELECT state FROM learning_feedback_jobs')).rows[0].state, 'insufficient-evidence');
  } finally { await f.cleanup(); }
});
