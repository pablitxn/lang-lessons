import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { migrateLearningDatabase } from '../server/data/migrations';
import { createLearningRepository } from '../server/data/repository';
import { createFeedbackRepository } from '../server/data/feedback-repository';
import { createRecoveryRepository } from '../server/data/recovery';
import { createCallObservationRepository, createCloseEvaluator } from '../server/data/call-history';
import { createCanonicalFeedbackReader, createCanonicalFeedbackService } from '../server/feedback-binding';
import type { PracticeEvent } from '../src/contracts';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
test('canonical feedback reader fences claims and excludes invalidated or unlinked oral results', { skip: !database }, async () => {
  assert.ok(database); const url = new URL(database); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/p2_test');
  const admin = new Pool({ connectionString: database }); const schema = `feedback_root_${randomUUID().replaceAll('-', '')}`;
  const lock = await admin.connect(); await lock.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  await admin.query(`CREATE SCHEMA ${schema}`); const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  try {
    await migrateLearningDatabase(pool); await pool.query("INSERT INTO learning_users(id,role) VALUES ('student','student')");
    const access = { grants: () => ['practice:own'] }; const actor = { userId: 'student' };
    const policy = { allowStructuredStorage: true, access, evaluateClose: createCloseEvaluator({ guardBroker: async () => {}, connectedFeedback: async () => 'pending' }) };
    const repo = createLearningRepository(pool, actor, policy);
    const session = await repo.commands.create({ mode: 'sentence', operationId: 'create' });
    const started = await repo.commands.startCall({ sessionId: session.sessionId, expectedRevision: 0, operationId: 'start' });
    // Synthetic authenticated server observation, not browser ready or a real call.
    const observations = createCallObservationRepository(pool, actor, { access, verify: async () => true });
    await observations.record({ eventId: 'verified-fixture', segment: started.segment, kind: 'connected' });
    await repo.registerInstance({ sessionId: session.sessionId, exerciseId: 'exercise', generation: 0 });
    const event = (eventId: string, obligation: 'written:translation' | 'written:tense' | 'meaning', revision: number, invalidate = false): PracticeEvent => ({
      schemaVersion: 1, eventId, ref: { sessionId: session.sessionId, exerciseId: 'exercise', generation: 0, obligation, attemptId: eventId, revision },
      source: obligation === 'meaning' ? 'audio' : 'typed', trust: 'client-reported',
      ...(invalidate ? { kind: 'attempt-invalidated' } : { kind: 'attempt-result', result: 'accepted' }),
    });
    const saved = await repo.submit(session.sessionId, [event('old-translation', 'written:translation', 1), event('invalidated', 'written:translation', 2, true), event('written-tense', 'written:tense', 1), event('unlinked-oral', 'meaning', 1)]);
    assert.equal(saved.status, 'committed');
    const stopped = await repo.commands.stopCall({ sessionId: session.sessionId, operationId: 'stop', expectedRevision: 1, segment: started.segment });
    await repo.commands.confirmClose({ sessionId: session.sessionId, operationId: 'close', expectedRevision: stopped.revision, finalProgress: saved.current });
    const recovery = createRecoveryRepository(pool, actor, policy); const recovered = await recovery.read(session.sessionId); assert.ok(recovered.feedback);
    const repository = createFeedbackRepository(pool, { acceptComment: () => true }); const claim = await repository.claim(recovered.feedback.jobId); assert.ok(claim);
    const reader = createCanonicalFeedbackReader(pool);
    assert.equal(await reader.read({ ...claim, claimToken: 'wrong' }), null);
    const evidence = await reader.read(claim) as any;
    assert.equal(evidence.closedRevision, stopped.revision + 1);
    assert.deepEqual(evidence.observations, [{ observationId: 'written-tense', sessionId: session.sessionId, segmentId: null, activity: 'tense-identification', outcome: 'accepted' }]);
    assert.equal(evidence.segments[0].segmentId, started.segment.segmentId);
    await repository.fail(claim);
    assert.equal(await reader.read(claim), null, 'terminal claims cannot read evidence again');
    await recovery.retryFailedFeedback({ sessionId: session.sessionId, jobId: claim.jobId, operationId: 'retry', expectedRetryRevision: 0 });
    let generated = 0;
    const service = createCanonicalFeedbackService(pool, { client: { generate: async snapshot => { generated++; return { text: snapshot.value.allowedComments[0] }; } } });
    const result = await service.afterManualRetry(claim.jobId);
    // Until P6 admits session-scoped written observations, its policy safely returns insufficient.
    assert.equal(result.status, 'insufficient-evidence');
    assert.equal(generated, 0);
    assert.equal((await service.afterManualRetry(claim.jobId)).status, 'not-claimed');
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await lock.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); lock.release(); await admin.end();
  }
});
