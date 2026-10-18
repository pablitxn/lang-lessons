# Authorized Phoenix capture delta

Base review pin: `660f55764df7ed3c24615b8959b1604f0f9ac697`, left unchanged. This delta implements the user's October 18 correction: transcripts and interactions belong in Phoenix, not audio recordings or professor-facing raw traces. It supersedes the earlier no-full-transcripts proposal. No real learner content was used or exported.

## Implementation

The authenticated broker can attach a server-owned sideband observer after persisting the provider call receipt. Its fixed provider URL uses only the broker's call ID and server credential. Completed learner/tutor transcript events and fixed speech/output interaction labels are projected into bounded, redacted Phoenix spans with canonical session/segment/epoch and provider-observed provenance. Audio, audio deltas, provider error bodies and arbitrary event fields are discarded. No transcript or audio database migration is added. Neither speech events nor observer socket state produce trusted connection-duration observations.

Capture uses a 64-entry pending queue, 64 KiB socket payload limit, 16,000-character text limit, hashed deduplication fingerprints and a two-second drain bound. It suppresses superseded epoch queues, contains sink failures, preserves replay protection across same-process reattachment, and exposes metadata-only capture gaps. Replay protection retains the 256 most recently used segment recorders (2048 events each), evicting only fully drained, inactive entries. At most 256 active or unsettled handles are owned; capacity exhaustion blocks new capture until work settles. Legitimate sequential sessions continue beyond 256. Reattachment to an evicted segment can export duplicates; no lifetime exactly-once guarantee is claimed. A restart resets this in-memory replay state. No historical replay completeness is claimed.

The runtime requires the additional explicit `PHOENIX_CAPTURE_TRANSCRIPTS=true` flag, a configured Phoenix sink, enabled voice and authenticated application services. No flag, credential, collector or deployment was configured during this task. Synthetic fixtures use an injected socket and an in-memory exporter. Production recorder calls use `synthetic=false`; live content is never disguised as synthetic. Existing synthetic-only recorder callers retain their old restrictions.

Successful provider cleanup drains/stops capture. Failed cleanup retains the observer; socket failure ends capture and reports a gap without asserting learner disconnection. The manager supports explicit reattachment to an existing call, but no startup scan, automatic reconnect or provider-history backfill is implemented. This is best-effort diagnostic capture, not a durable transcript archive. Retention/deletion and real Phoenix/device/provider acceptance remain outstanding.

## Evidence and limitations

Full standard check passed (see preserved transcript-check.log for counts), with optional PostgreSQL/browser suites skipped in this run; no database behavior changed. Targeted capture, debug evidence, cancellation and telemetry suites passed 26/26, including the real HTTP broker with injected provider transport. A test initially used DELETE instead of the existing POST /session/end route; the failed log is retained alongside the corrected passing test. TypeScript/build passed; existing bundle warning retained. No live provider call or external export occurred.

Transport-history/close policy remains pending. This delta does not make the overall feature complete or authorize merging PR19. P7 review at the unchanged base reports F1–F6 passing and remaining implementation/policy limitations.

Primary references: [server-side controls](https://developers.openai.com/api/docs/guides/voice-server-controls?voice-api=realtime), [official provider event definitions](https://github.com/openai/openai-node/blob/master/src/resources/realtime/realtime.ts).

## Minimal credential onboarding/recovery proposal (not implemented)

Use admin-issued single-use setup/reset links, manually delivered by the administrator through an existing private channel. No email provider is required. Server generates a cryptographically random token, stores only its hash with account/purpose/expiry, and atomically consumes it when the user sets a password. Reissue revokes previous tokens. Recovery requires an administrator to verify the user's identity outside the application, then issue a new link; successful reset revokes existing sessions. Tokens/passwords never enter logs or Phoenix. A fragment-based landing link plus same-origin POST avoids placing the token in server request URLs; the page clears the fragment immediately and loads no third-party assets.

Proposed defaults for user decision: setup/reset links expire after 30 minutes, administrators cannot choose or see passwords, no self-service email recovery, and no public registration. Initial administrator bootstrap remains a separately controlled local administrative operation. Product decision needed: accept manual admin delivery/recovery and the 30-minute expiry. Implementation would include expiry, replay, concurrent redemption, revoked-account and session-invalidation tests.

## P7 C1/C2 remediation

Review evidence: `37bfb44979c1d5559e5a12d53ea7090132641d64` against initial capture delta `19ff6377ed1533007f452947764d1032ad2078ee`.

C1: Redaction now handles quoted JSON/config secret fields (including escaped quotes and spaces), full Authorization header values, and standalone Basic/Bearer values. Tests inspect actual in-memory exported span attributes using fabricated credentials. Redaction is a format-based precaution, not a promise to recognize every possible secret in natural-language transcripts.

C2: Capture ownership now outlives removal from the active socket map. Shutdown waits for all owned handles, including observers already stopped by close/error or explicit cleanup. The original two-second drain bound remains. After timeout, queued exports are suppressed; an already running sink call cannot be cancelled by this interface and may finish later. Its handle remains counted toward capacity until actual settlement, preventing unbounded accumulation of stalled work. The caller then shuts down Phoenix.

Regressions cover 10/10 accepted spans after socket close followed immediately by shutdown, mixed active/stopped observers, a stalled sink and timeout, 300 sequential sessions, replay within and outside the retention window, and capacity recovery after drain. All use synthetic events and injected sinks; no audio recording, real provider call or external export.
