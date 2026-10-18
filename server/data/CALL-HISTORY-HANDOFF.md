# P2 PR19 completion adapters

Inspected integration checkpoint `1f1583bd6fafe381e70d723a25c0dd35e31feb29`
(PR19, `feat/oct18-completion`), `docs/oct18-completion-checkpoint.md` and its
latest P1 ADR. P2-owned implementation at that checkpoint matches the preceding
producer head `cc7e6c12c904d06d23cadc3d100945b479df4d7a`. This additive change
preserves that history. Shared/root/broker code and `server/data/migrations.ts`
remain untouched; integrator is task `01a14e4c-74cd-7047-9c85-194a390d3001`.

## Historical call status

`createRecoveryRepository(...).readCallHistory(sessionId)` authenticates current
capability/ownership, locks the canonical session and returns
`{ sessionId, hadConnectedCall: boolean }`. Root can adapt this to the existing
client history endpoint/boolean port. It reads ALL segments, not just active ones.

- Any verified tutor interval or explicit verified connected observation proves
  positive history, even if that segment has stopped and later segments are unknown.
- No segments means false. Otherwise false requires an explicit authoritative
  never-connected observation for every segment.
- Missing observations, stopped state, successful SDP creation, absence of a timer,
  and missing/ended broker receipts do not prove that a connection never occurred.
  Such history throws `RepositoryError('policy-unresolved')`, never false. Root
  must preserve this unavailable state and prevent a no-call confirmation bypass.

`createCallObservationRepository(pool, identity, { access, verify }).record(...)`
is an INTERNAL authenticated source adapter, not a browser endpoint. Input is
`{ eventId, segment:{sessionId,segmentId,connectionEpoch}, kind:'connected'|'never-connected' }`.
Root's `verify` must authenticate immutable server-observed evidence. Positive
usage intervals already originate from the verified tutor-transition port and need
no duplicate observation. Negative evidence requires a definitive never-connected
terminal observation AND an ended canonical segment. Stopped alone remains unknown.
Conflicting evidence/replay bodies are rejected. Exact observation replay is stable;
unknown epochs, other owners and unverified observations cannot write history.
Late new observations cannot change a closed session; exact existing replay may be
acknowledged. No provider payload, audio, transcript or credential is retained.

Root must register the new migration body `migrations/p2-call-history.sql` after
existing P2 migrations. This task does not edit the registry. Existing missing
history remains unknown; no synthetic negative backfill is performed.

## Async close evaluation under the transaction lock

`DataPolicy.feedbackOnClose` is replaced by:

```ts
evaluateClose?: (
  client: PoolClient,
  context: { sessionId: string; segments: readonly CallSegmentRef[] }
) => Promise<'not-requested' | 'pending' | 'insufficient-evidence'>
```

`confirmClose` awaits it after checking ownership/open status, expected lifecycle
revision and exact journal fence, under the session lock, before ANY close/job
writes. `segments` includes historical stopped segments. A thrown guard/evidence
error rolls back the whole transaction, including callback writes. Matching close
replay returns the stored receipt without running the guard/provider again.
No-call close cannot enqueue feedback even if an incorrectly supplied evaluator
returns a comment state. Called close without an evaluator remains blocked.

Use `createCloseEvaluator({ guardBroker, connectedFeedback })` from
`call-history.ts` for the production composition:

1. `guardBroker(client, context)` is root-owned SQL inspection of its durable broker
   receipts on THIS client. Reject reserved/possibly-live/unknown outcomes before
   close. Cleanup/reconciliation happens explicitly through the root broker flow;
   do not substitute SDP success or transport stop intent for confirmed cleanup.
2. P2 reads authoritative historical connection evidence on the same transaction.
   No qualifying connection returns `not-requested`; unknown evidence blocks close.
3. Only a genuinely connected history calls P6/root's
   `connectedFeedback(client, context)`, returning pending or insufficient-evidence
   from its grounded evidence policy. This is a transaction-local eligibility
   decision, not a paid model call. No new evidence/sufficiency policy is invented.

The old synchronous started-segment callback is intentionally not a fallback.
P2 fixture consumers were updated to the async type. Root had no bound
`feedbackOnClose` callback at the inspected PR19 checkpoint. Do not edit frozen
shared SessionCommands: its existing close command shape remains unchanged.

## Failed-feedback recovery discovery

`createRecoveryRepository(...).listFailedFeedback(cursor = null, limit = 50)` returns
`{ items: SessionSnapshot[], nextCursor: string | null }`. It includes only the
actor's CLOSED sessions whose unique feedback job is failed and has no stored
comment. Ordering/bounds use the same ID-cursor convention as `listOpen`, but each
list has its OWN independent cursor. Existing open pagination is unchanged.

Root recovery discovery should combine/deduplicate the open-session page, this
failed-feedback page and P5's local journals without silently dropping a cursor.
Then use existing `read`, `readCallHistory` and `retryFailedFeedback` adapters.
A closed failed session remains discoverable after local IndexedDB data is gone.
After manual retry it leaves the failed list; its job ID is unchanged, its retry
revision increments, and the new worker claim token fences every old worker.
Pending/running/succeeded/insufficient jobs are not misrepresented as retryable.
No new history/professor access grant or automatic retry behavior is introduced.

## Verification boundary

`tests/p2-call-history.test.ts` contains five real disposable PostgreSQL tests:
historical stopped segments and unknown/negative/positive distinctions; no-call
and never-connected no-comment close; asynchronous broker guard rollback and
single enqueue under duplicate close; competing-client proof of the session lock
plus rollback after job-insert failure; closed-failed discovery pagination,
ownership, reload, replay and manual-retry fences. Root broker authority is an
injected SQL fixture, not a real provider call or claimed root integration test.

Full prior P2 and application checks are run before publishing; exact final head
and results are recorded in PR17. No shared contract, broker, root route, manifest,
registry, live credential/account, provider/Phoenix export, deployment or main
merge is performed. Coordinator owns Atlas/Notion propagation. Requested model
remains Astra/medium; this executor cannot independently certify routing metadata.
