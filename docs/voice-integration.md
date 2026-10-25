# Local voice integration and evidence limits

EN-WP-01 owns this recovery implementation of EN-WP-04 after the separately
dispatched environment failed provisioning. No other task writes `src/voice`,
`src/assessment`, `server`, root composition or shared contracts in this checkout.
The feature owners retain `src/features/verbs` and `src/features/sentences`.

## Stable composition

EN-WP-08 extends provider task data and instructions to eight present/past tenses,
including questions/negatives, regular/irregular auxiliary rules, temporal context
and actual accepted-translation explanation. Both verb modes receive contextual
past examples. Progressive base-family evidence cannot certify the separate
lexical participle. These are prompt/contract integration changes, not a claim
that a real model has evaluated the new curriculum. Existing audio provenance,
stale-stage/attempt guards and no-spoiler envelopes remain required.

`createMockVoiceAdapter()` and `createRealtimeVoiceAdapter()` implement
`VoiceAdapter`. Root `LessonSession` supplies a memory-only `sessionId`, adapter,
settings and completion callback through `LessonModuleProps`. It owns explicit
phone-button startup, mute, pause/resume, lesson replacement and unmount cleanup.
The application composes only the live adapter; test adapters stay in fixtures.
Preference changes preserve the mounted session. Opening preferences emits a
scoped `presentation-hold`; helper holds stay independent. The optional
`askQuestion({ ...identity, requestId, text })` treats typed questions as
conversation, never pronunciation evidence. `response-pending` holds the
controller while generation is running; playback completion is a separate event.

Feature transcript subscribers allocate current attempts and call `voice.submit`,
or reserve queued audio synchronously with the stable root `claimUtterance(id)`
callback. Both paths mark the same bounded set of handled utterance IDs without
creating an extra provider call. Both verb routes receive this callback. The root
forwards an unclaimed final live utterance as conversation-only input, so questions
remain possible after all obligations are accepted. That path creates no learning
acceptance. Stop/restart invalidates any queued fallback microtask. Microphone
speech interrupts playback immediately; pause/stop/question intent is interpreted
after the correlated model response. The visible pause control disconnects immediately.
`Resume call` reconnects the same lesson and releases pause/question intent. Preferences and
helper changes must never reconnect the adapter.

Speech end does not mean transcription end. A dedicated `transcription-pending`
count holds the completion gate until each final transcript has been delivered,
including out-of-order turns. A 20-second timeout after speech ends produces a
transport error, preserving the exercise; it never releases a completed verb into
automatic advancement. Exercise replacement/disconnect cancels pending work.
Same-exercise sentence stage changes preserve outstanding audio/transcription.
Each sentence transcript carries an adapter-owned `sentenceScope` capture receipt.
The stage is fixed at speech start; any intervening stage transition invalidates
assessment eligibility, including translation/explanation/translation cycles.
Missing or stale receipts create no sentence attempts. The root may still forward
that turn as conversation with zero evidence refs, and the learner is asked for a
fresh response. The protocol independently checks its recorded capture before
accepting assessment refs, so caller-supplied current refs cannot promote old audio.
Duplicate speech-start events preserve the first capture. Mock mode enforces the
same stage boundary; no extra persistence or provider request is introduced.
If a queued verb turn loses all assessment targets because the preceding turn
finished them, it is forwarded as conversation with no evidence refs. Unclear
queued turns ask for clarification and keep progression blocked.

## Test and real evidence boundaries

Mock adapters are internal test fixtures, not an application mode. `simulateUtterance(text, outcome)` registers an explicit
fixture; the outcome is accepted, incorrect or uncertain. It uses no microphone,
network or semantic/acoustic model. Unknown utterances cannot silently pass.
Typed spelling uses local grapheme comparison in both adapters; missing characters
are marked as gaps without supplying the answer. Oral success always needs actual
audio in the real protocol or explicitly permitted mock evidence in the controller.

The real adapter uses native WebRTC plus a same-origin SDP broker. The permanent
key stays in the server process. Provider JSON is validated, correlated by request
metadata, and mapped to independently versioned attempts. Real pronunciation
requires a captured audio item and the provider's `audioClear` flag. Transcription
is an ancillary signal. A model can still misjudge pronunciation, grammar, intent
or whether a sentence is original: those judgments need real evaluation.

Assessment, hint and question responses force the `report_lesson_result` function
with a bounded JSON Schema. A prompt asking for JSON alone is insufficient:
Realtime can return ordinary prose, including a text preamble alongside a forced
function. The protocol ignores assistant text preambles and validates the single
expected function's arguments. Other functions, duplicate calls, malformed
arguments and mismatched request identifiers fail closed. Existing attempt,
audio and coaching checks still apply. The function only carries a result; it
executes no external action and does not trigger a tool continuation. Validated
speech uses a separate audio response with tools explicitly disabled.

Hints are requested per level and stage. Before sentence translation acceptance,
text and speech use the same strict reviewed prompt envelope in
`src/assessment/coaching-policy.ts`. Rejected provider coaching, questions and
hints create no speech request. The sentence feature uses the same decisions for
display and explicitly labels authored fallbacks from fixture/legacy adapters.
This limits free-form model coaching before acceptance; it does not establish
general semantic safety. Other stages retain conservative lexical checks. Only
validated coaching text is scheduled for speech, in a separate response. Actual
speech adherence to that text remains unverified. Provider session defaults
disable unsolicited automatic responses. Sentence explanation receives the
accepted learner translation in memory and retains valid alternative constructions.

## Local setup and limits

`npm run dev` (or `node scripts/dev-local.mjs`) starts the frontend and broker
together. The broker loads the optional `accounts.local/app.env` and then
`.env.local` through Node's env-file loader; inherited variables take precedence.
The launcher honors saved `ALLOW_PAID_VOICE`, with `--voice` / `--no-voice`
overrides for one run. The credential example enables availability after a key is
configured. Opening a lesson only checks availability. The phone button requests
microphone permission and starts the call after the learner explicitly selects it.
Ctrl-C stops both processes, and occupied ports are preserved. See the README's
[credential setup](../README.md#credentials-and-live-voice).

`npm run dev:voice` also binds `127.0.0.1:8787` and loads the same optional env files.
Without both server-only
`OPENAI_API_KEY` and `ALLOW_PAID_VOICE=1`, session creation returns 503 and makes
no provider call. The normal dev/preview servers proxy `/api/realtime` locally.
Use an ignored env file and explicit paid-call scope; do not commit an env file
or put credentials in `VITE_*`. No real session
was opened while implementing this work. `OPENAI_REALTIME_MODEL` is an optional
server override; the default `gpt-realtime-2.1` follows the current official guide
and is not verified as available to this account.

The broker rejects non-loopback hosts, unapproved origins, non-JSON and oversized
offers. It has one in-process pending/session lease for at most ten minutes, no
automatic paid retries, no request-body logging and no upstream error-body relay.
The browser independently stops tracks, fetches, channels, playback and timers.
Abort after a permission prompt also stops a late-arriving stream. Restarting the
broker resets its lease; this is a local development guard, not authentication,
a dollar budget, account rate limit or production security boundary. A successful
SDP exchange reserves the lease even if its response is invalid. A valid exchange
also returns an opaque, memory-only release token. Pause, route replacement and
page exit close local media immediately and request same-origin session teardown.
The broker validates that token against the active lease, then calls the provider
hangup endpoint using its server-owned call receipt. Only confirmed hangup clears
the lease. Resume waits for teardown; failures retain the lease and require an
explicit retry. The browser never receives the permanent credential or provider
call ID. A disconnected browser during setup triggers orphan cleanup when the
bounded upstream exchange returns a call receipt. Page-exit teardown remains
best effort; crashes and unavailable network/provider still need the lease limit.

Only whitelisted learner preferences persist locally. Audio, transcript, rubric
results, tokens and provider choice stay out of storage. Audio reaches the
provider during live sessions; provider retention, account controls, exact costs,
physical mobile support and acoustic/latency quality have not been verified.
No public deployment, auth system, analytics, CI or database is installed here.

## Startup failure diagnostics

The authenticated readiness endpoint checks configuration presence. A ready
response does not prove that the provider will accept a call, that credits or
spending allowance remain, or that a microphone can connect.

Local broker authentication and provider authentication are separate. A rejected
provider request remains broker HTTP 502. Its optional `failure` envelope contains
only a validated category and numeric upstream status; the browser chooses a
static message. Provider messages, response bodies, arbitrary codes and request
identifiers are never displayed or exported. Unknown or mismatched diagnostics
retain the generic startup error.

Known provider credit, spending, quota, rate, access, configuration and model
failures follow the [official API error codes](https://developers.openai.com/api/docs/guides/error-codes#api-errors).
Only a 429 or 404 diagnostic body is inspected, with a 4 KiB byte limit and a
one-second deadline. Rejected canonical reservations and local leases are
released before diagnostic parsing. A failed diagnostic stream cannot keep a
rejected call reserved. Upstream network failures still retain their existing
conservative ambiguous-call behavior.

When Phoenix is configured, the server-observed creation span records upstream
HTTP status and the allowlisted failure category. Configuring diagnostics does
not enable telemetry, transcript capture, calls or automatic retries. A startup
failure never creates learner assessment evidence.

## Validation categories

Unit tests use deterministic fixtures and a fake clock. Protocol tests inject
provider JSON and audio-item references. Lifecycle tests inject fake media tracks,
peer connections and broker fetches. Broker tests run a loopback HTTP server with
an injected upstream fetch and a fake key. Browser checks use actual Chromium
rendering with injected media/peer objects and intercepted broker responses, with
no physical microphone access or provider calls.
None of these categories is real-voice evidence.

Protocol design references (checked 2026-10-16):
[official WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc)
and [official conversation guide](https://developers.openai.com/api/docs/guides/realtime-conversations).
The teardown implementation uses the [official hangup endpoint](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup)
(checked 2026-10-17); injected transport checks do not establish real provider behavior.
