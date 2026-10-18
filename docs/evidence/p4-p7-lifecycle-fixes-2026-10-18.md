# P4 fixes for P7 lifecycle reproductions

P7 reported two lifecycle defects at reviewed integrated head `3b54330`.
This additive producer delta starts at P4 published head
`dc6ce8849b4c53e65a21147c6e34d920839b36cc`; the exact new head is in PR15.
No integrated/root files or earlier recovery UI are replaced.

## Reproduction and fix

1. After startCall succeeds, keep runtime.prepareConnection pending, press Stop,
   release preparation, and await both actions. Previously the intentional abort
   became a lifecycle error even after stopCall succeeded, blocking both restart
   and exit. The start's captured epoch now distinguishes explicit cancellation;
   it suppresses that abort only AFTER a matching successful stop receipt. A failed
   receipt remains an error and retains the segment for reconciliation.
2. After a connected call emits offline in the same session, Start previously
   returned because the old segment remained recorded. Explicit Start now cleans
   local transport, reads the current server lifecycle revision, stops that old
   segment, validates the receipt, then obtains a fresh revision and starts a new
   segment. No automatic reconnect, feedback or exercise-session replacement.
   Ready/connecting segments still reject duplicate starts. Stop during that
   reconciliation invalidates the replacement start before it reaches the server.

Context identity, earlier connected-call history and recovery behavior remain
unchanged. A transport state event is not treated as a trusted server receipt.
No call-history inference, contract widening or root-port binding is introduced.
Root's unbound ports and integrated offline spelling fix remain integrator-owned.

## Verification

The new exact regressions failed on the published producer before the fix.
Five new test cases cover the two reproductions (including restart AND direct
no-call exit after preparation cancellation), rejected disconnected-segment stop,
Stop during reconciliation, and rejected stop after intentional startup abort.
All P4 suites pass 41 tests with two opt-in browser skips. Full npm run check
passes 260 Node tests with five browser skips, 26 Python/content tests, strict
TypeScript and production build. Existing bundle warning remains. No browser
rerun is claimed for this pure lifecycle change; original browser evidence stays
scoped to its published revisions. No live accounts/provider or paid calls.

Only session-lifecycle.ts, tests/p4-lifecycle.test.ts and this additive receipt
change. Apply the new commit atop the integrated candidate, preserving all prior
recovery/P2-adapter and root changes; do not copy the producer's old runtime file.
