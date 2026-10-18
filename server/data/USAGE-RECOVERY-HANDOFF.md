# P2 approved time and recovery amendment

This additive amendment supersedes time/retry-pending statements in the initial
P2 receipt and `server/accounts/POLICY-HANDOFF.md`. It follows the parent's newly
relayed user decisions. Daily timezone and retention duration remain unselected.
No shared contracts, P4/P5/P6 modules, root routing, migration registry or Phoenix
transport were edited. P3 owns the management/daily UI; P4 resume/finalize UI;
P5 the IndexedDB progress queue; integrator owns their shared interface promotion.

## Shared interface requests and supplied local adapters

These types are exported from owned modules as proposed integration seams, not
silently added to shared contracts:

- `createUsageRepository(pool, authenticatedIdentity, dataPolicy, ports?)` in
  `usage.ts`: `openWrittenStream(sessionId): Promise<string>`,
  `written(WrittenObservation): Promise<UsageReceipt>` and the INTERNAL
  `tutor(TutorObservation): Promise<UsageReceipt>`.
- Written observation: `{ schemaVersion:1, sessionId, streamId, eventId, sequence,
  kind:'visible'|'hidden'|'input'|'tap' }`. Stream IDs are server-issued per mounted
  tab/session. Sequence starts at 1 and increments exactly once per observation.
  Root/P5 must order and acknowledge transitions; sequence gaps/stale events
  conflict instead of being applied to a newer visibility state.
- Tutor observation: `{ schemaVersion:1, segment:{sessionId,segmentId,connectionEpoch},
  eventId, sequence, kind:'connected'|'disconnected' }`. Root must supply a genuine
  server-verifiable transport observation and `ports.verifyTutorTransition`.
  Absence/false returns `policy-unresolved` without writes. Never expose this method
  as an endpoint accepting browser connection assertions. An SDP-created response
  alone is insufficient. Verification must authenticate the immutable observation,
  not merely look at current connection status, so exact replay remains verifiable.
  It runs under a session lock and must not reenter a mutating session repository.
- Receipt: `{ eventId, sequence, intervalId, observedAt, status:'recorded'|'duplicate' }`.
  All endpoints/totals come from the server database clock. No client timestamp,
  elapsed total, transcript, text input or arbitrary extra property is accepted.
- `createRecoveryRepository(pool, identity, dataPolicy)` in `recovery.ts`:
  `listOpen(cursor?,limit?)`, `read(sessionId): Promise<RecoverySnapshot>`, and
  `retryFailedFeedback(RetryFeedbackRequest): Promise<RetryFeedbackResult>`.
  Recovery snapshot contains canonical `session`, final `progress` journal fence,
  `activeSegments`, and optional `{jobId,state,retryRevision}`. It never returns raw
  answers/transcripts or pretends to reconstruct current drafts from stored outcomes.
- Retry input: `{ sessionId, jobId, operationId, expectedRetryRevision }`; output:
  `{ sessionId, jobId, state:'pending', retryRevision }`. The new retry revision is
  independent of lifecycle, progress and receipt revisions. An exact retry request
  returns its stored receipt; a changed body/key expectation conflicts.

Integrator must promote/approve these seams before HTTP/client wiring. This task
implements the owned database adapters and behavior tests, not an alternative
root lifecycle or client queue.

## Approved interval semantics and evidence limits

Written time starts on input/tap while the exercise is reported visible. Visible
alone does not manufacture an interaction. Each further input/tap extends the
current interval to two minutes after that interaction. Queries clip prospective
idle endpoints to the current observation time. Idle expiry creates a gap; a later
input/tap opens a new interval. Hidden closes at the earlier of hide receipt and
idle expiry; hidden input cannot resume counting. Replay does not extend the
interval, change its identity or add another interval. Interval IDs are server-made.

Tutor time starts only on a verified connected transition, continues through
listening without UI activity, and ends on verified disconnection. Reconnection
opens another interval and leaves the gap excluded. Existing explicit segment stop
and session close finalize the corresponding streams within their session
transaction. Stopping a tutor segment does not end written streams. Session close
ends all streams and later time writes cannot modify that closed session.

`readUsageForWindow` uses PostgreSQL multiranges to union intervals within written,
within tutor, and across BOTH sources and all tabs/visits. Returned `writtenMs`,
`tutorConnectedMs`, and `totalMs` therefore do not double-count overlap. The daily
projection now returns this summary in `usageTime` instead of null, while undefined
learning metric totals remain null. Daily bounds still require an injected timezone
and attribution policy. There is no student-configured timezone selection/default.

Written visibility/activity is necessarily `client-reported-interaction`, not
independently verified human behavior. Tutor measurements are labeled
`server-observed-connection`; root must actually supply and reliably terminate that
signal before enabling this adapter. The test verifier/clock are fixtures, not a
production authority or physical connection validation. Missing hidden/disconnect
signals, abrupt browser/process loss and offline time cannot be reconstructed from
raw progress outcomes. No speculative heartbeat timeout or backdated client total
is added. Written inactivity caps unobserved continuation at two minutes; genuine
transport cleanup remains root-owned. These are recorded-interval totals, not a
claim of complete real-world activity capture.

## Resume, finalize and manual retry

Resume uses the SAME open exercise session and existing journal; it creates no
new session, resets no daily history, and does not rerun accepted events. P5's
IndexedDB queue must replay original event IDs/bodies through the existing atomic
`submit` adapter and wait for committed/duplicate receipts. There is no exit-only
saving. P4/root own local draft restore and the decision to resume versus finalize.
`listOpen` lists candidates only; it does not assert every open session is abandoned.
Any still-active broker connection must be reconciled/cleaned up by its root owner
before replacement. This repository does not force-stop another live browser.

Finalize reuses `SessionCommands.confirmClose`: P4 gets called-session confirmation,
P5 freezes/flushes the queue, root obtains current revision, then P2 checks the exact
journal fence and closes once. Failed final flush must not dispatch close. No-call
finalize creates no feedback job. Grounded comment creation/insufficient evidence
remain P6's injected evidence/model policy with the existing fenced repository.
No raw audio/transcript or provider body is added to the app queue/database.
The user requested interaction/transcript instrumentation only through Phoenix;
that transport stays with the existing instrumentation/root owner and was not
changed, invoked or live-export-tested here.

A failed feedback job stays recoverable with state `failed` until the user manually
requests retry; UI may label it pending manual retry, never successful. The command
requeues the SAME job only from failed state, with no stored comment and matching
retry revision. Two identical requests commit one retry. Claim produces a fresh
token; old worker tokens cannot complete/fail/mark insufficient on the new attempt.
Succeeded, insufficient, pending and running jobs cannot be manually requeued by
this command. No automatic retry loop, paid call, new comment row or second job.
Hung-running-worker recovery still needs a coordinated worker-ownership decision;
it is not disguised as a safe failed-job retry. Comment/evidence retention and a
production grounded-evidence policy remain required before wiring P6.

## Migrations and tests

Apply the two further bodies `p2-usage.sql`, then `p2-recovery.sql`, after the
previous `p2-auth`, `p2-learning`, `p2-admin`, `p2-day-projection` bodies. Root owns
the registry and must run pending versions transactionally before mounting the
new code. No existing stored event/session identity or journal revision changes.

New `tests/p2-usage-recovery.test.ts` exercises hidden/idle/resume/replay, separate
listening/reconnect time, cross-source and cross-tab overlap, stop/close fences,
owner isolation, resume snapshots, concurrent manual retry and stale worker tokens
against isolated PostgreSQL. Existing auth, management, daily and P6 integration
tests continue alongside it. No UI/browser, physical tutor connection, provider,
Phoenix export, production account, deployment or live credential is exercised.
Final combined counts, exact head and any failures are pinned in PR17.

Final local evidence for this amendment: 28/28 P2 tests pass; full `npm run check`
passes 247/250 Node tests (three existing browser skips), 26 Python/content tests,
strict TypeScript and Vite build. Existing bundle-size warning remains. An earlier
parallel targeted run exposed Better Auth introspection racing another fixture's
schema DROP. Test fixtures now serialize their lifetimes with a disposable-database
advisory lock; concurrent operations within each race test remain concurrent. Final
targeted and full runs pass after that harness correction. Logs are
`/tmp/p2-usage-all-targeted-final.log` and `/tmp/p2-usage-check-final.log`; the failed
run is preserved at `/tmp/p2-usage-all-targeted.log`. No production database behavior
or library code was changed to conceal that fixture race.
