# P4 consumer alignment with P2 recovery

Additive base: `c5efed4cf76a2aa7a1ae9116d893a0089994b4e2` on PR15.
P2 producer inspected: PR17 `cc7e6c12c904d06d23cadc3d100945b479df4d7a`, including
`server/accounts/POLICY-HANDOFF.md`, `server/data/USAGE-RECOVERY-HANDOFF.md`,
`recovery.ts` and segment/close operations in `repository.ts`. No P2 edits.

`createP2RecoveryAdapter` in `src/app/p2-recovery-adapter.ts` now bridges P2's
published producer DTOs to the P4 recovery controller. Root supplies the
account-bound authenticated client; no server module enters the browser bundle,
HTTP route is guessed, or shared contract is edited. Local DTO mirrors are pinned
to that P2 head pending integrator-owned shared promotion.

- `client.read(sessionId, signal)` returns P2's session, progress fence,
  activeSegments and nullable feedback job with its independent retryRevision.
- The P4 record preserves progress/activeSegments/feedbackJob for P5 restoration
  and root reconciliation. No job maps to not-requested; it is NOT a claim about
  whether a call happened earlier. Journal/lifecycle/retry revisions stay distinct.
- The manual retry sends EXACTLY `{sessionId, jobId, operationId,
  expectedRetryRevision}` to `client.retryFailedFeedback`. Account ID is a local
  scope guard, never client-supplied request authority. The server owns ownership,
  current permission checks, retry fencing and uniqueness.
- Uncertain replies retain the same body/key even after a canonical refresh
  advances the retry revision. New retry operations require a known failed job;
  pending/succeeded/insufficient states are not requeued. Responses must match
  session/job and the expected next retry revision.
- The adapter is bound to one account/session. Abort or disposal clears its cached
  snapshot and prepared retry and permanently invalidates that instance. Root must
  create a new adapter after account/session changes. Recovery's existing shared
  AbortSignal provides the connection to synchronous account invalidation.

## Required integration and remaining history gap

Construct an adapter with `{ identity, isCurrent, client, readCallHistory }`, then
supply its `read` and `retryFeedback` methods to `createSessionRecovery`. Continue
supplying the existing P5 preparePractice and root resume/navigation ports. Root
owns authenticated HTTP wrappers and P2 DTO promotion; these repository methods
are not automatically mounted browser APIs.

`readCallHistory(sessionId, signal): Promise<boolean>` is REQUIRED, with no default.
P2's snapshot only queries segments that have NOT ended. Thus an empty
activeSegments array cannot distinguish a written-only session from an earlier
stopped tutor call. Root/P2 must expose authoritative lifetime connected-call
history before enabling the recovery decision UI. Neither active segment count,
feedback absence, nor journal outcomes may substitute for this fact. This exact
missing seam was reported to the integrator on PR15. P4 does not invent one.

P2 confirms close atomically ends remaining segments/usage streams; root still
must reconcile a potentially live other-browser connection before replacement.
listOpen identifies candidates, not proof of abandonment. No client force-stop,
backdated activity total, timezone/retention default, credential delivery or
new grounded-evidence policy is selected here. P5 remains the sole pending-queue
and daily across-visit written-history consumer; Phoenix instrumentation remains
outside the app queue.

## Validation

Seven new mocked adapter cases plus the existing lifecycle/recovery cases pass
36/36. Cases cover exact P2 retry body, independent revisions, stopped-call history,
uncertain replay after refresh, no-job mapping, cross-account/foreign-fence denial,
abort invalidation and disallowed job states. Strict TypeScript/production build
passes. Full-check outcome is recorded in PR15. These are consumer DTO/behavior
tests; P2's isolated PostgreSQL evidence remains its own producer receipt. Browser
rendering was not rerun for this adapter-only change. No credentials, provider,
raw audio/transcripts, IndexedDB implementation, deployment or merge.
