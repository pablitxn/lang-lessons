# P6 feedback coordination handoff

Producer scope: `server/feedback/**` and `tests/p6-*.test.ts`.
Interface base: `8316baa745acf0280181cf72ef6fa400561dcd05` (PR #12).
Accepted application base: `c0b4e470aef77050792122a42f67e6633653a5c6`.
Sole integration writer: task `01a14e4c-74cd-7047-9c85-194a390d3001`.

## Implemented boundary

`createFeedbackCoordinator` consumes P2 jobs through the frozen
`FeedbackRepository`. It never creates a job or handles call/exit events.
Concurrent/duplicate delivery requires an atomic P2 claim; all completion,
failure and insufficient-evidence writes require the same session/job/token
fence. A stored comment has only session ID, text and provenance version.
There is no retry loop, model transport, durable evidence capture or router.
Persistence exceptions propagate without a second mutation: a lost successful
write response cannot turn success into failure. One stored comment does not
promise exactly-once inference after crashes or a future explicit recovery.

Evidence is a generic, ephemeral structural envelope across segment refs of one
session. This is not a proposed Q13 evidence DTO. No audio, transcript, answer or
provider body is persisted or logged. An explicitly injected policy must supply
sufficiency, a maximum comment length, provenance and semantic validation for
qualitative-only, grounded output. No production policy or numerical grade is
selected. Fixture acceptance recognizes only a fixed synthetic comment; it is
not a linguistic validator and must not be used in production.

## Requests to P2 and the integrator

1. Supply the frozen repository with atomic claim of pending eligible jobs only.
   Close and unique job insertion must be one transaction after confirmed close
   with a qualifying call. Cancel, no-call close and segment stop create no job.
   Enforce canonical session ownership and final progress/lifecycle fences there.
2. Review the local `recordInsufficient(claim)` adapter request. The frozen shared
   repository has only `complete` and `fail`; neither can preserve the distinct
   insufficient-evidence terminal state. P6 does not edit that contract or schema.
   The adapter must atomically check running state and the full claim fence and
   return `recorded` or `stale`, like fail. Without it, no claim/model call occurs.
3. Wire a caller only after accepted policy and adapters are available. Do not
   invoke from per-segment stop or exit cancellation. Pass canonical job IDs,
   never browser-supplied evidence. No default background worker is installed.
4. Resolve Q12 qualifying-call and recovery decisions, Q13 evidence fields,
   source trust, sufficiency, snapshot/retention/access and qualitative output
   validation. Retention and semantic grounding are not proved by this module.
   Keep policy null until these dependent pieces are accepted. Q10/Q11-dependent
   access/metrics are outside this producer; do not infer rights or scores here.

## Verification and limits

All tests use structural fixtures and an in-memory repository test double. The
race tests verify worker behavior under fenced repository semantics; P2 must
prove those semantics with isolated database tests. The absent-job cases prove
zero generation when claim returns null, not real database enqueue eligibility.
The two-segment fixture demonstrates one request/result for one exercise session.
No live model, credentials, accounts, database, microphone, deployment or Mac.

Read sources: repository AGENTS, architecture/handoff, P1 ADR including final
partial freeze, Atlas navigation skill and standards, and merged Atlas
`b24bad2ed6fa3360bdd3a877af755870df11b866` plan/decisions. Parent owns Atlas intake.
User requested Astra medium; executor model routing is not independently exposed
by tooling. No agents were launched.
