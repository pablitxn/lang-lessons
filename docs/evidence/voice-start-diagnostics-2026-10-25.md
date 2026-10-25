# Deployed voice failure and bounded startup diagnostics

Date: 2026-10-25. Diagnostic implementation extends local-startup commit
`3e9767c0860f633520272268ac0024fb09a74b8e` in draft PR 30.
This amends the production-student verification limit in
[the previous receipt](voice-readiness-2026-10-24.md), retaining that evidence.

## Observed production attempt

The user supplied an authenticated student browser session and explicitly
authorized one microphone/provider test of up to 20 seconds. In the French
visible-verb exercise, the actual Start tutor control was enabled with no
availability error. Selecting it showed Connecting voice, then the generic
startup error before 20 seconds. No second provider attempt was made.

Read-only runtime checks found one recent rejected broker receipt, with a
1.195-second reservation-to-rejection interval, no provider call ID and no
outstanding reserved/created receipts. The browser had returned to Start tutor.
No connected call was observed. These facts support a startup rejection rather
than a disabled phone; they do not identify the provider's exact reason.

The current server collapses upstream rejections into HTTP 502 and discards their
details. Production had no configured Phoenix/OTLP collector, and recent logs
contained no diagnostic entries. The exact upstream status and reason therefore
could not be recovered from that attempt. Billing, access and request validation
remain unresolved possibilities, not established diagnoses. No production config,
accounts, credentials or permissions were changed.

## Prepared implementation

The broker retains its local authentication semantics while returning a bounded,
server-authored failure category and upstream status. Known credit/spending
codes remain separate from ordinary request rate limits. The client validates
the envelope and chooses its own static message. Provider text cannot become
lesson content, telemetry or learning evidence. Optional Phoenix metadata can
record the same category when tracing is separately configured.

Diagnostic JSON is limited to 4 KiB and one second. A definite provider rejection
releases the canonical reservation and local lease before parsing its optional
body. Cleanup and capacity cannot depend on diagnostics. No automatic provider
retry is introduced, and ambiguous network failures retain existing safeguards.

This is a source candidate for review. Deployment and a further live attempt need
separate session authorization; neither is implied by passing mocked tests.

## Candidate verification

- `npm run check`: passed; 467 Node tests passed, 88 optional tests skipped,
  28 Python/content tests, curriculum integrity, strict TypeScript and Vite build
  passed. The existing bundle-size warning remains.
- Scoped server/client/telemetry regressions: 54 tests passed. Cases cover
  canonical rejection before diagnostic parsing, malformed/oversized/stalled
  bodies, cancellation, credential redaction, static learner messages and no
  provider retries or assessment evidence.
- `node scripts/smoke-voice-start-failures.cjs 5189`: all 16 rendered cases
  passed in actual Chromium with mocked account/media/provider transport. Each
  checked exactly one explicit startup request, cleanup, no external requests
  and unchanged written practice. The supplied shell helper passed all four
  viewports. The temporary isolated frontend was stopped afterward.
- Independent review found and resolved one diagnostic accuracy issue: unknown
  429 bodies must not imply temporary rate limiting. Only known rate codes/types
  produce that advice; unreadable or unknown diagnostics retain uncertainty.
- JavaScript syntax and `git diff --check`: passed. Fixture-only snapshot timing
  issues were corrected before the final frozen browser run.

The private runtime Dockerfile copies individual platform files. Its release
adaptation must include the new bounded-JSON helper before publishing an image;
the application source revision alone does not establish deployable packaging.
No database migration, routing change, credential replacement or telemetry
enablement is required by this candidate. A further production attempt remains
pending deployment authorization and a separately bounded call authorization.
