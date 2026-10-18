# P1 draft: accounts, progress and optional tutor sessions

Status: inspection and architecture proposal ONLY; NOT frozen or implemented.
Date: 2026-10-18. Owner: delegated P1 / EN-WP-01.
Coordinator: `01a118ed-6bf7-7481-93e6-336de48270f7`.
Sole P0/integration writer: `01a14e4c-74cd-7047-9c85-194a390d3001`.
Accepted P0 base: `c0b4e470aef77050792122a42f67e6633653a5c6` (parent receipt,
independently fetched). No producer dispatch authorized here.

## Authority and evidence

[Atlas approved dispatch](https://github.com/pablitxn/sysadmin-workspace/blob/a9ad0a0385714c9739a4ff60fef9525da2e0e633/atlas/wiki/english-learning-backlog.md#detailed-dispatch-plan-2026-10-18)
and [EN-D16-D23 / EN-Q10-Q13](https://github.com/pablitxn/sysadmin-workspace/blob/a9ad0a0385714c9739a4ff60fef9525da2e0e633/atlas/entries/2026-10-17-english-learning-past-tenses.md)
govern this proposal. Existing architecture documents remain historical actual
implementation evidence where they describe automatic voice or memory-only data.
Only this new app-owned document is edited. Atlas/Notion intake stays with parent.

Fetched application main: `9dd7f28d823751d7e56d81756d15ff3660bf1d19`.
Fetched PR11: `8a567553731ced5e7cde3f34a00e6ecd7481bb40`.
Initial draft started from the observed main without editing PR11. Parent has
now admitted PR11. An additive merge reconciles this branch with accepted P0
`c0b4e470aef77050792122a42f67e6633653a5c6`; tree
`11786917fb2ab978d2a0a5f1ec3dae09bbc6168a` matches reviewed PR11 exactly.
No code delta is introduced by P1. See the technical freeze proposal below.
Hosted PR metadata query failed with GraphQL Forbidden; Git fetch succeeded.
P0 owns candidate admission, checks, flake/provenance review and merge disposition.

Actual pinned source inspected through read-only Git clones, including AGENTS:

| Repository and pin | Files / observations |
| --- | --- |
| T3 `75c4c06ac6561ba3b7caab48821a5ed3bb139144` | `apps/api/src/accounts.ts`: Better Auth email/password, disabled signup, database role/suspension checked on authorization, session cache disabled, origin checks. `apps/api/src/app-database.ts`: Kysely PostgreSQL or SQLite, application tables and foreign keys. |
| Klisteni `d1c8fd58d30d1a1ff1fe76abd01d01dd435f9781` | `apps/b2c-api/src/auth.ts`: Better Auth PostgreSQL, disabled signup, database rate limits and disabled-user check. `database.ts`: user-owned rows, composite keys, migration marker. `apps/b2b-api/src/auth.ts`: separate model/cookie namespace. |

T3 uses an eight-hour session policy; Klisteni B2C thirty days and B2B seven days.
These are observations, NOT Lang Lessons choices. Do not copy invitations,
billing/credits, tenants, roles, password limits, retention or session durations.
No reference app tests, live database, credentials, runtime or Mac were accessed.

Inspected PR11 paths: `src/app/LessonSession.tsx` still starts runtime in an effect
when context becomes ready. `session-runtime.ts` already retains session ID across
stop/start and guards connection epochs. `server/index.ts` starts the server;
`server/realtime.ts` owns HTTP dispatch and the process-wide voice lease;
`server/sentence-hints.ts` supplies optional paid text hints. The lease is NOT
account authorization or a per-user session store. Candidate written work must
be retained, but its local checks are not durable progress or authenticated truth.

## Proposed routine technical choices

These require coordinator review before contract freeze, not another product vote.

- Keep React/Vite/TypeScript and the Node server. Avoid a framework migration.
- Use Better Auth for app-owned email/password and database sessions; no OAuth
  provider dependency. Pin a supported version after compatibility review in P2,
  with dependency/lockfile changes applied only by integrator. Do not hand-roll
  password hashing or treat bearer voice leases as login sessions.
- Prefer PostgreSQL with an injected repository interface and isolated local test
  database. Its transactions/unique constraints fit concurrent progress and close
  operations and match Klisteni. SQLite is a fallback proposal if local PostgreSQL
  is unavailable, not an automatically supported second production dialect.
  Database hosting, provisioning and credentials are outside this task.
- Same-origin cookie auth, HttpOnly, SameSite and Secure for HTTPS, no browser
  token storage; server checks current role/disabled state on every protected
  operation. Reject cross-origin mutations, validate request bodies and enforce
  bounded sizes/rate limits. Password/expiry/remember-me policy remains Q10.
- Define explicit capabilities rather than an inherited role hierarchy. Deny
  unresolved grants. Server derives actor/user ownership; never accept actor IDs,
  roles, trusted assessment provenance or metric totals from client assertions.
- Use database transactions, unique operation keys and optimistic revisions.
  APIs are at-least-once; one stored result does not promise exactly-once provider
  execution. No raw audio, transcript, prompt or answer text in the proposed
  durable schema or logs. Auth tokens remain library-owned and excluded from logs.

## Requirement-to-contract map

| Decision | Proposed surface | Evidence to require later |
| --- | --- | --- |
| D16 own login | Auth adapter, credential/account/session tables, login/logout/me | Isolated DB login/revocation, no OAuth configuration |
| D17 three roles | Capability checks, admin users, professor all-student reads | Full role/object access matrix, current role changes |
| D18 metrics | Exercise instances, attempts, versioned projections, usage observations | Definition fixtures, deduplication, concurrent writes |
| D19 optional call | Explicit start/stop commands and independent segment IDs | Entry has zero media/provider requests |
| D20 independent practice | Written event sink and stable exercise session identity | No-call corrections/results; restart preserves drafts |
| D21 one comment | Confirm-close transaction and unique feedback job/session | Cancel/no-call/race/retry/segment isolation fixtures |
| D22/D23 execution | P0 accepted base then contract review then parent dispatch | Immutable base/head receipt; Astra medium routing |

## Proposed identities, schema and invariants

Names below are drafts, not shared code. Auth session is distinct from exercise
session. An exercise session spans a lesson visit and multiple exercise instances;
advancing to the next prompt is not session exit. Every tutor connection attempt
gets a new segment ID inside the same exercise session.

| Entity | Minimal proposed fields and constraints |
| --- | --- |
| Library auth records | User/account/auth-session/verification, app role enum `administrator/professor/student`, disabled flag; no client-writable role |
| ExerciseSession | `id`, `userId`, `mode`, `status: open/closed`, `revision`, server start/close times, `closeOperationId`; immutable owner |
| ExerciseInstance | `id`, `sessionId`, curriculum ID/version, mode, generation, ordinal; unique session/ordinal; no copied prompt text |
| PracticeAttempt | `id`, instance ID, obligation/stage, attempt revision, result enum, evidence source/trust, server received time, client event ID; unique session/event ID |
| CallSegment | `id`, session ID, sequence/epoch, connecting/connected/ended/failed, server timestamps, qualification state; at most one active segment per session |
| CloseOperation | unique session ID and operation ID, accepted revision, immutable response; same-key/different-body conflict |
| FeedbackJob | unique session ID, pending/running/succeeded/failed/insufficient-evidence, evidence snapshot version, claim token, retry metadata; no public retry behavior selected |
| ProfessorComment | unique session ID, qualitative text, generator/provenance version, created time; no score column; joins ownership via session |
| UsageObservation | Proposed transient input only until Q11: window/sequence, visibility and interaction markers, monotonic interval; no accepted active-time total yet |

Foreign keys constrain segment/attempt/session joins; ownership checked inside
mutating transactions. Untrusted browser events retain a source label and cannot
be promoted to verified acoustic evidence. Closed sessions reject new attempts
and new call starts. Event schemas exclude free-form provider payloads. Comments
and evidence require Q13 before durable retention policy can be finalized.

Store structured processed outcomes, not every keystroke. Invalid/uncertain,
transport failure and pending are not learner mistakes. Written success does not
satisfy an oral pronunciation obligation. No aggregate called "performance" is
computed before a definition is accepted; null/unavailable differs from zero.
Each projection will carry a metric-definition version so future corrections do
not silently redefine historical results.

## Proposed API contract

Common mutation envelope: `operationId`, `expectedRevision` where mutable session
state is involved, schema version and typed payload. Actor comes from cookie auth.
Responses include resource revision and stable operation result. Errors distinguish
401, 403, 404, 409 stale/conflicting replay, 422 invalid input and 429 throttling.
Read responses are private/no-store. List endpoints use bounded cursor pagination.

| Surface | Request / result / authority |
| --- | --- |
| `/api/auth/*` | Library-backed login/logout/session; signup/recovery routes only after Q10 |
| `GET /api/me` | Minimal current user and explicit capabilities |
| `/api/admin/users` | Admin list/create/update/disable proposals; exact editable fields/lifecycle Q10; never credential hash disclosure |
| `GET /api/professor/students` | Every student, not an assignment filter; professor only under confirmed grant |
| `GET /api/professor/students/:id/progress` | Student metrics and session comments; data fields/retention Q10/Q13 |
| `POST /api/exercise-sessions` | Mode and operation ID -> server-owned ID/open revision |
| `GET /api/exercise-sessions/:id` | Owner read for reconciliation; cross-user request denied |
| `POST /api/exercise-sessions/:id/events` | Bounded validated batch of instance/attempt events -> per-event stable acknowledgments; no userId override |
| `POST /api/exercise-sessions/:id/calls` | Explicit start -> fresh segment and epoch; atomic open-session check; existing broker requires this authorization |
| `POST /api/exercise-sessions/:id/calls/:segmentId/stop` | Idempotent stop; preserves session and creates no feedback |
| `POST /api/exercise-sessions/:id/close` | Explicit confirmation + operation ID/revision -> closed session and stable comment state; transactional once-per-session job |
| `GET /api/exercise-sessions/:id/close` | Reconcile lost close response; no second comment generation command |

Route strings may change at freeze. Existing realtime, text-hint and telemetry
routes also require explicit authorization integration, not just the new APIs.
Professor reads must never expose authentication records, evidence payloads or
unapproved student fields. Admin user-management authority does not automatically
grant progress/comment viewing; students' own history/comment views remain Q10.

## Lifecycle and concurrency contract

1. Enter lesson: allocate/open exercise session and render practice. No microphone,
   voice readiness request, tutor call or feedback request on entry.
2. Start button: open fresh call segment, then explicitly connect. Bind callbacks
   to session + segment + connection epoch. Late old-segment callbacks are ignored.
3. Stop: close that segment and media resources; preserve exercise ID/generation,
   drafts, accepted work, settings, history and session ID. No comment/job.
4. Request exit: if a qualifying call occurred, show the specified warning. This
   is a local confirmation state, not a server close. Cancel keeps session and
   work; no feedback request. Do not implicitly hang up an active call on cancel.
5. Confirm: submit one close operation. Server serializes close against call start
   and events. Accept final valid progress before close within an agreed boundary;
   reject late writes after committed close rather than attach to another session.
   Called session gets one feedback job; no-call close gets none. Close and job
   insertion are atomic. Media cleanup follows confirmed close; abrupt cleanup
   alone must not be treated as confirmation.
6. Feedback worker uses a frozen approved evidence snapshot across qualifying
   segments, claims job with fencing token and writes one comment by unique session
   key. Model output is untrusted, qualitative-only, length-bounded and grounded.
   Stale workers cannot overwrite a completed comment. Failed inference is not an
   empty successful comment. Q12 determines retry UX and recovery policy.

Confirmation cancellation never mutates the durable closed state. Once confirm
has been accepted, a late cancel cannot reopen it. Buttons/response handlers must
check session identity before navigation. Browser back, route changes and mode
changes need the same root exit interceptor. Pagehide can stop media but cannot
reliably promise a popup, close acknowledgment or model generation. Abrupt exit,
refresh, logout, expiry and account disable require Q12; do not silently synthesize
consent or keep a permanently retrying paid task.

## Minimal product questions for parent (only affected slices blocked)

- **Q10 account/access:** Admin-created accounts only, invitations or public signup?
  Who supplies initial activation and recovery, and can admins change roles,
  disable/reactivate/delete users? May students view their own history/comment,
  and may admins view progress/comments? Are professor reads limited to the
  specified progress/comments or additional personal fields? Password/session
  lifetime and remember-me need an explicit policy proposal reviewed before use.
  Proposed starting scope: admin-managed accounts, no public signup, professors
  read all students' agreed learning data, no editing/export grants. Not approved.
- **Q11 metrics/time:** Does performed mean first submitted attempt or opened
  exercise, and does solved mean written completion, all applicable oral gates,
  or separate written/oral completion? Count mistakes per processed attempt or
  per field/exercise? What performance denominator is intended? Should time count
  visible recent activity only; what idle threshold, background/offline and
  concurrent-tab handling? Propose separate written/oral results and union of
  qualifying time intervals, but do not choose threshold or denominator silently.
- **Q12 call/exit:** Does a call count after connection, after learner interaction,
  or even a failed start? After refresh/crash/disconnection, resume or abandon?
  Should confirmed exit navigate immediately with pending feedback, or wait?
  How should failed generation retry and become visible? Propose connected segment
  as call threshold and durable pending feedback on explicit close, with bounded
  retries only once policy/budget is authorized. Not approved.
- **Q13 evidence/privacy:** May we retain minimal structured interaction summaries
  across segments for the one comment, with what permitted fields/source trust?
  What is sufficient evidence, and what should professors see when insufficient?
  Who may see/delete comments and learning history, and for how long should each
  data category remain? Propose no raw audio/transcript retention and an explicit
  insufficient-evidence state, not fabricated feedback. No retention duration,
  storage quota or durable summary capture is selected.

## Proposed disjoint ownership and independent slices

All ownership below is pending parent freeze on accepted P0 base. All producers
use Astra medium and are launched only by parent. No shared contract code by P1
until expressly handed off; integrator remains sole writer for shared paths.

| Owner | Exclusive proposed paths / boundary |
| --- | --- |
| P1 | This ADR and task-specific intake only now; shared type proposal delivered to integrator, not edited concurrently |
| Integrator/P0 | Manifests/lockfile/config/env examples, AGENTS, README, root routing/App/global styles, `src/contracts/**`, `server/index.ts`, `server/realtime.ts`, migration registry, aggregate docs/evidence |
| P2 | New `server/auth/**`, `server/accounts/**`, `server/data/**`, assigned numbered migrations, `tests/p2-*.test.ts`; only P2 writes schema bodies, including P6 requests |
| P3 | New accounts/administration/professor feature directories, scoped CSS, `tests/p3-*.test.ts`; routing requested from integrator |
| P4 | `src/app/LessonSession.tsx`, `src/app/session-runtime.ts`, `src/app/VoiceStatus.tsx`, new lifecycle UI, `tests/p4-*.test.ts`; voice adapter edits only if exact paths assigned before dispatch |
| P5 | Existing verb/sentence feature directories, new progress feature directory, `tests/p5-*.test.ts`; preserve curriculum/photo/assets; no root edits |
| P6 | New `server/feedback/**`, `tests/p6-*.test.ts`; DB/realtime wiring requested from P2/integrator |
| P7 | Dedicated regression/evidence paths; repairs returned to owners |

Existing tests and voice/protocol files are not implicitly shared. Integrator
assigns each additional existing test or adapter file to one owner at dispatch.
`src/ui/mobile/SpellingField.tsx` and other common UI remain integrator-owned unless
explicitly reassigned. P4 passes typed event sinks to P5 through frozen props;
P6 consumes P2 repository interfaces, never imports migration internals.

Independently ready for preparation now: role matrix fixtures; pure lifecycle
transition/epoch test cases; no-auto-start and stop/restart scenarios; event
validation/deduplication examples; P3 read-only fixture layouts. After base and
interface freeze, P2 adapter/repository skeletons, P3 fixtures, P4 explicit-call
flow, P5 written event transport and P6 injected-client job guards can proceed.
Q11 gates aggregate/time semantics, not written correction; Q13 gates durable
evidence/retention, not no-call practice; Q12 gates abrupt/retry UX, not cancel.

## Migration and validation plan

P2 proposes versioned additive migrations for auth then app tables, exact foreign
keys/uniqueness and migration registry checks. Run against empty and prior-version
isolated databases, rerun for idempotence, inject mid-migration failures, and verify
rollback/transaction behavior. Do not migrate browser preferences into identities
or claim historical memory-only progress existed. No live migration or account
bootstrap is executed. Parent chooses engine before dialect-specific DDL freezes.

After implementation run npm ci and npm run check plus meaningful isolated DB
and mocked browser tests at exact combined head: login/revoke/disabled role checks;
cross-user and all-student reads; mutation CSRF; duplicate/conflicting payload;
call-start/close and event/close races; two-worker feedback claim; lost close reply;
no-call and cancel produce no job; multiple segments one comment; malformed or
stale events; no raw payload logs; written/oral evidence separation; focus/keyboard
confirmation and mobile reflow. No paid model, physical microphone/device, linguistic
quality, deployment or provider retention acceptance follows from these tests.

## Inspection receipt and remaining gates

Read app/Atlas instructions, architecture/handoff, Atlas navigation and maintenance
skills, source-of-truth/privacy and engineering/integration standards. Maintenance
skill was read for intake boundaries; no Atlas maintenance performed. Read merged
Atlas plan/minutes/source and pinned reference login files. Git fetches and isolated
worktree creation succeeded. GitHub GraphQL PR query was forbidden; no credentials
or access settings were changed. Docs-only checks are recorded in the final receipt;
application checks remain P0's scope and were not rerun for this prose-only draft.

Requested model/effort: gpt-6-astra / medium. Runtime metadata does not expose an
independently verifiable accepted model/effort receipt; no switch or speed claim.
Remaining gates: coordinator ADR/interface review, answers only
for dependent policy slices, explicit shared ownership handoff, then parent dispatch.


## Post-P0 technical freeze proposal (amendment, 2026-10-18)

P0 dependency is satisfied. This section is ready for parent technical review;
writing it does not freeze shared code. Q10-Q13 have been sent to the user and
remain unanswered. Earlier follow-ups marked UNKNOWN are not admitted. Only the
new P5 improvement explicitly relayed by parent is incorporated below.

### Proposed interface allocation

Integrator alone materializes these proposed shared files and barrel exports.
Consumers import contracts, never one another's implementation. Existing
`ExerciseIdentity`, `AttemptRef`, evidence-source and obligation types are reused,
not replaced by a second identity scheme. `sessionId` denotes the exercise session;
`segmentId` and `connectionEpoch` separately identify optional tutor connections.

| Proposed shared file | Exports / invariant | Consumer owners |
| --- | --- | --- |
| `src/contracts/accounts.ts` | `Role`, minimal `CurrentUser`, explicit `Capabilities`, public user DTO; role assignment absent from client writable DTO | P2/P3 |
| `src/contracts/progress.ts` | `PracticeEvent`, `PracticeEventAck`, `ProgressSink`; event ID + existing exercise/attempt ref + typed result/source; no submitted text or derived totals | P2/P4/P5 |
| `src/contracts/session.ts` | `SessionSnapshot`, `CallSegmentRef`, `SessionCommands`, `CloseResult`; revision-bound mutations and stable operation IDs | P2/P4/P6 |
| `src/contracts/feedback.ts` | `FeedbackState`, `FeedbackJobRef`, `ProfessorComment`; session-bound qualitative result without score; evidence DTO remains deferred to Q13 | P2/P3/P6 |
| `src/contracts/dictionary.ts` | `DictionaryEntry`, `DictionarySource`, `DictionarySense`; immutable source provenance per displayed field | P5 |

Proposed `ProgressSink.submit(events)` returns acknowledgments keyed by event ID
with accepted/duplicate/rejected and server revision, not inferred success from
HTTP alone. Batch transaction is all-or-nothing on invalid ownership/schema;
valid replay returns prior acknowledgment. Same ID with changed payload is a
conflict. Distinct events may legitimately share an attempt ref only if their
explicit event kind/revision allows it; accepted outcome must not be overwritten
by an older processing event. The integrator should freeze exact discriminants
with P2/P5 before coding, without selecting Q11 aggregate semantics.

Proposed `SessionCommands` has create/read/startCall/stopCall/confirmClose/readClose.
All mutations return the canonical session revision; confirmClose retries reuse
one operation ID. P4 owns local `requestExit`/`cancelExit` state: neither creates a
server feedback command. No client `generateComment` endpoint is exposed.
P2 supplies `FeedbackRepository.claim/complete/fail` transaction methods to P6;
claim fencing and unique session constraints enforce one stored final comment.
Public polling/retry cadence and evidence selection remain Q12/Q13-dependent.

Do not add a direct client "verified audio" boolean. Map existing evidence
sources through boundary validation and preserve client-reported trust. Q13 must
resolve whether available structured interaction is sufficient to ground a
comment; a database record alone does not authenticate browser-supplied content.

### Newly approved P5 dictionary and image behavior

Parent relays approval for a post-completion Pictures dictionary card containing
sourced English definitions, relevant senses, parts of speech, phonetics and
examples, with a Next button. Progress/Reference navigation appears only on home.
Upcoming-image preload/decode must be bounded. These requirements do not approve
a dictionary source or agent-authored dictionary wording.

Proposed flow: preserve the accepted Pictures completion predicate, then enter a
`dictionary` presentation state bound to the completed exercise ID/generation.
Hold automatic advance while that card is visible. Next explicitly advances once
and invalidates the old card/preload generation. Dictionary viewing/Next neither
starts/stops a tutor call nor ends the exercise session or creates a professor
comment. Do not extend this behavior to other modes without a requirement.
Completion metrics still await Q11; showing the card is not a new solved rule.

Proposed source model: entry lemma, ordered reviewed sense IDs, exact sourced
English definition/example strings, POS and pronunciation/dialect labels. Each
field links to source URL, immutable revision/snapshot ID, retrieval date and
license/attribution metadata; source content hash detects silent replacements.
Selection/formatting may be editorial, but supplied wording is not paraphrased,
invented or model-generated. Missing fields remain unavailable pending source
review, not synthesized. Relevant senses must be reviewed against the exercise;
no automatic all-senses dump or guessed phonetics. Any content adaptation must
be explicitly identified in provenance rather than presented as an exact quote.

A reviewed Wiktionary snapshot is only the parent's research recommendation.
Parent reports CC BY-SA 4.0 attribution obligations; source/version selection,
field provenance and actual applicable reuse terms still require source review.
No Wiktionary data was fetched, licensed or independently certified by this P1
amendment. Do not start corpus import or publish dictionary text before source
choice and license handling are accepted. This gate does not block card fixtures
with clearly labeled structural placeholders, Next behavior or image preparation.

Proposed technical preload bound: one already-selected next local image, at most
one pending decode, scoped to current session/exercise generation. No whole-corpus
preload, extra random selection, external image URL, change to the 75-photo ledger
or duplication of images. Decode rejection must not block Next or replace the
current cue; normal image loading remains fallback. Drop references on session
exit, mode change or new generation; late decode completion cannot update a new
exercise. This is a proposed reversible performance limit, not a storage quota.

### Precise ownership additions for parent approval

- P5 owns `src/features/verbs/PictureDictionaryCard.tsx`,
  `src/features/verbs/picture-preload.ts`, its scoped CSS, existing Pictures
  composition/session changes and `tests/p5-dictionary*.test.ts`. P5 also owns new
  `src/content/dictionary/**` and `content/dictionary/**` only after source approval;
  these are additive, separate from the existing curriculum and photo ledger.
- Integrator owns `src/contracts/dictionary.ts`, root route/navigation changes in
  `src/app/App.tsx` and any Progress/Reference registration, plus changes to content
  exports/build scripts if needed. Home-only navigation does not grant an extra
  account/progress permission. P3/P5 request root links rather than editing App.
- P4 retains root session/exit ownership; P5 requests a presentation hold through
  the existing runtime interface. P5 does not edit `LessonSession.tsx`,
  `session-runtime.ts` or `VoiceStatus.tsx`. P4 does not edit verb feature files.
- Shared current tests remain integrator-owned unless individually reassigned.
  New task-prefixed tests belong to their producer. Server wiring, dependency
  manifests, migration registry and shared barrels remain with the sole integrator.

Parent may freeze identity/envelope/idempotency/ownership and the new Pictures
presentation/preload seams independently of Q10-Q13 policy. Exact database engine,
Better Auth version compatibility and response discriminants still need technical
acceptance; no unreviewed library API or deployment feasibility is claimed.

Additional eventual validation: completion opens exactly one card; Next advances
once despite double click; no old timer skips it; no-call and called sessions retain
identity; navigation links occur only on home; source text/provenance integrity;
missing content never becomes fabricated wording; one preload/decode limit;
failed/late decode, rapid Next and mode exit preserve current cue. Use fixture
source text only until a reliable source and its reuse conditions are accepted.

## Integration-owned partial implementation freeze (2026-10-18)

The parent accepted the partial technical freeze and handed this ADR continuation
and shared code to the sole integration writer. This section supersedes draft
technical details above where they conflict. It does not answer Q10-Q13 or select
dictionary content. The dedicated branch starts at PR12 `a369792` on accepted
P0 `c0b4e47`; no producer feature modules are implemented here.

### Frozen structural interfaces and transaction semantics

Shared files are `src/contracts/accounts.ts`, `progress.ts`, `session.ts`,
`feedback.ts`, `dictionary.ts` and the existing barrel. Existing ExerciseIdentity
and AttemptRef remain authoritative. Capabilities contain server-supplied grants
without a default role mapping; ordinary user DTOs have no role-write operation.
Feedback evidence remains deliberately undefined pending Q13. No metrics, time
thresholds, password/session duration, retry schedule or retention defaults exist.

Progress events have schemaVersion 1, eventId, existing AttemptRef, a source enum
and fixed `client-reported` trust. Only `attempt-result` (accepted/incorrect/
uncertain) and `attempt-invalidated` are currently frozen. They are processed
outcomes, not processing notifications, keystrokes or authoritative oral verdicts.
Written sentence comparison must not be translated into an oral gate by P5/P2.
No raw feedback string, answer, transcript, provider payload or aggregate appears
in the envelope. The pure parser rejects unknown keys and non-string enum values.
Transport byte limits and authenticated object authorization remain P2 duties.

`src/foundation/progress-batch.ts` is the pure transaction specification and
fixture, NOT an in-memory replacement for the future database. A batch contains
1-100 events. It is atomic: invalid schema/ownership scope, conflicting replay
or stale attempt rejects the entire batch, returns the unchanged journal and
**no acknowledgments**. P2 must enforce actor/session/instance ownership and
open-session status within its actual database transaction before committing.
The helper's supplied session scope is not authentication.

Identical event-ID replay returns a duplicate receipt with its original
`committedRevision`; a changed payload under that ID conflicts. Results expose a
separate `current.journalRevision`; it must not be confused with the receipt's
commit revision or the session's lifecycle revision. One new event per increasing
attempt revision per exercise/generation/obligation is permitted; invalidation
and the next processed result use distinct revisions. Different obligations may
arrive independently/out of order. No older event overwrites newer state. Within
one transaction, repeated identical event IDs are acknowledged at the same commit
revision without an additional write. These rules do not define mistake counts.

### Ordered exit seam, not a second session lifecycle

`src/foundation/exit-coordinator.ts` is root-owned pure coordination. P4 supplies
requestExit, freezeWrites and releasePreparation; root supplies navigation and
an isCurrent token tied to the mounted session. The sequence is:

1. Await P4's policy/UI decision. Cancel dispatches nothing and preserves the call.
2. Freeze new practice writes; flush the complete final queue. ProgressSink.flush
   resolves only after every queued event has a committed/duplicate receipt and
   returns the final journal fence; rejected events must reject flush.
3. Read the current canonical lifecycle revision, then submit confirmClose with
   one operation ID, that revision and the final progress fence. P2 atomically
   checks open state, expected lifecycle revision and exact journal fence before
   close/job insertion; a concurrent event invalidates that fence with conflict.
4. Navigate only after the matching closed response and a fresh current-session
   check. Duplicate clicks share one in-flight operation and first destination.

Preparation failure releases the write freeze and does not dispatch close.
An ambiguous close response failure retains the exact request/key/freeze for an
explicit retry: no second confirmation, different body or automated provider retry
is synthesized. P4 must surface/reconcile this state according to Q12; no final UI
retry policy is selected by the helper. A superseded session cannot navigate.
P2's idempotency receipt survives lost replies; duplicate close must not insert
another feedback job. Session revision, journal revision and receipt revision are
three distinct concepts. Auth session ID remains distinct from exercise session ID.

Actual hash/browser-back interception remains integrator-owned App/routes work,
not implemented here. Hashchange cannot be canceled; P4's exit decision must be
obtained while retaining the active feature, with history restoration and focus
handled at wiring time. Unload/refresh/expiry still require Q12.

### Bounded decode and Pictures seam

`src/foundation/picture-decode.ts` is the shared injected scheduler. P5 owns
`src/features/verbs/picture-preload.ts`, which will adapt it to Image.decode and
its already-selected deck entry. At most one decode is running and one latest
queued descriptor is retained. New generations replace queued work and invalidate
old completion tokens; they do not cancel an existing decode promise. Queued work
starts only when the running promise settles. Rejection is swallowed as optional
preload failure; Next and normal image loading do not await it. Disposal drops
queued work and suppresses late callbacks. Only existing local verb JPEG paths
are accepted; no corpus preload or extra random draw occurs.

P5's completed Pictures card/explicit Next must replace that mode's automatic
startNext callback at the accepted completion boundary, not race a late UI hold
against it. Other modes are unchanged. Dictionary fields carry source metadata;
missing content is unavailable, never invented. Real corpus/source licensing is
still pending. Home-only Progress/Reference registration remains root-owned;
P5/P3 supply feature UI without acquiring root navigation ownership.

### Ownership handoff

Integrator owns all shared contracts/barrels, `src/foundation/**`,
`tests/foundation.test.ts`, App/routes/main/global CSS, manifests/lockfile,
server entrypoint/router, migration registry and this technical ADR amendment.
P1 is idle and no longer edits this continuation concurrently. P2 consumes the
transaction specification and owns auth/accounts/data modules and migration
bodies. P3 owns account/admin/professor UI. P4 owns LessonSession/session-runtime/
VoiceStatus and exit UI. P5 owns verb/sentence/progress UI, dictionary source
modules after approval, and the image adapter. P6 owns feedback service, using
P2's fenced claim/complete/fail repository. Existing tests/voice modules require
explicit reassignment; task-prefixed new tests belong to each producer.

The returned immutable implementation commit is the producer interface base,
subject to parent sequencing. No producer is launched here. No live provisioning,
network/credential configuration, paid inference or deployment occurs.

### Dependency choice and compatibility evidence

The integrator selects PostgreSQL as the one P2 implementation dialect and pins
`better-auth` 1.7.10, `pg` 8.23.1 and development types `@types/pg` 8.23.1.
This keeps the proposed app-owned password/database-session architecture and
avoids a framework migration or extra ORM. It is a routine technical choice,
not permission to provision a database, configure secrets or choose account policy.
P2 must provide isolated database tests; no production PostgreSQL version or
hosting configuration is selected here.

Reviewed official [installation](https://better-auth.com/docs/installation) and
[PostgreSQL integration](https://better-auth.com/docs/adapters/postgresql) docs
and npm package metadata on October 18. The documented integration accepts a pg
Pool. Better Auth's declared pg ^8 and React/ReactDOM ^18/^19 peers match these
pins and existing React 19.3.0. pg requires Node >=16; resolved Kysely 0.29.7
requires >=22, compatible with the app's declared >=22.12.0. Clean npm ci and
strict application build pass on Node 24.19.0. Better Auth core, Node handler and
pg ESM exports were imported successfully without constructing auth/pools or
opening connections. This proves package-resolution/import compatibility, not
schema, login or session correctness; those belong to P2. No auth CLI or migration
was executed. Browser production bundle remains byte-identical to P0.
