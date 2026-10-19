# P5 progress and Pictures handoff

Producer base: `8316baa745acf0280181cf72ef6fa400561dcd05` (PR12).
Accepted application base: `c0b4e470aef77050792122a42f67e6633653a5c6`.
Branch: `codex/p5-progress-pictures`. Sole integrator:
`01a14e4c-74cd-7047-9c85-194a390d3001`.

## Implemented behavior

Both feature sessions observe reduced controller evidence and submit only the
frozen processed-result/invalidation envelopes to an optional injected
`ProgressSink`. Results carry the actual controller AttemptRef, claimed source
and fixed client-reported trust. No answer, transcript, provider feedback,
keystroke stream, aggregate, grade or usage timer is sent. Duplicate view updates
emit nothing. Editing processed spelling invalidates once before a later result;
revising oral translation invalidates its dependent explanation with real
controller-allocated refs before the reset removes it. Stale provider results
remain rejected by the controller. Offline spelling uses the existing local
adapter assessment and preserves independent oral obligations.

Both lesson components accept `progressSink`, `onProgressError` and `canWrite`.
Provide a stable sink for the mounted session. The root-owned sink must enqueue
synchronously at submit, own serialization/replay/receipts, and reject flush if
any queued event is rejected. Feature errors display a save-failure status and
invoke onProgressError; no automatic retry, persistent queue or invented close
policy is added. Root must retain the failed queue/error for its exit coordinator.
The optional canWrite callback blocks controller-based draft submission,
navigation, and assessment/transcript consumption during root preparation without
remounting. Local sentence comparison is intentionally separate from this sink.

Pictures removes automatic startNext at the accepted completion callback. The
card is revealed after all three current written forms are accepted and stays until
explicit Next. Oral gates and their completion callback remain independent. Next checks the completed exercise
identity, so a second callback for the old card cannot skip another exercise.
Oral-completed fields cannot mutate the displayed drafts behind the frozen ledger.
History retains typed work and does not restore old oral evidence. Visible-word
mode retains its existing automatic advancement.

The card renders field-level dictionary provenance when supplied, but production
passes null until source/content approval. Missing content is visibly unavailable;
no dictionary definitions, examples, phonetics or corpus were authored/imported.
The preload adapter uses the frozen scheduler with one running decode and one
latest queued descriptor. It peeks only the existing deck, never draws randomness,
never changes the displayed cue, and never delays Next. The last entry has no
preload until the next round is normally selected. Disposal and generation changes
suppress stale callbacks; decode failure falls back to ordinary image loading.

## Requests to P4 and the integration writer

1. Pass the mounted session's stable ProgressSink and canWrite gate through
   LessonSession to both feature components. Connect onProgressError to the
   coordinator's failure state; preserve the complete queue until flush receipts.
   Use root exit coordination for flush/fence/close; this branch edits no root files.
2. The frozen AttemptRef obligation union has only oral sentence translation and
   tense identifiers. Add a distinct written comparison/tense event identity before
   persisting local sentence feedback. A reference mismatch is not a semantic
   incorrect verdict. This branch never maps written success to an oral gate.
3. Update the two integration-owned assertions in tests/verbs.test.ts named
   "completed history retains typed work ..." and "both verb modes require every
   oral gate ... then advance once after quiet". In Pictures, explicitly call
   nextPicture(completedExerciseId) before asserting generation 2 or visiting back.
   Preserve the visible-word auto-advance assertion. Existing verb browser tests
   also contain the historical auto-advance expectation and need owner updates.
4. Home-only Progress/Reference navigation remains root-owned. No progress totals
   screen can be populated before Q11 metric definitions/read DTOs are frozen.
5. Approve dictionary source/revision, field content and reuse/attribution handling
   before injecting DictionaryEntry or adding a content corpus. Q10-Q13 remain
   unselected; this implementation defines no policy defaults.

## Evidence and limits

- `npm ci --cache /tmp/p5-npm-cache`: passed (79 packages). Initial default-cache
  attempt failed on the inaccessible home cache; no manifest/lock change.
- `P5_BROWSER=1 node --import tsx --test tests/p5-*.test.ts`: eight passes, including
  actual Chromium rendering at 320x640 with injected oral verdicts, zero external
  requests and no page errors. Cases cover completion/Next, no early reveal,
  decoding bounds/staleness/failure/disposal, offline progress, invalidations,
  duplicate observations, sink failures, write freeze and stale oral results.
- One uncontrolled-wall-clock browser run timed out waiting for completion after
  earlier passes. The final fixture installs and pauses the browser clock before
  navigation, then advances through the quiet interval; final run passes. This is
  mocked timing evidence, not real human timing acceptance.
- `SENTENCES_BROWSER=1 node --import tsx --test tests/sentences-browser.test.ts`:
  passes at 320x640, 390x844, 844x390 and 1024x768, simulated transport/verdicts.
- `npm run check`: remains non-green on the two owned-by-integrator historical
  Pictures auto-advance assertions above. No test was weakened or edited outside
  P5 ownership. An initial concurrent server release fixture failed (403 vs 200);
  its 16-test isolated suite and subsequent full run pass. Keep this transient
  failure distinct from the two deliberate expectation changes.
- `npm run test:content`: passes, including 26 Python tests. Strict TypeScript and
  production build pass separately because npm check stops at test failure.
  Existing bundle-size warning remains (approximately 535 kB JavaScript).
- No shared contracts/helpers, root routing/runtime/styles, dependencies, migration
  registry, server router, curriculum, eight tenses, exact25 list or photo ledger
  changed. No paid provider, live accounts, deployment, Mac or network configuration
  changes. Hosted CI, real voice/device and linguistic/source-license acceptance
  are not claimed. Requested Astra/medium routing is not independently exposed by
  this executor; no model-switch receipt is claimed. No agents were launched.

## Atlas intake for the parent

Read Atlas navigation and maintenance instructions for boundaries only; no Atlas
or Notion writes. This handoff is the producer intake for the parent to reconcile
against [merged plan and decisions](https://github.com/pablitxn/sysadmin-workspace/tree/b24bad2ed6fa3360bdd3a877af755870df11b866/atlas),
EN-D16-D26 and open Q10-Q14. Application contracts and the final partial freeze in
`docs/adr/p1-accounts-progress-sessions-2026-10-18.md` govern this implementation.
No merge or deployment is performed by this producer.

## Approved Q11 time continuation and recovery mandate

The parent's subsequent October 18 messages explicitly approve separate written
active time and genuinely connected tutor time, a two-minute written idle limit,
no hidden-exercise time, and daily totals computed as the union of overlapping
intervals. They also authorize an IndexedDB pending progress queue and durable
server history with idempotent recovery. These instructions supersede the earlier
no-timer/unselected-time statements above. Other Q11 exercise/mistake/performance
semantics, timezone selection and retention duration remain open.

### Implemented within P5 ownership

- `written-activity.ts` tracks visible, interacted-with exercises using monotonic,
  epoch-aligned time. First input/tap starts a range; subsequent interaction renews
  its idle deadline. Hidden/unmounted exercise, explicit preparation and idle expiry
  end it. Restoring visibility alone does not start another range. Late timers cap
  at the actual deadline, not callback delivery time. Each range has session ID,
  window ID, interval ID and sequence. No input content is retained.
- `use-written-activity.ts` binds trusted input/tap events, document visibility,
  viewport intersection and page lifecycle. Both feature components accept optional
  `writtenActivity`; without injection no tracker starts. It registers a `finish`
  preparation callback and uses the root write gate. Root must call finish before
  its interval flush. This feature-local type is a proposal to the integrator,
  not an unauthorized edit of shared contracts.
- `activity-intervals.ts` provides replay/conflict handling for immutable written
  observations and interval-union calculations with caller-supplied day boundaries.
  Separate written/tutor totals and per-call connected totals are retained; gaps
  between connections contribute nothing. Duplicate/overlapping intervals do not
  inflate totals. It never consumes arbitrary client totals, chooses a timezone,
  equates connected tutor time with UI interaction, or measures tutor connectivity.
- `pending-progress-store.ts` implements IndexedDB atomic enqueue/acknowledgment,
  ordered pending reads, and current-user pending-session discovery. Records are
  partitioned by user/session/event ID; an identical replay is a no-op, a changed
  payload under the same ID aborts the whole transaction. Deletion checks the exact
  acknowledged payload. Only frozen PracticeEvents pass the exact-key parser; no
  raw audio, answer, transcript or credential enters this queue.
- `queued-progress-sink.ts` implements the frozen ProgressSink with an injected
  authenticated transport and canonical fence reader. It stores before sending,
  retains pending rows after transport/rejection/receipt failure, and deletes only
  after complete valid acknowledgments. An ambiguous response replays the same IDs;
  the server's duplicate receipts prevent another write. Failed local writes remain
  in memory as explicitly unsaved work for retry; they cannot be promised to survive
  closing the tab. Concurrent submissions and flush serialize. Logout/account
  changes fence transport and acknowledgment, while old-user rows remain intact.
  A new sink restores persisted rows without an automatic request during hydration.
- `ProgressSyncStatus.tsx` exposes loading, pending, unsaved, failed and inactive
  states, plus explicit retry. It does not claim local pending work is server-saved.
  No queue expiry, purge-on-logout or retention duration is selected.

### Required coordinated integration

1. **Integrator/shared interval contract:** review the feature-local
   `WrittenActivityInterval` fields and freeze a shared interval sink/receipt and
   server validation contract. Do not put time observations into PracticeEvent's
   oral/written obligation namespace. Current interval observations/journal are
   memory-only until this contract is accepted; the new IndexedDB store persists
   frozen practice events only. Never label client intervals server-verified.
2. **P4:** own actual connected/disconnected/reconnected tutor intervals using
   session/call/connection identities, including listening without UI events and
   excluding gaps. Feed validated ranges to union accounting. Own resume/finalize
   UI and session authority; this branch does not reopen closed sessions.
3. **Root:** construct one queue for the authenticated user and exercise session,
   pass it as ProgressSink, render ProgressSyncStatus, wire the write gate, and
   deactivate the old queue on actor change. Use pendingSessions(currentUserId)
   to discover local recovery candidates. A local user partition is not server
   authorization. Call all interval finish callbacks before flushing their eventual
   sink. No-call exit uses the existing ordered flush/fence/close path without a
   tutor popup; any flush failure retains the exercise and pending data. No root
   navigation, popup or automatic account recovery is implemented by P5.
4. **P2:** supply authenticated send/readFence operations and durable per-event
   receipts/history. Validate current actor, session ownership/open state and
   immutable replay in the server transaction. Reject invalid/untrusted time
   assertions; compute daily unions from accepted intervals, never client totals.
   Persisted local rows for a closed/stale session remain an explicit recovery
   error until the owner resolves it, not a reason for the client to discard them.
5. **Timezone/retention:** supply approved day boundaries to the projection helper;
   no student-configured timezone or retention policy is selected here. No actual
   accounts or existing user data were accessed, purged or migrated.

### Continuation evidence

New deterministic tests cover 120-second idle expiry, renewed deadlines, late/stale
timers, hidden exercises, resumption, reconnect gaps, overlap/duplicate union,
explicit non-24-hour day windows, immutable interval replay, lost server replies,
local write failures, user/session isolation, auth changes during an in-flight
request, malformed acknowledgments and final no-call flush. Browser tests use real
Chromium IndexedDB across reloads, verify unique replay and atomic rollback, and
exercise the actual written-activity hook with trusted input and a controlled clock.
The initial hook browser test exposed an unbound crypto.randomUUID call that threw
Illegal invocation; it was fixed to retain its browser receiver. These are local
storage/rendering and injected transport/server-journal fixtures, not live P2
persistence, tutor connectivity or production recovery evidence.

Final continuation checks: npm ci passes; all 23 P5 tests pass with P5_BROWSER=1,
including two actual Chromium cases. npm run check reports 245 tests: 238 pass,
five optional browser skips and the same two integration-owned historical Pictures
assertion failures. Content/26 Python tests and strict production build pass
separately. Bundle warning remains (approximately 537 kB). Shared contracts, root,
server, dependency files and content/photo ledgers remain untouched.

## P2 consumer alignment at cc7e6c12c904d06d23cadc3d100945b479df4d7a

Read P2's `server/accounts/POLICY-HANDOFF.md`,
`server/data/USAGE-RECOVERY-HANDOFF.md`, `usage.ts`, `recovery.ts` and the learning
repository at that exact published PR17 head. Their newer usage amendment
supersedes the older time-pending statements in POLICY-HANDOFF. No P2 files or
shared contracts were imported into this branch or edited.

The earlier local interval proposal is superseded for server transport:
`useWrittenActivity` now emits only ordered `visible`, `hidden`, `input` and `tap`
kinds. It sends no client timestamps, durations or totals. The pure local clock
and union helpers remain deterministic fixtures/utilities, not the production
source of daily totals. Server P2 owns the approved 120-second interval endpoints
and cross-source/cross-tab union. P4 owns genuine verified tutor transitions;
there is deliberately no browser-connected assertion endpoint/adapter here.

- `p2-adapter.ts` maps the frozen ProgressSink to P2's
  `learning.submit(sessionId, events)` and `recovery.read(sessionId).progress`.
  It checks returned session identity and never substitutes lifecycle revision
  for journal revision. Root provides authenticated HTTP ports; no URL is guessed.
- `createP2WrittenUsageQueue` explicitly calls `openWrittenStream(sessionId)` and
  verifies the user is still current before consuming its server-issued ID. It
  does not fabricate stream IDs, retry ambiguous stream creation, or auto-start
  a call. Root invokes it only for the current mounted exercise session.
- `written-usage-store.ts` persists exact P2 observation bodies in a separate
  IndexedDB database, partitioned by user/session/stream. Sequence allocation and
  enqueue are one transaction. Sequence survives acknowledgment and reload;
  pending event IDs/bodies survive transport loss. Only acknowledged bodies are
  removed. Stream sequence metadata remains until a retention policy is approved.
- `written-usage-queue.ts` serializes persistence and P2 `written` calls, validates
  event/sequence/receipt identities, retains failed observations, and replays
  duplicates without allocating a new sequence. It exposes the same pending/error
  view interface as the practice queue and can use ProgressSyncStatus. Root binds
  `writtenActivity.onObservation` to `usageQueue.record`, the common write gate,
  and the preparation registry. Explicit exit emits hidden, flushes BOTH queues,
  then reads the canonical lifecycle revision and closes with the progress fence.
- Written observations are necessarily client-reported interactions. P2's receipt
  clock governs recorded usage. Replaying late/offline input cannot reconstruct
  past wall-clock activity; this adapter never backdates intervals or claims that
  offline duration was recovered. Missing abrupt-exit signals remain capped or
  reconciled under P2/P4 behavior, not a guessed heartbeat timeout.

Remaining integration requests: promote/approve P2's producer-local observation
and receipt seams; mount authenticated routes; wire both queues and status UI;
register server-issued exercise instances before progress submission. Current
feature AttemptRefs use their existing local namespaces, while P2 explicitly
rejects unregistered instances and documents registerInstance as an internal
server seam. Do not expose unrestricted browser instance registration to make
those requests pass. Root/integrator must resolve the instance-issuance seam.
Recovery UI, listOpen/resume/finalize and manual feedback retry remain P4-owned.
Timezone, retention, credential delivery and grounded feedback policy stay open.

Additional consumer tests verify correct recovery-fence selection, exact P2 wire
keys, ordered lost-reply/duplicate replay, account switching during stream creation,
and real IndexedDB usage-sequence recovery/acknowledgment across reload. Server
behavior is represented by injected ports here; P2's isolated PostgreSQL evidence
belongs to PR17, not to this producer's browser tests.

P2-aligned final validation: 26 P5 tests pass with P5_BROWSER=1. The final usage
pending-session discovery addition also passes the four adapter/real-IndexedDB
checks separately. Both IndexedDB stores expose current-user pendingSessions;
root should union these IDs with P4's canonical recovery candidates rather than
hide usage-only pending work. Full npm run check: 248 tests, 241 pass, five optional
browser skips, and the same two historical Pictures auto-advance assertions.
Content/26 Python tests and strict build pass separately; bundle warning remains
approximately 536 kB. No P2 database/runtime or production HTTP calls were made.


## P7 written-only Pictures correction

The parent relayed P7's reproduction at integrated review `3b54330`: three accepted
offline spelling records did not reveal the card because P5 incorrectly depended
on controller.completed (the combined oral/written completion state). EN-D24
requires only the written forms for this presentation. This correction supersedes
all earlier handoff wording that implied oral/quiet completion was required.

Both pictureComplete and nextPicture now share a feature-owned predicate requiring
accepted base/past/participle records for the current exercise/generation with valid
typed evidence (explicit mock evidence only in mock fixtures). The controller's
oral ledger, completion callback and visible-word behavior are unchanged. The card
heading presents the dictionary lemma. Editing invalidates/hides the card immediately;
rechecking restores it. History can restore the written card without restoring oral
evidence. Next retains its exercise-identity guard against a stale/double callback.

New regression uses the real adapter's offline local spelling path with no connect,
no audio and no oral verdicts. It covers incomplete/incorrect forms, acceptance,
edit invalidation, correction, explicit Next, stale Next and history restore, while
asserting zero completion callbacks and no oral evidence. The browser case now
supplies written forms only and asserts the oral completion counter remains zero.
All 27 P5 tests pass including Chromium. Full check remains 242 passes / 249 total,
five optional skips, and the same two integration-owned historical Pictures
assertions. Content/26 Python tests and strict build pass. No shared/root files
were edited; integrator can apply this additive fix after the reviewed P5 work.

## P7 F5: local durability independent of remote delivery

Reviewed P7's reproduction at `b35b7b542ba3e1fa191f8cde1fc905d4119df191`,
`tests/integration/p7-durability-browser.test.ts` (review of integrated cfce584).
The previous queues put persistence inside the network serialization chain. A held
first request therefore left later results/usage observations only in memory.

Both queue implementations now have separate local-transaction and remote-delivery
chains. submit/record immediately schedule ordered durable append independently of
an unresolved request or fence read. Remote sends still serialize and wait for
local persistence; successful local storage is never returned as a server receipt.
A local enqueue revision detects newly persisted work even when its staging buffer
is already empty, preventing an earlier drain/fence read from prematurely declaring
idle. Flush starts/waits for local appends and then requires remote acknowledgments.
Existing replay identities, user/session partitions, write-failure retention and
receipt validation remain unchanged. No IndexedDB schema or shared interface change.

The new owned `tests/p5-durability-browser.test.ts` adapts P7's reproduction into a
positive regression: with both first requests unresolved, IndexedDB contains e1/e2
and visible/input with sequences 1/2, while submit/record remain unacknowledged.
After a real Chromium reload, replay uses the original IDs/sequences, accepts
injected duplicate/recorded receipts, and removes only acknowledged pending rows.
Additional unit races hold a canonical fence and a usage response while a later
append completes, checking the earlier drain includes that later durable work.

Validation: all 30 P5 cases pass with P5_BROWSER=1. Full npm run check reports
252 cases: 244 pass, six optional browser skips, and the same two integration-owned
historical Pictures assertions. Content/26 Python tests and strict production build
pass separately; the existing approximately 536 kB bundle warning remains.
Real IndexedDB/browser evidence uses injected server transport, not paid/live
providers or actual accounts. The fix is additive on P5 b9b651e; root/shared/P2/P4
and P7's own reproduction file remain untouched for integrator application.
