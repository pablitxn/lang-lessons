# October 18 aggregate integration checkpoint

Accepted main: c0b4e470aef77050792122a42f67e6633653a5c6.
Shared foundation: 8316baa745acf0280181cf72ef6fa400561dcd05.
Root home/navigation checkpoint: 0847e6d1d5539634d60353483f09a4f3a1630822.
PR18 publishes the combined pin; this receipt does not authorize deployment.
Requested execution model/effort is Astra medium. Runtime routing is not exposed
independently; no model-switch receipt or additional-agent launch is claimed.

## Composed producer sources

- P2 PR17: 44bd503185245e4e2f53169a818d0817f513b7be.
- P3 PR14: effaf005ad523bec0bc9b9567609e0387f3f0992.
- P4 PR15: 86d2db48d91eb7cf9ebb9e0cc55dd85e24891041.
- P5 PR16: a6dfe851f086c26a3d8bd007c923bb6fb7ae4203.
- P6 PR13: 16147d1226254c5a3ea5188bacf7ad2a70dd2245.

Initial composition used cherry-picks, preserving producer authorship. Integration
also records original producer ancestry with normal merge commits before the next
review pin. Parent may launch independent P7 against the published exact revision.

## Root repairs and seams

P4's detached call listener initially suppressed offline spelling before first call
and after failed start/stop. Root now invokes the existing deterministic assessor
for typed spelling only when no call subscription exists. Oral events remain
subject to call-epoch rejection. Regression tests and real rendered mocked app
smoke cover the repair; there is no typed-to-oral promotion.

Pictures tests retain every oral/written gate, then assert no advancement before
explicit Next; stale second Next cannot skip generation two. Visible-word mode
still advances automatically. Browser smoke now uses explicit tutor controls and
the header details dialog, retaining cancellation, release, hints and IME checks.

Root HTTP dispatch is mounted through the existing Host-checked broker. Unselected
services return 503; no auth object, credentials, pool or schema is auto-created.
Injected services enforce same-origin JSON, a required limiter, canonical auth
identity, bounded bodies, repository validation and private/no-store responses.
Signup, generic instance registration and logout are unavailable. When account
services are injected, old provider routes fail closed until canonical auth/call
binding is provided; the legacy null-bound broker remains unchanged. Auth/admin/
professor routes and feature composition are not claimed production-complete.

Migration registry applies ordered P2 bodies transactionally under an advisory
lock, records SHA-256 and rejects changed applied bodies. Invocation is explicit.
The root queue sends incrementally, freezes new writes before flush, checks every
acknowledgment/fence and retains rejected/queued batches in memory. No automatic
retry, durable browser queue or crash-recovery policy is selected.

Written sentence refs written:translation and written:tense are separate from the
oral EvidenceLedger and accept only typed source in the boundary parser. The day
projection contract retains written events and individual sessions, requires an
explicit timezone/day interval and exposes boundary-unselected. No totals formula,
usage-time or timezone is invented; a projection/producer binding is still needed.

## Checks

Combined full check with disposable PostgreSQL and the actual integrated P6
coordinator: 271 Node passes, seven opt-in browser skips; 26 Python/content tests,
strict TypeScript and production build pass. Disposable image is PostgreSQL 17
Alpine digest b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24;
loopback port 55433, database p2_test, isolated per-test schemas. Migration race,
checksum, HTTP boundaries, incremental queue/failure and written identity tests
are included. No live account/credential or external database was used.

Mocked Chromium root, UX, sentence, P3, P4, P5, and updated verb suites pass.
Combined application smoke, practice, past-tense and written suites pass across
their documented viewport matrices, including opt-in text hints and tooltip,
IME, reflow, explicit start/stop and offline spelling. No real microphone/provider.

Retained intermediate failures: historical Pictures auto-next expectations;
incorrect new test locator 'Next' (actual label 'Next picture'); old automatic-call/
visible-bar smoke assumptions; the offline spelling regression above; an optional
headers TypeScript error in the new HTTP test; root-only port collision; and the
repeated unchanged concurrent release fixture 403-versus-200. The latter test
scheduled fetches but completed hangup before proving request arrival. It now
waits for the duplicate's received body and the next start request before releasing
the hangup barrier, preserving both idempotency and stale-token assertions. No
production lease semantics changed. All prior logs remain under
/workspace/oct18-integration-evidence and /workspace/root-navigation-evidence.

Bundle warning remains: JS 543.62 kB, gzip 138.91 kB. Hosted CI, linguistic/source
acceptance, physical devices, live voice and Phoenix are not claimed.

## Outstanding integration and policy

Q10 admin-only create/role/deactivate/reactivate is confirmed; P2/P3 resumed additive
work. No concurrent changes to their producer files are retained. Last-admin safety,
server role enforcement and all-student professor reads remain required. No deletion,
credential-delivery or recovery policy follows from that confirmation.

Q11 written results accumulate across visits for the whole day, tutor on/off.
Closing a session cannot reset them. P2 was asked for server-assigned event/session/
segment instants (current schema lacks them); timezone and usage time remain open.
P3 was asked to preserve bounded session pagination and prepare daily views.

Confirmed no-call exit skips the tutor popup but still preserves queued/acknowledged
writes; any earlier qualifying call retains confirmation even when stopped. P4 is
checking that regression. Root preserves flush-before-close-before-navigation.

Still unbound: approved login lifetime/settings and initial handoff, canonical
exercise issuance mapping (P5 uses local refs; never expose arbitrary instance
registration), producer written-event emission, trusted server connected receipts,
Q12 uncertainty/recovery and Q13 evidence/retention/disclosure/qualitative validation.
Dictionary source/reuse/content approval remains open. No numerical metrics,
provider calls, deployment, credential/network changes or Mac work occurred.

## Additive confirmed-policy checkpoint

Subsequent exact heads composed with original ancestry preserved:
P3 3637aeec45fa446bb1ed7f4ae312c76c68c2fd6f,
P4 9c46a57108ef3d773fa66f53f93a9511a16ec768,
P6 2664d58eaf678f493516a0aabdd3d1e580c52f1f.
P3 add/add conflicts came from initial cherry-picked additions; resolution takes
its latest owned files verbatim. P4 tests take the new producer regressions while
retaining root's configurable browser-test port. Root offline spelling stays intact.

Q11 timing is now approved and supersedes the earlier unselected-time paragraph:
written counts while the exercise is visible, pauses after two minutes without
interaction and resumes on input/tap. Tutor counts genuine connection, including
listening without UI input, excluding disconnects. Total is interval union.
Root adds ActivityInterval with explicit source trust, the monotonic-clock written
tracker, immutable replay/conflict handling and a supplied-window union projector.
Tests cover idle, visibility, delayed timers, restart/reconnect gaps, overlaps,
multiple visits and replay. No client tutor totals become trusted. Capture/storage
adapter binding and trusted tutor receipt remain required; day timezone is unset.

User also authorized IndexedDB pending queue/server replay and interrupted-session
resume/finalize. P5/P2/P4 own those additive implementations. Root's memory queue
is a transport/flush seam, not a substitute for pending producer durability/recovery.
Called finalize requires confirmation; no-call exit remains direct with save/flush.
No new recovery UI is invented by the root while the producer is active.

Q13 now authorizes transcript/interaction traces in Phoenix for debugging and
improvement, forbids recorded audio, and keeps app DB structured results/errors/
short comments. Professor views get summaries/results, not raw traces by default.
This supersedes historical blanket transcript exclusion. Root's explicit debug
recorder binds canonical session/segment/epoch, allowlists text records, redacts
recognized secret forms, rejects audio/data-URI/base64 payload shapes, deduplicates
IDs and writes through an injected Phoenix tracer. The test uses only an in-memory
exporter and verifies parent trace correlation. The implementation checkpoint is
synthetic-only and refuses real-student input; no live content-export switch,
collector, credential, network/Tailscale or retention duration was introduced.
Retention/deletion and real-student operation remain unapproved. P6's separately
routed outcome telemetry was composed without enabling real inference/export.

Latest combined npm run check with disposable DB/P6: 283 Node passes, seven opt-in
browser skips, 26 Python tests/content integrity and strict production build pass.
Updated P3 mocked browser/unit suite: 2/2 pass. The root policy utilities are not
represented as live persistence, connected-call observation or Phoenix acceptance.
