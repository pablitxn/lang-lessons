# P4 confirmed exit rule amendment

Additive delta from published P4 head
`86d2db48d91eb7cf9ebb9e0cc55dd85e24891041`, on draft PR15. The original receipt
remains unchanged. Source: parent continuation explicitly confirms no tutor popup
for a written-only visit, retained confirmation after an earlier stopped tutor
call, truthful persistence failures, and daily written progress across visits.

The existing implementation already follows the exit rule: requestExit checks
session-long hadConnectedCall, not current transport state. With no connected
call it proceeds through final progress flushing and close without opening a
dialog. The coordinator navigates only after final acknowledgment and matching
close. No runtime change is required; this amendment adds regression evidence.

Three additional mocked tests prove:

- A written-only visit never enters confirming state, including while its final
  queued write is pending. Earlier acknowledgment remains intact; the final
  committed journal fence is passed to close before navigation.
- After explicit tutor start and stop, transport is offline but exit still asks
  for confirmation. Cancel preserves the session; subsequent confirm closes once.
- A written-only flush failure opens no confirmation, releases preparation,
  reports unsaved progress, and does not close or navigate. Queue ownership stays
  with the injected progress sink; this is not a database-retention test.

Validation: 14/14 targeted P4 lifecycle tests; full npm run check passes 233 Node
checks with four opt-in browser skips, 26 Python tests, curriculum integrity and
TypeScript/production build. Browser rendering was not rerun for this test/docs
only delta; prior P4 browser evidence is unchanged. The same 535.60 kB bundle and
existing warning remain. No shared/root/server/P5 files changed.

## Integrator handoff

Task `01a14e4c-74cd-7047-9c85-194a390d3001` should consume this additive commit
alongside the original P4 patch. Continue to wire all ordinary navigation through
the registered lifecycle and retain the active feature until navigate fires.
Do not introduce a generic exit popup for no-call visits. Supply a progress sink
that flushes queued writes and preserves acknowledged daily history across
visits; P4 does not reset, delete or aggregate that history. Daily grouping and
storage belong to P2/P5 integration, and are not claimed by these isolated tests.
No new crash, retention, recovery, or failed-close retry policy is inferred.
