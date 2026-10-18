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
session. This is not a proposed Q13 evidence DTO. P6 does not persist audio,
transcripts, answers or provider bodies in application storage. The approved
Phoenix transcript/interaction trace destination is separate, as amended below. An explicitly injected policy must supply
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
   source trust, sufficiency, snapshot/retention details and qualitative output
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

## Q13 approved correction and scoped telemetry amendment

The follow-up user mandate approves transcripts and interaction traces in Phoenix
for debugging/improvement; recorded audio must never be persisted. Application
storage contains structured results/errors and the short comment. Professor
views expose summary/results, not raw Phoenix traces by default. This supersedes
the earlier blanket no-transcripts proposal; it does not authorize live export.
Retention/deletion durations remain undefined before real-student operation.

P6 now accepts an optional injected `FeedbackTelemetry` with an explicit route
alias. Only whitelisted job/session linkage and outcome are sent. There are no
claim tokens, transcripts, arbitrary payloads, errors or audio in these events;
secret-bearing exception bodies are suppressed. Exporter failure does not change
a stored result or trigger retry. The integrator must supply a bounded sink,
redaction and access controls; no SDK, endpoint, credential, fetch or default
Phoenix destination is added. The sink is tested only with local fixtures.

Integrator request: instrument the separately owned interaction/voice transport
for approved transcript/interaction capture in Phoenix, with explicit access and
routing, secret redaction, and exclusion of audio bytes. Correlate those traces
by canonical exercise session and segment IDs. Do not expose trace access through
professor summary DTOs. P6 metadata linkage does not implement transcript capture.

P2 request: retain structured results/errors and the comment only. Do not add raw
transcript columns or hydrate arbitrary Phoenix traces into the application DB.
Provide the existing policy.evidence adapter with the approved scoped structural
snapshot once fields, sufficiency and trust are coordinated; transcript storage
approval alone does not freeze that DTO. Raw Phoenix traces are not automatically
trusted assessment, and written text does not certify pronunciation.

Amendment validation: 12/12 P6 fixture tests pass, including explicit route,
metadata-only payload, exporter failure isolation and sanitized failure events.
Earlier exact-head evidence remains in PR13 history at
`16147d1226254c5a3ea5188bacf7ad2a70dd2245`; this amendment supersedes only its
blanket transcript restriction and adds the telemetry linkage seam.
