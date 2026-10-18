# Root home tools and navigation integration seam

Base: frozen PR12 `8316baa745acf0280181cf72ef6fa400561dcd05`.
This isolated root slice does not change producer-owned lifecycle, assessment,
progress, account or feedback implementations. Requested execution: Astra medium;
runtime model/effort routing is not independently exposed. No agents launched.

## Behavior

Progress and Reference are available from Home. App suppresses lesson tool mounts
through a root-controlled mobile-layout context; isolated feature fixtures retain
their component defaults. Home Reference reuses the authored eight-tense guide.
Home Progress has an injectable authorized view and an unavailable placeholder,
not invented metrics, cross-account access or local-to-server data migration.

Root owns in-document hash navigation and restores the active lesson URL while
awaiting authorization. Link, owned Back/Forward and hash-change paths keep the
mounted lesson until acknowledged. Concurrent clicks coalesce. Registration
cleanup and replacements invalidate old results. Missing registration fails
closed when `requireExitRegistration` is enabled. Default remains legacy until
the accepted P2/P4 integration supplies canonical sessions; this is NOT a claim
that durable close is wired in the shipped application.

P4 PR15 already owns createExitCoordinator. Register a RootExitHandler through
`src/app/navigation-context.tsx`, adapting P4 `requestExit(destination)` and its
`navigate` acknowledgment to return the actual acknowledged destination or null.
Do not instantiate a second coordinator or commit history directly from P4.
Capture acknowledgment per mounted canonical session, key LessonSession by that
session, and invalidate both P4 isCurrent and root registration on replacement.
Set requireExitRegistration only with that wiring. Browser unload/reload and
cross-document Back remain separate unresolved lifecycle policy.

## Checks and retained failures

- npm ci with /tmp cache passed; no manifests or dependencies changed.
- Final npm run check: 219 Node passes, four opt-in browser skips, 26 Python tests,
  content integrity and TypeScript/production build passed.
- Concurrent root-navigation, UX, verbs and sentences mocked Chromium suites:
  four passes. New root coverage at 320, 390, 844 and 1024 pixels checks cancel,
  coalescing, flush/close ordering, mounted draft preservation, exact replay after
  ambiguous close, Back/Forward, hash edits, and unregistered fail-closed mode.
  Replay is a fixture capability, not a selected P4 recovery UI/policy.
- Root app smoke, practice, past-tense and written suites all passed, updated for home-only
  controls while preserving typed/oral gates, settings, voice cleanup, IME and
  layout assertions. Shared feature suites still cover component-level progress
  and reference behavior; no feature assertion or oral gate was weakened.
- Initial compilation caught a nullable history index and was fixed. One full
  check reproduced the unchanged concurrent voice-release failure (403 vs 200),
  also reported by P3/P4/P5. Final full check passed; failure is not erased or
  presented as repaired. Initial browser smoke runs collided with the sentence
  suite's port 5196 and lost its server; reruns use a separately owned server.
- Bundle warning remains: JS 533.69 kB / gzip 135.95 kB, versus base 530.35 kB.
  Local logs are retained at /workspace/root-navigation-evidence.

## Integration gaps and review queue

Exact producer heads queued for aggregate review: P3 effaf005ad523bec0bc9b9567609e0387f3f0992,
P4 86d2db48d91eb7cf9ebb9e0cc55dd85e24891041,
P5 a6dfe851f086c26a3d8bd007c923bb6fb7ae4203,
P6 16147d1226254c5a3ea5188bacf7ad2a70dd2245. P2 is pending.

P2/P4 need a server-owned connected receipt bound to the canonical session,
segment and connection epoch. Browser ready/client-reported audio cannot qualify
feedback. The actual trust/broker binding and Q12 qualification remain unbound.
P6 requires the fully fenced insufficient-evidence adapter; null policy must
prevent inference. P5 requires separate written sentence identities before local
comparison events are persisted; never reuse oral obligation IDs. Q10-Q13,
dictionary source/content approval, real voice/device/Phoenix acceptance remain
open. No merge, deployment, paid calls, credentials, network changes or Mac work.
Parent owns sequencing and canonical Atlas intake.
