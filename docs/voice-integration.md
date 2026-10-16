# Local voice integration and evidence limits

EN-WP-01 owns this recovery implementation of EN-WP-04 after the separately
dispatched environment failed provisioning. No other task writes `src/voice`,
`src/assessment`, `server`, root composition or shared contracts in this checkout.
The feature owners retain `src/features/verbs` and `src/features/sentences`.

## Stable composition

`createMockVoiceAdapter()` and `createRealtimeVoiceAdapter()` implement
`VoiceAdapter`. Root `LessonSession` supplies a memory-only `sessionId`, adapter,
settings and completion callback through `LessonModuleProps`. It owns explicit
start/stop, mute, interruption, mode/provider replacement and unmount cleanup.
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
after the correlated model response. The visible stop control works immediately.
`Resume practice` deliberately releases pause/question intent. Preferences and
helper changes must never reconnect the adapter.

Speech end does not mean transcription end. A dedicated `transcription-pending`
count holds the completion gate until each final transcript has been delivered,
including out-of-order turns. A 20-second timeout after speech ends produces a
transport error, preserving the exercise; it never releases a completed verb into
automatic advancement. Exercise replacement/disconnect cancels pending work.
Same-exercise sentence stage changes preserve outstanding audio/transcription.
If a queued verb turn loses all assessment targets because the preceding turn
finished them, it is forwarded as conversation with no evidence refs. Unclear
queued turns ask for clarification and keep progression blocked.

## Mock and real boundaries

Mock mode is the default. `simulateUtterance(text, outcome)` registers an explicit
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

`npm run dev:voice` binds `127.0.0.1:8787`. Without both server-only
`OPENAI_API_KEY` and `ALLOW_PAID_VOICE=1`, session creation returns 503 and makes
no provider call. The normal dev/preview servers proxy `/api/realtime` locally.
Use a separately authorized terminal/session to supply credentials and paid-call
scope; do not commit an env file or put credentials in `VITE_*`. No real session
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
SDP exchange reserves the lease even if its response is invalid. Early browser
stop does not release the conservative server lease.

Only whitelisted learner preferences persist locally. Audio, transcript, rubric
results, tokens and provider choice stay out of storage. Audio reaches the
provider during live sessions; provider retention, account controls, exact costs,
physical mobile support and acoustic/latency quality have not been verified.
No public deployment, auth system, analytics, CI or database is installed here.

## Validation categories

Unit tests use deterministic fixtures and a fake clock. Protocol tests inject
provider JSON and audio-item references. Lifecycle tests inject fake media tracks,
peer connections and broker fetches. Broker tests run a loopback HTTP server with
an injected upstream fetch and a fake key. Browser checks use actual Chromium
rendering with mock interaction, no microphone permission and no provider calls.
None of these categories is real-voice evidence.

Protocol design references (checked 2026-10-16):
[official WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc)
and [official conversation guide](https://developers.openai.com/api/docs/guides/realtime-conversations).
