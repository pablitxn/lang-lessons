# P4 asynchronous resume handoff

Additive base: `d00f7ebbf979ca44912ac5c6bb57df5c562f83bc` on producer PR15.
Inspected PR19 checkpoint `1f1583bd6fafe381e70d723a25c0dd35e31feb29`, its
`docs/oct18-completion-checkpoint.md` and latest owner ADR. Root now reconciles
transport asynchronously before mounting the recovered canonical session.

`SessionRecoveryPorts.resume(record)` accepts `void | Promise<void>`. The controller
awaits the result before setting phase to resumed, then rechecks its existing
account/session-current guard, abort/disposal state. During the await the recovery
card remains available and busy, and duplicate clicks share one in-flight action.
Rejection remains visible on the same card with restored queue/lifecycle retained;
a later explicit Resume retries the handoff. No automatic retry, audio start,
segment stop or session close is added. Root still must guard its own asynchronous
mount side effects against account/session changes; P4 cannot cancel work internal
to a callback that does not accept an AbortSignal.

Four new regressions cover delayed success/duplicate clicks, rejection/explicit
retry, account invalidation/disposal/current-session-guard change during await,
and cancelled called-session finalization followed by delayed resume with no close
or premature practice termination. All P4 suites pass 45 tests with two opt-in
browser skips. Strict TypeScript/production build passes. Full-check outcome is
recorded in PR15; producer verification is not PR19 aggregate acceptance.

Only `src/app/session-recovery.ts`, P4 tests and this evidence change. Recovery UI,
P2 adapter, StudentApplication, contracts, root routing, manifests and server files
remain untouched. Integrator task `01a14e4c-74cd-7047-9c85-194a390d3001` should apply
this single additive commit onto completion, preserving its producer history.
