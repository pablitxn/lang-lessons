import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeedbackJobRef, FeedbackRepository, FeedbackState, ProfessorComment } from '../src/contracts/feedback';
import { createFeedbackCoordinator, type FeedbackPolicy, type SessionEvidence } from '../server/feedback/coordinator';

// Structural fixtures only: no learner content, transcript, audio, database or provider.
type Evidence = { readonly fixture: true };
const snapshot: SessionEvidence<Evidence> = { sessionId: 's1', segments: [
  { sessionId: 's1', segmentId: 'first', connectionEpoch: 1 },
  { sessionId: 's1', segmentId: 'restarted', connectionEpoch: 2 },
], value: { fixture: true } };
const text = 'Keep practicing the forms you reviewed.';
function fixture() {
  let state: FeedbackState = 'pending';
  let token = 'fence-1';
  let stored: ProfessorComment | undefined;
  let calls = 0;
  const current = (claim: FeedbackJobRef) => state === 'running' && claim.sessionId === 's1' && claim.jobId === 'j1' && claim.claimToken === token;
  const repository: FeedbackRepository = {
    async claim(jobId) {
      if (jobId !== 'j1' || state !== 'pending') return null;
      state = 'running';
      return { sessionId: 's1', jobId, claimToken: token };
    },
    async complete(claim, comment) {
      if (!current(claim) || comment.sessionId !== claim.sessionId) return 'stale';
      state = 'succeeded'; stored = comment; return 'stored';
    },
    async fail(claim) {
      if (!current(claim)) return 'stale';
      state = 'failed'; return 'recorded';
    },
  };
  const policy: FeedbackPolicy<Evidence> = {
    provenanceVersion: 'fixture-only-v1', maxCommentCharacters: 100,
    async evidence() { return { status: 'sufficient', snapshot }; },
    accepts(value, evidence) { return value === text && evidence === snapshot; },
  };
  const dependencies = {
    repository, policy,
    async recordInsufficient(claim: FeedbackJobRef): Promise<'recorded' | 'stale'> {
      if (!current(claim)) return 'stale';
      state = 'insufficient-evidence'; return 'recorded';
    },
    client: { async generate(evidence: SessionEvidence<Evidence>): Promise<unknown> {
      calls++; assert.equal(evidence, snapshot); return { text };
    } },
  };
  return { dependencies, state: () => state, stored: () => stored, calls: () => calls,
    supersede() { token = 'fence-2'; },
  };
}

test('unselected policy and missing insufficient-state seam block before claiming', async () => {
  const f = fixture();
  assert.deepEqual(await createFeedbackCoordinator({ ...f.dependencies, policy: null }).run('j1'), { status: 'blocked', reason: 'policy-unselected' });
  assert.deepEqual(await createFeedbackCoordinator({ ...f.dependencies, recordInsufficient: null }).run('j1'), { status: 'blocked', reason: 'insufficient-state-adapter-missing' });
  assert.equal(f.state(), 'pending'); assert.equal(f.calls(), 0);
});

test('no job for no-call, cancelled exit or call stop causes no request', async () => {
  const f = fixture();
  const worker = createFeedbackCoordinator(f.dependencies);
  for (const absentJob of ['no-call', 'cancelled', 'stopped']) {
    assert.deepEqual(await worker.run(absentJob), { status: 'not-claimed' });
  }
  assert.equal(f.calls(), 0); assert.equal(f.stored(), undefined);
});

test('competing workers and duplicate delivery store one session comment across restarted segments', async () => {
  const f = fixture();
  const results = await Promise.all([createFeedbackCoordinator(f.dependencies).run('j1'), createFeedbackCoordinator(f.dependencies).run('j1')]);
  assert.deepEqual(results.map(r => r.status).sort(), ['not-claimed', 'stored']);
  assert.equal(f.calls(), 1);
  assert.deepEqual(f.stored(), { sessionId: 's1', text, provenanceVersion: 'fixture-only-v1' });
  assert.equal((await createFeedbackCoordinator(f.dependencies).run('j1')).status, 'not-claimed');
  assert.equal(f.calls(), 1);
});

test('insufficient evidence stays distinct and never invokes the client', async () => {
  const f = fixture();
  f.dependencies.policy.evidence = async () => ({ status: 'insufficient-evidence' });
  assert.equal((await createFeedbackCoordinator(f.dependencies).run('j1')).status, 'insufficient-evidence');
  assert.equal(f.state(), 'insufficient-evidence'); assert.equal(f.calls(), 0);
});

test('cross-session and duplicate-segment evidence fails before generation', async () => {
  for (const invalid of [ { ...snapshot, sessionId: 'other' },
    { ...snapshot, segments: [{ sessionId: 'other', segmentId: 'first', connectionEpoch: 1 }] },
    { ...snapshot, segments: [snapshot.segments[0]!, snapshot.segments[0]!] },
    { ...snapshot, segments: [] } ]) {
    const f = fixture();
    f.dependencies.policy.evidence = async () => ({ status: 'sufficient', snapshot: invalid });
    assert.equal((await createFeedbackCoordinator(f.dependencies).run('j1')).status, 'failed');
    assert.equal(f.calls(), 0); assert.equal(f.stored(), undefined);
  }
});

test('malformed, graded, overlong and ungrounded fixture outputs fail without a comment', async () => {
  for (const output of [null, '', { text: '' }, { text, grade: 9 }, { text, sessionId: 'other' }, { text: 'x'.repeat(101) }, { text: 'Your grade is nine.' }]) {
    const f = fixture();
    f.dependencies.client.generate = async () => output;
    assert.equal((await createFeedbackCoordinator(f.dependencies).run('j1')).status, 'failed');
    assert.equal(f.stored(), undefined);
  }
});

test('provider failure is terminal with no automatic retry', async () => {
  const f = fixture(); let calls = 0;
  f.dependencies.client.generate = async () => { calls++; throw new Error('private fixture payload'); };
  const worker = createFeedbackCoordinator(f.dependencies);
  assert.equal((await worker.run('j1')).status, 'failed');
  assert.equal((await worker.run('j1')).status, 'not-claimed');
  assert.equal(calls, 1); assert.equal(f.stored(), undefined);
});

test('late success, failure and insufficient evidence are isolated by the claim fence', async () => {
  for (const outcome of ['success', 'failure', 'insufficient']) {
    const f = fixture();
    if (outcome === 'insufficient') {
      f.dependencies.policy.evidence = async () => { f.supersede(); return { status: 'insufficient-evidence' }; };
    } else {
      f.dependencies.client.generate = async () => {
        await Promise.resolve(); f.supersede();
        if (outcome === 'failure') throw new Error('fixture');
        return { text };
      };
    }
    assert.equal((await createFeedbackCoordinator(f.dependencies).run('j1')).status, 'stale');
    assert.equal(f.state(), 'running'); assert.equal(f.stored(), undefined);
  }
});

test('ambiguous storage reply propagates without overwriting success or retrying inference', async () => {
  const f = fixture(); const complete = f.dependencies.repository.complete;
  f.dependencies.repository.complete = async (claim, comment) => { await complete(claim, comment); throw new Error('lost reply'); };
  const worker = createFeedbackCoordinator(f.dependencies);
  await assert.rejects(worker.run('j1'), /lost reply/);
  assert.equal(f.state(), 'succeeded'); assert.ok(f.stored());
  assert.equal((await worker.run('j1')).status, 'not-claimed'); assert.equal(f.calls(), 1);
});
