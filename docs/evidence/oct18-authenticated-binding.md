# October 18 authenticated application binding

This checkpoint follows PR18 review pin `3b54330cc70e7ab50967408ef1b91796970a9354`.
Main remains `c0b4e470aef77050792122a42f67e6633653a5c6`. The integrator has not
merged this candidate. P7 must review the new exact head before final integration.

## Composition

Normal merges retain P2 `cc7e6c12c904d06d23cadc3d100945b479df4d7a`,
P4 `dc6ce8849b4c53e65a21147c6e34d920839b36cc`, and
P5 `96b6fe629a2b3efa4cd35e0516fd9e797486fa35`. P3 and P6 remain at the
previous checkpoint's accepted pins. No producer history was rewritten.

The production entry now discovers the server account configuration, loads the
canonical authenticated account, and selects the actual administrator, professor,
or student view. Authentication failures do not fall back to anonymous practice.
A student lesson creates one canonical session before mounting the exercise,
including under React StrictMode. An explicit retry reuses its operation ID.

The root binds P5 IndexedDB progress and written-usage queues to authenticated
HTTP. Captured practice events are stored before transmission, preserve their
original event/attempt IDs, and map local exercise identities through an
idempotent server-issued identity. Recreating the sender after reload derives the
same issuance key; no arbitrary browser identity is registered. Issuance validates
ownership and serializes against close. Server-observed written activity uses P2
streams and sequence receipts, never client timestamps or browser duration totals.
Visible written panels emit visibility and trusted input/tap observations. Exit
freezes producers and waits for both queues before submitting the exact progress
fence. No-call exit has no tutor confirmation. Pending/error UI exposes manual
retry. Account changes deactivate transport while retaining account-scoped rows.

The real server factory composes Better Auth, account permissions, admin
management, daily reads, learning, usage, recovery, and issuance. The migration
registry includes all six producer migrations. `npm run db:migrate` is an explicit
operator action; starting the broker does not migrate a database automatically.

## Configuration boundary

`LEARNING_APPLICATION_CONFIG` optionally names a server-local JSON file with
`origin`, the exact P2 `login` policy, `requestLimit: {windowMs, maximum}`, and
optional `grouping: {timeZone, eventAttribution: "server-received"}`. The server
also requires `LEARNING_DATABASE_URL` and `LEARNING_AUTH_SECRET`. The origin must
already appear in the broker's allowed frontend origins. No values, accounts,
credentials, public endpoint, deployment or live database were provisioned.
Without configuration the production entry reports that the account service is
unavailable and cannot open an anonymous lesson. Explicit configuration activates the composed account path; it is no longer an
unconditionally null service scaffold. The unset timezone remains unset.

## Validation and retained failures

The standard Node run passes 336 tests with 11 opt-in browser skips against
isolated PostgreSQL 17 and the actual integrated P6 coordinator. All 26 Python
content tests pass. Strict TypeScript and production build pass; JS remains
582.74 kB, with the retained 500 kB bundle warning. A late browser-test callback
needed an explicit structural TypeScript annotation; the preceding build failure
is retained separately from its successful correction.

Eleven browser tests pass with actual Chromium and mocked HTTP/provider data:
UX, sentence, verbs, P3, P4, recovery, P5 completion, IndexedDB reload/isolation,
root navigation, canonical persisted exit, and the production account entry.
The last two verify single StrictMode creation, incremental submission,
server-issued identities, visible/hidden usage, exact close fencing, and no
provider calls. Existing app, practice, eight-tense and written-sentence smoke
scripts also pass on their documented dev/preview targets.

Earlier new browser-fixture failures are preserved: a shared port was released
asynchronously, a completion assertion assumed a fixed randomly chosen verb,
and two P4 tests were run before their required dev server started. The fixture
now waits for server termination, uses distinct ports, and observes the actual
progress HTTP acknowledgment rather than assuming a correct answer. P4 passes
with its documented server prerequisite. Prior release/tooltip/bundle evidence
in the earlier checkpoint is not erased. Logs are retained in the executor at
`/workspace/integration-oct18-bound/`; no hosted-CI or live audio claim is made.

## Remaining integration work

This is a reviewable implementation delta, not whole-batch acceptance. Recovery
controllers/adapters and server APIs exist, but root discovery/resume/finalize UI
still needs composition, including authoritative historical-call classification
and restoration of exercise drafts. The queue does not claim to restore drafts.
Separate written sentence translation/tense result emission remains outstanding.
The professor array adapter retrieves every bounded session page and rejects
cycles/oversize histories; progressive session pagination and the daily display
still need integration. Daily timezone and metric formula decisions remain open.

Account-enabled provider routes fail closed until canonical authenticated
transport and trusted connected/disconnected observation are integrated. SDP
acceptance and a browser `ready` flag are not proof of genuine connection. Called
close eligibility/feedback coordinator wiring and production Phoenix text
instrumentation remain incomplete; synthetic tracing tests are not live export.
Admin initial credential handoff/recovery, logout behavior, retention and
source-reviewed dictionary expansion remain unresolved. No deletion grant is
inferred. Real voice, physical-device and Phoenix acceptance remain deferred.

Requested model/effort: gpt-6-astra/medium. The actual runtime model/effort routing
is not exposed for independent verification. No additional agents or tasks were
launched; no paid calls, Mac work, credential/network changes or deployment ran.


## P7 changes-requested follow-up

P7 reported four reproduced blockers on `3b54330`. This candidate is offered for
independent re-review, not declared accepted by its own integrator.

| Finding | Integrated correction and evidence |
| --- | --- |
| Shipped root bypassed confirmation/flush/close | `LearningApplication` now requires the real account binding; no missing-config fallback can mount unbound practice. `PersistedLesson` mounts P4 with canonical commands and P5 durable queues. The production-entry browser regression opens `/`, connects simulated WebRTC, cancels once, then holds progress and close HTTP responses independently and proves navigation waits. It does not inject a coordinator or lifecycle. |
| Pictures required oral completion | P5 `b9b651e457ece1f67696b15714aec3e5a486ca47` gates reveal/Next on three accepted written forms; edits revoke eligibility. Oral completion remains independent. Producer unit and actual Chromium written-only tests pass. |
| Stop during preparation latched an error | P4 `d00f7ebbf979ca44912ac5c6bb57df5c562f83bc` reconciles the returned segment after cancellation. Its failure regression still blocks an unacknowledged stop. Root also permits explicit retry after a failed media start whose segment stop was acknowledged. |
| Disconnected segment blocked Start | The same P4 correction ends the old segment before an explicitly requested replacement call. Tests cover offline/error and Stop racing reconciliation. It does not turn a browser transport event into trusted duration evidence. |

Actual authenticated-root smoke coverage exposed two further integration faults:
transient queue status above the lesson moved controls between pointerdown and
click, and a pending browser permission prompt could hold the exit wait even
after cancellation. Status now renders below the lesson, and runtime cancellation
releases the lifecycle wait while the voice adapter retains late-track cleanup.
The root regression covers a permission promise that ignores AbortSignal. The
existing smoke script's connected exits now explicitly click Leave session;
no-call and not-yet-connected exits remain confirmation-free. `LIFECYCLE_ONLY=1`
selects its resource/cancellation cases without repeating viewport checks.

The shared browser helper now mocks authenticated account/session/usage/progress
HTTP, while using the actual production entry, IndexedDB queues and lifecycle.
It no longer bypasses these through an anonymous config response. A separate test
proves an unconfigured account service cannot open practice. Historical test-only
feature fixtures still exercise producer modules directly and are labeled as such.

Failures from these new production-root runs remain recorded separately: a P3
account shell ancestor changed student layout, stale lifecycle errors blocked
written-only exit, status reflow swallowed tense/Next clicks, and permission waits
blocked cancellation. The student layout is outside the P3 form shell, preserving
its own styles. Successful reruns and exact final pin are supplied in PR18.

Remaining whole-batch integration and policy gaps in the prior section are still
open. No main merge, production configuration, paid/provider call, real device or
live Phoenix acceptance is included in this correction receipt.
