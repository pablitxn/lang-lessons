# P1 draft: accounts, progress and optional tutor sessions

Status: inspection and architecture proposal ONLY; NOT frozen or implemented.
Date: 2026-10-18. Owner: delegated P1 / EN-WP-01.
Coordinator: `01a118ed-6bf7-7481-93e6-336de48270f7`.
Sole P0/integration writer: `01a14e4c-74cd-7047-9c85-194a390d3001`.
Accepted P0 base: pending parent receipt. No producer dispatch authorized here.

## Authority and evidence

[Atlas approved dispatch](https://github.com/pablitxn/sysadmin-workspace/blob/a9ad0a0385714c9739a4ff60fef9525da2e0e633/atlas/wiki/english-learning-backlog.md#detailed-dispatch-plan-2026-10-18)
and [EN-D16-D23 / EN-Q10-Q13](https://github.com/pablitxn/sysadmin-workspace/blob/a9ad0a0385714c9739a4ff60fef9525da2e0e633/atlas/entries/2026-10-17-english-learning-past-tenses.md)
govern this proposal. Existing architecture documents remain historical actual
implementation evidence where they describe automatic voice or memory-only data.
Only this new app-owned document is edited. Atlas/Notion intake stays with parent.

Fetched application main: `9dd7f28d823751d7e56d81756d15ff3660bf1d19`.
Fetched PR11: `8a567553731ced5e7cde3f34a00e6ecd7481bb40`.
No edits to that candidate. Draft branch starts from the observed main, not an
assumed accepted PR11 base. Parent must reconcile this draft against accepted P0.
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
Remaining gates: accepted P0 SHA, coordinator ADR/interface review, answers only
for dependent policy slices, explicit shared ownership handoff, then parent dispatch.
