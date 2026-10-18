# P4 optional tutor lifecycle receipt

Implementation base: `8316baa745acf0280181cf72ef6fa400561dcd05` (PR12 interface
freeze), accepted application base `c0b4e470aef77050792122a42f67e6633653a5c6`.
Branch: `codex/p4-session-lifecycle`. The published PR records the immutable head.
Sole integration writer: task `01a14e4c-74cd-7047-9c85-194a390d3001`.
Requested model: Astra/medium; this running environment does not provide a routing
receipt, so this document does not certify a model switch. No agents launched.

## Implemented

- Exercise entry no longer starts audio, readiness requests or provider transport.
  Explicit Start tutor / Stop tutor controls render in the existing header portal
  beside Preferences. Muting remains in call details. No root/global-style edits.
- Runtime keeps one exercise session/context across call segments. Stop invalidates
  pending startup, adapter subscriptions and conversation error callbacks. It does
  not create feedback or replace feature state. Existing assessment tests preserve
  accepted evidence; browser testing preserves the typed draft across restart.
- `createSessionLifecycle` consumes injected SessionCommands, ProgressSink and root
  navigation ports. It opens a segment before transport, ends it on explicit stop,
  and reads fresh lifecycle revisions for writes. No persistence implementation.
- An observed connected call requires a native confirmation dialog. Cancel keeps
  the call, context and writes. Confirm uses the frozen exit coordinator: freeze,
  stop media/end segment, flush final progress, read revision, confirmClose, then
  navigate only for a matching response and current mounted session. No-call exit
  skips the dialog and creates no call or direct feedback request.
- Rejected progress releases the write freeze and leaves the session open. An
  ambiguous/mismatched close stays frozen with an error; no automatic retry,
  invented recovery action or raw evidence capture. Duplicate requests share the
  first close and destination. Stale replies cannot navigate another session.

## Required integration wiring

1. Create/read the canonical exercise session before mounting LessonSession;
   supply `sessionId`, `lifecyclePorts`, and a stable `registerLifecycle` callback.
   Key the component by canonical session ID when replacing a session. Ports are
   captured for that mount; do not swap accounts/commands under the same key.
2. Provide P5's actual write freeze/release and final flush, P2 SessionCommands,
   unique operation IDs, and an `isCurrent` token bound to the mounted session.
   The feature panel becomes inert while frozen; the sink must independently
   reject new writes. Do not interpret client-reported audio as trusted evidence.
3. Route brand/back/mode/history navigation through the registered lifecycle's
   `requestExit(destination)`, retaining the current feature until navigate fires.
   Root owns hash restoration, browser history and focus after navigation. Current
   App is deliberately unchanged and still bypasses this seam: integrated exit
   behavior is NOT claimed for this producer PR.
4. Keep the existing header portal beside Preferences. The supplied button is
   already rendered there; root may adapt placement without duplicating controls.
5. P2/P6 must enforce no-call/no-feedback and one session comment transactionally.
   This client never calls a feedback endpoint or defines evidence sufficiency.

## Open contract and policy gaps

- Q12/Q13: the frozen VoiceConnectOptions/VoiceEvent contain no segment/epoch
  field, and SessionCommands has no connected receipt command. Adapter generation
  guards and captured subscription epochs reject old callbacks locally, but server
  call qualification and broker binding need an integrator-owned seam. A provider
  that broadcasts an old event to a new subscription cannot be distinguished by
  P4's existing event envelope alone. No shared contract was silently extended.
- Call creation/stop uncertainty, provider disconnection, spoken stop, pagehide,
  crash, reload and resumption need Q12 reconciliation. Local pagehide cleanup
  releases media only; it neither closes the exercise nor invents durable recovery.
  Spoken/provider stop currently releases runtime media; durable segment handling
  for that path remains integration work. Explicit UI stop is covered here.
- A failed final flush leaves an error and an open writable exercise. Recovery of
  the rejected queue requires the producer's resolution policy; no retry button is
  selected. Ambiguous close remains held; the frozen helper's retry capability is
  deliberately not exposed until policy is selected.
- Q10 account rules, Q11 aggregate/time semantics, Q13 evidence/retention and P6
  real comment generation remain unselected. No audio/transcript persistence.

## Validation and limits

- `npm ci --cache /tmp/p4-npm-cache`: passed, 79 packages; no lockfile changes.
  Initial default-cache attempt failed because `/home/agent/.npm/_cacache` was
  unavailable; an initial check without installed dependencies therefore failed.
- `npm run check`: final result recorded in the PR; includes TypeScript/build,
  Node tests and 26 Python/content tests. Exact 25 verbs, 33 prompts and 99 oracle
  cases remain intact. Eight-tense, photos and oral/written regressions run in the
  unchanged suites. No P5/content/shared files modified.
- Eleven P4 mocked lifecycle tests cover explicit entry/start/stop, cancel,
  cross-segment confirm, duplicate clicks, no-call, rejected progress, ambiguous
  and mismatched close, stale session, pending start cancellation and old callbacks.
- Supplied Playwright/Chromium + existing intercepted transport: P4 browser test
  passed at 320 and 1024px with zero entry requests, retained draft, released media,
  explicit restart, no external requests and no horizontal overflow. Run with dev
  on 5174 and `NODE_PATH=/opt/codex/cua_node/lib/node_modules P4_BROWSER=1 node
  --import tsx --test tests/p4-browser.test.ts`. Native exit UI is compiled; its
  underlying decision/coordinator behavior is unit-tested, not root-browser-wired.
- One intervening full run failed the unchanged server concurrency test
  `concurrent release is idempotent and session creation waits for confirmed hangup`
  (duplicate release returned 403 instead of 200). Isolated and full rerun outcomes
  are preserved in the PR; no server repair was attempted outside P4 ownership.
- The three pre-existing opt-in browser suites assume earlier automatic call UX
  and were not run/edited. Integrator must update those expectations. Bundle warning
  above 500 kB remains. No CI, real provider, physical device or deployment claim.

## Atlas intake for coordinator

Read the local atlas-navigate skill and the frozen owner ADR. Authority:
[merged Atlas plan/decisions](https://github.com/pablitxn/sysadmin-workspace/blob/b24bad2ed6fa3360bdd3a877af755870df11b866/atlas/wiki/english-learning-backlog.md).
Record P4 as a published, tested producer slice awaiting root/P2/P5/P6 integration
and Q12/Q13 policy. Preserve P0 receipts and deferred device/provider/photo-rights
acceptance; do not record this PR as integrated, merged or deployed.
