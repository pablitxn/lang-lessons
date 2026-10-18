import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeedbackJobRef, ProfessorComment } from '../src/contracts/feedback';
import { createFeedbackPolicy, type ClosedFeedbackEvidence } from '../server/feedback/policy';
import { createFeedbackService, createFeedbackGenerationClient } from '../server/feedback/service';

const claim: FeedbackJobRef = { sessionId: 'session', jobId: 'job', claimToken: 'fence' };
function evidence(): ClosedFeedbackEvidence {
  return { claim, session: { sessionId: 'session', status: 'closed', revision: 8 }, closedRevision: 8,
    segments: [{ sessionId: 'session', segmentId: 'first', connectionEpoch: 1, qualified: true },
      { sessionId: 'session', segmentId: 'restarted', connectionEpoch: 2, qualified: true }],
    observations: [
      { observationId: 'written', sessionId: 'session', segmentId: 'first', activity: 'written-form', outcome: 'incorrect' },
      { observationId: 'oral', sessionId: 'session', segmentId: 'restarted', activity: 'oral-meaning', outcome: 'accepted' },
    ] };
}
function fixture() {
  let state = 'pending'; let token = 'fence'; let calls = 0; let stored: ProfessorComment | undefined;
  let raw: unknown = evidence(); let reject = false;
  const events: unknown[] = [];
  const current = (ref: FeedbackJobRef) => state === 'running' && ref.sessionId === 'session' && ref.jobId === 'job' && ref.claimToken === token;
  const repository = {
    async claim(jobId: string) {
      if (jobId !== 'job' || state !== 'pending') return null;
      state = 'running'; return { ...claim, claimToken: token };
    },
    async complete(ref: FeedbackJobRef, comment: ProfessorComment): Promise<'stored' | 'stale'> {
      if (!current(ref)) return 'stale';
      stored = comment; state = 'succeeded'; return 'stored';
    },
    async fail(ref: FeedbackJobRef): Promise<'recorded' | 'stale'> {
      if (!current(ref)) return 'stale';
      state = 'failed'; return 'recorded';
    },
    async recordInsufficient(ref: FeedbackJobRef): Promise<'recorded' | 'stale'> {
      if (!current(ref)) return 'stale';
      state = 'insufficient-evidence'; return 'recorded';
    },
  };
  const service = createFeedbackService({ repository, reader: { async read() { return raw; } },
    client: createFeedbackGenerationClient(async ({ snapshot, instruction }) => {
      calls++; assert.match(instruction, /one exact allowedComments entry/);
      assert.equal(snapshot.segments.length, 2); assert.equal(snapshot.value.observations.length, 2);
      if (reject) throw new Error('secret provider exception');
      return { text: snapshot.value.allowedComments[0] };
    }), telemetry: { route: 'local-fixture', async publish(route, event) { events.push({ route, event }); } },
  });
  return { service, repository, events, calls: () => calls, state: () => state, stored: () => stored,
    setEvidence(value: unknown) { raw = value; }, failGeneration(value: boolean) { reject = value; },
    supersede() { token = 'new-fence'; },
    manualRequeue() {
      assert.equal(state, 'failed'); state = 'pending'; token = 'manual-retry-fence';
      raw = { ...evidence(), claim: { ...claim, claimToken: token } };
    },
  };
}

test('closed multi-segment evidence produces one grounded qualitative comment and scoped trace', async () => {
  const f = fixture();
  assert.equal((await f.service.afterConfirmedClose('job')).status, 'stored');
  assert.equal(f.calls(), 1); assert.equal(f.stored()?.sessionId, 'session');
  assert.match(f.stored()!.text, /written verb forms.*needed correction/);
  assert.equal(f.stored()?.provenanceVersion, 'structured-session-feedback-v1');
  assert.deepEqual(f.events, [{ route: 'local-fixture', event: {
    operation: 'session-feedback', jobId: 'job', sessionId: 'session', outcome: 'stored',
  } }]);
  assert.equal((await f.service.afterConfirmedClose('job')).status, 'not-claimed');
  assert.equal(f.calls(), 1);
});

test('missing, open, stale, cross-session, unqualified and empty evidence calls no model', async () => {
  const e = evidence();
  const invalid: unknown[] = [null, { ...e, session: { ...e.session, status: 'open' } },
    { ...e, closedRevision: 7 }, { ...e, claim: { ...claim, claimToken: 'old' } },
    { ...e, claim: { ...claim, jobId: 'another-job' } },
    { ...e, session: { ...e.session, sessionId: 'another-session' } },
    { ...e, segments: [] }, { ...e, observations: [] },
    { ...e, segments: [{ ...e.segments[0], qualified: false }] },
    { ...e, observations: [{ ...e.observations[0], segmentId: 'not-qualified' }] },
    { ...e, observations: [{ ...e.observations[0], sessionId: 'other' }] },
    { ...e, observations: [{ ...e.observations[0], activity: 'pronunciation' }] },
    { ...e, observations: [{ ...e.observations[0], transcript: 'must not enter app evidence' }] },
    { ...e, audio: new Uint8Array([1]) },
  ];
  for (const value of invalid) {
    const f = fixture(); f.setEvidence(value);
    assert.equal((await f.service.afterConfirmedClose('job')).status, 'insufficient-evidence');
    assert.equal(f.calls(), 0); assert.equal(f.stored(), undefined);
  }
});

test('cancel, no-call close and segment stop have no eligible job and no generation', async () => {
  const f = fixture();
  for (const absent of ['cancelled', 'no-call', 'stopped']) {
    assert.equal((await f.service.afterConfirmedClose(absent)).status, 'not-claimed');
  }
  assert.equal(f.calls(), 0); assert.equal(f.stored(), undefined);
  assert.deepEqual(Object.keys(f.service), ['afterConfirmedClose', 'afterManualRetry']);
});

test('explicit retry requires a durable requeue and produces one comment without automatic retry', async () => {
  const f = fixture(); f.failGeneration(true);
  assert.equal((await f.service.afterConfirmedClose('job')).status, 'failed');
  assert.equal(f.calls(), 1);
  assert.equal((await f.service.afterManualRetry('job')).status, 'not-claimed');
  assert.equal(f.calls(), 1);
  f.manualRequeue(); f.failGeneration(false);
  assert.equal((await f.service.afterManualRetry('job')).status, 'stored');
  assert.equal((await f.service.afterManualRetry('job')).status, 'not-claimed');
  assert.equal(f.calls(), 2); assert.ok(f.stored());
  assert.doesNotMatch(JSON.stringify(f.events), /secret|claimToken|observations|audio/);
});

test('superseded claim cannot store a late generated result', async () => {
  const f = fixture(); const complete = f.repository.complete;
  f.repository.complete = async (ref, comment) => { f.supersede(); return complete(ref, comment); };
  assert.equal((await f.service.afterConfirmedClose('job')).status, 'stale');
  assert.equal(f.stored(), undefined);
});

test('policy validates grounded language, preserves uncertainty and excludes grades and pronunciation claims', async () => {
  const e = evidence();
  const policy = createFeedbackPolicy({ async read() { return e; } });
  const result = await policy.evidence(claim); assert.equal(result.status, 'sufficient');
  if (result.status !== 'sufficient') return;
  const snapshot = result.snapshot;
  assert.equal(policy.accepts(snapshot.value.allowedComments[0]!, snapshot), true);
  for (const unsupported of ['You scored 9/10.', 'Your pronunciation is excellent.',
    'Your practice in tense identification includes accepted responses. Keep building on this work.',
    'Your practice in written verb forms includes accepted responses. Keep building on this work.']) {
    assert.equal(policy.accepts(unsupported, snapshot), false);
  }
  assert.throws(() => (snapshot.value.allowedComments as string[]).push('fake'));
  assert.throws(() => Object.assign(snapshot.value.observations[0]!, { outcome: 'accepted' }));
  const uncertain = createFeedbackPolicy({ async read() {
    return { ...e, observations: [{ ...e.observations[0], outcome: 'uncertain' }] };
  } });
  const pending = await uncertain.evidence(claim); assert.equal(pending.status, 'sufficient');
  if (pending.status === 'sufficient') assert.match(pending.snapshot.value.allowedComments[0]!, /remain uncertain/);
  const tooShort = createFeedbackPolicy({ async read() { return e; } }, { maxCommentCharacters: 1 });
  assert.equal((await tooShort.evidence(claim)).status, 'insufficient-evidence');
});
