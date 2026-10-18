# P2 PostgreSQL and authentication handoff

Interface base: `8316baa745acf0280181cf72ef6fa400561dcd05` (PR12).
Accepted application base: `c0b4e470aef77050792122a42f67e6633653a5c6`.
Branch: `feat/p2-postgres-repositories`. The draft PR pins the delivery head.
Sole integration writer: `01a14e4c-74cd-7047-9c85-194a390d3001`.

This producer owns only new auth/accounts/data modules, migration bodies here,
and `tests/p2-*.test.ts`. Nothing is mounted or enabled in the root server.
The actual app, eight tenses, 25 verbs, photographs and oral/written gates are
unchanged. Requested Astra/medium routing is not independently observable in this
executor. No agents were launched.

## Consumer interfaces

- `createAuthAdapter({ pool, origin, secret, policy })` in `server/auth/better-auth.ts`
  uses pinned Better Auth 1.7.10 and pg 8.23.1. `identity(headers)` validates the
  library database session and current disabled state; it returns `{ userId }`.
  `handle(request, clientAddress)` exposes only email sign-in and sign-out.
  Root must supply a verified socket/trusted-proxy address, never a browser-provided
  forwarding header. The wrapper replaces the internal rate-limit address header.
  Root must keep logout unavailable until its exercise-close behavior is decided.
  Library signup, recovery, profile/session/password settings routes are not exposed.
  Successful login returns only `{ ok: true }` and library cookies, never the
  library bearer token. `/api/me` must use the account repository for canonical DTOs.
- `createAccountRepository(pool, accessPolicy, disclosurePolicy?)` in
  `server/accounts/repository.ts`: `me(identity)`, `listUsers(identity,cursor?,limit?)`,
  `listAllStudents(identity,cursor?,limit?)`, and
  `readProgressPage(identity,studentId,cursor?,limit?)`. Page limits are 1-100,
  with opaque encoded ID cursors. `listStudents(identity,after?,limit?)` is a
  lower-level bounded ID-cursor read; UI adapters should use the page methods.
  Explicit capability names are `users:list`, `students:list`,
  `students:feedback:read`, and `practice:own`. There is no default role mapping.
  Authorization reloads role/disabled state and holds a shared row lock throughout
  each repository operation. Administrator does not inherit professor reads.
- `createLearningRepository(pool, identity, dataPolicy)` in `repository.ts` returns
  `commands: SessionCommands`, `registerInstance(ExerciseIdentity)` and
  `submit(sessionId, unknown): Promise<ProgressBatchResult>`.
  Bind identity from the auth adapter for each request. `registerInstance` is a
  server composition seam for issued exercises; do not expose it as an endpoint
  that accepts arbitrary client identity claims. No client actor/role override is
  accepted in session command bodies. Use `readBoundedJson(request)` before JSON
  dispatch, plus root same-origin/content-type enforcement and rate limiting.
- `createFeedbackRepository(pool, feedbackStoragePolicy?)` returns the frozen
  `FeedbackRepository` plus `recordInsufficient(claim): Promise<'recorded'|'stale'>`.
  P6 wiring is `repository: adapter, recordInsufficient: adapter.recordInsufficient`.
  All methods are closures and need no `this` binding. No client endpoint may expose
  claim tokens. Claims require pending state, a closed session and an existing call
  segment. Only the close transaction enqueues jobs under the injected eligibility
  policy. Complete/fail/insufficient all compare job ID, session ID, token and running
  state atomically. A terminal result clears the token; no requeue or lease expiry
  is implemented. Comment insert and succeeded state commit together.

## Transaction and migration guarantees

Apply `migrations/p2-auth.sql` then `migrations/p2-learning.sql` using the root-owned
migration registry. Each new version must run once in a transaction; these bodies
are intentionally not self-registering or self-repairing. Auth SQL was generated
from the installed pinned Better Auth migration API against an empty disposable
PostgreSQL database. Its auth/session/credential/verification/rate-limit columns
are library-owned, not learning evidence. Account provisioning must eventually
create matching library user and `learning_users.id` records atomically; no
provisioning, role-edit or account-deletion API is selected here. The two user
stores currently have an application identity join, not an automatic lifecycle
cascade or auth-table foreign key. That lifecycle requires Q10.

Per-session row locks serialize event, call, instance and close mutations.
Progress uses the frozen pure batch specification with database-backed receipt
and attempt rows, only loading affected event IDs/obligations. Exact-key validation,
registered instance ownership and open-state checks happen before event writes.
Any stale/conflicting/invalid member returns a rejected batch with unchanged
journal revision and no acknowledgments; SQL failure throws after rollback.
Ambiguous COMMIT failure never returns a success receipt and never silently retries.
Identical replays retain their original committed revision; current journal and
lifecycle revisions remain separate. Repeated events in one batch write once.

Operation receipts are unique per actor/operation ID; reuse with a changed command
body conflicts. Advisory transaction locks serialize the same key, including
session creation. Close checks both expected lifecycle revision and exact final
journal fence, then closes the session, ends segments, stores its immutable close
receipt and enqueues at most one job in one transaction. No-call close never queues
feedback. Stop never queues feedback. A replay returns the original close receipt;
`readClose` is reconciliation, not a live feedback-state polling endpoint. The
account progress read joins current feedback state and comments by canonical session.

No audio, transcript, submitted answer, prompt, provider payload or free-form
learning evidence is accepted into the progress journal. Event source remains
`client-reported`; written success is not promoted to an oral verdict. No metrics,
activity totals, numerical grades or evidence snapshots are computed.

## Policy and integration gaps

Defaults deny every unresolved capability and every structured-data write. Callers
must inject an explicitly approved storage/access policy; fixture policies are
not production recommendations. Q10 still controls account creation/recovery,
password/session values, remember-me, refresh, role grants and user lifecycle.
The auth factory requires those numerical settings and switches. Authorization
reads explicitly disable refresh; a future approved refresh endpoint/cookie flow
still needs root wiring. The library's implicit one-day expiry for rememberMe=false
is overridden by the supplied session lifetime. Secure cookies follow HTTPS;
HTTP is accepted only for localhost/127.0.0.1 fixture/development origins.

Q11 metric/time definitions are absent. Q12 call qualification and recovery, and
Q13 evidence, sufficiency, qualitative validation, disclosure and retention remain
unselected. `feedbackOnClose` receives only canonical started-segment references;
these are NOT connected-call or acoustic evidence. With any segment and no injected
qualification policy, close fails `policy-unresolved` without writes. Do not supply
the fixture `() => 'pending'` policy in production. No retry scheduler or production
feedback provider/evidence reader exists. `FeedbackStoragePolicy.acceptComment`
is an injected approved validation/retention boundary, not a semantic validator
implemented here. `DisclosurePolicy` also defaults to blocked.

Reviewed P6 PR13 `16147d1226254c5a3ea5188bacf7ad2a70dd2245`: its
`recordInsufficient` request is implemented and tested with the actual coordinator.
P6 implementation remains untouched. A shared-contract addition is unnecessary
for its existing local dependency seam; integrator owns any future promotion.

Reviewed P3 PR14 `effaf005ad523bec0bc9b9567609e0387f3f0992`: login maps
sign-in then `/api/me`; list methods map to `{ status:'ok', value:page }` after
server validation. Map 401/403 to denied, other failures to errors; honor AbortSignal
in HTTP adapters. Root supplies private/no-store headers and auth-epoch reset.
`readProgressPage` returns `{ studentId, sessions: { items, nextCursor } }`, whereas
P3 currently expects an unpaginated sessions array. Integrator must add bounded
session pagination or an explicitly reviewed view limit; do not drop remaining
pages silently. No frontend files or shared DTOs were changed.

Reviewed P4 PR15 `86d2db48d91eb7cf9ebb9e0cc55dd85e24891041`: commands
match its frozen lifecycle seam. Server-connected receipt and broker segment/epoch
binding are still missing from shared contracts. Integrator must freeze that seam
before trusting connection qualification; client observations cannot be promoted
to authoritative evidence. Spoken stop, abrupt exits, auth expiry and ambiguous
start/stop/close recovery remain policy/integration gaps. Root HTTP dispatch,
provider-route authorization, migration registration and all consumer adapters
remain solely integrator-owned.

## Verification receipt

Disposable PostgreSQL 17 Alpine image digest:
`sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
Only a loopback ephemeral test container/database was used. Tests create/drop
isolated schemas in database `p2_test`; the runner refuses other database names
or non-loopback URLs. Synthetic users and a fixture-only secret exist only in
that disposable database/test process. No live credentials/accounts or paid calls.

- `npm ci --cache /tmp/p2-npm-cache`: passed, 79 packages. Initial default-cache
  attempt failed because `/home/agent/.npm/_cacache` was unwritable; unchanged lockfile.
- Targeted `tests/p2-*.test.ts`: 15/15 pass, no skips when both optional fixture
  variables below are supplied. Covers real library login/logout/expiry/disabled
  users, HTTP/body boundaries, access/current-role matrix, cross-user isolation,
  concurrent replay, honest rollback, separate revisions, close/event races,
  no-call/stop behavior, stale claims, insufficient evidence, atomic job/comment
  failures, pagination and transaction-wrapped migration failure.
- Actual P6 coordinator from exact PR13 source was loaded from a temporary file;
  PostgreSQL integration confirms insufficient evidence, duplicate delivery and
  zero model calls. No P6 service source was copied into this commit.
- Final `npm run check` with the isolated DB/P6 variables: 234 Node passes out of
  237 tests (three existing opt-in browser skips), 26 Python/content tests,
  strict TypeScript and Vite build pass. Existing 530.35 kB bundle warning remains.
- First full check failed the unchanged voice-server concurrent release fixture
  at line 192 (`403 !== 200`). Isolated voice-server rerun: 16/16 pass; full rerun
  passes. Preserve this observed nondeterminism; this task does not claim its cause
  or repair. No browser/physical-device/live-provider validation was performed.
- `git diff --check`, English PR/commit checks and the Atlas identity guard run
  before publication. Per-command author/committer overrides preserve the existing
  global identity setting. Hosted CI status is reported separately in the PR.

Reproduce after preparing the disposable loopback database and applying no manual
schema changes (tests install their own schemas):

```sh
git show 16147d1226254c5a3ea5188bacf7ad2a70dd2245:server/feedback/coordinator.ts > /tmp/p2-p6-coordinator.ts
P2_DISPOSABLE_DATABASE_URL=postgres://postgres@127.0.0.1:55432/p2_test \
P2_P6_COORDINATOR=file:///tmp/p2-p6-coordinator.ts \
node --import tsx --test tests/p2-*.test.ts
```

Without the DB variable, database tests skip explicitly; do not call that a DB
validation pass. Temporary evidence logs are `/tmp/p2-targeted.log`,
`/tmp/p2-check.log`, `/tmp/p2-check-final.log`, `/tmp/p2-voice-recheck.log` and
`/tmp/p2-npm-ci.log`. Atlas navigation skill and merged plan/decisions at
`b24bad2ed6fa3360bdd3a877af755870df11b866` were read. Coordinator owns Atlas intake;
report this as a tested draft producer slice, not integrated, merged or deployed.
