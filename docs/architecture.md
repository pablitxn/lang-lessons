# EN-WP-01 architecture and contract decision

Date: 2026-10-16. Owner: EN-WP-01 foundation/integration executor.
Status: selected reversible implementation defaults under the delegated roadmap
launch. These are implementation decisions, not retroactive product approvals.

## Authority and inspected state

The supplied mandate authorizes foundation implementation and draft publication,
superseding the earlier planning-only status. Product requirements come from
[Atlas EN-D01 through EN-D14](https://github.com/pablitxn/sysadmin-workspace/blob/62dcbe9079eb6c447a00786405fb7976dc94e92c/atlas/entries/2026-10-16-english-learning-consolidation.md).
The inspected Atlas checkout is clean at that exact commit. `lang-lessons` had
no files, local commits, AGENTS or remote refs; remote metadata identifies
`pablitxn/lang-lessons`, public, default branch `main`. There is no existing app
architecture to preserve. Saved onboarding's instruction to preserve the empty
checkout concerned setup; the later implementation mandate now authorizes code.

## Defaults and alternatives

| Concern | Selected default and reason | Revisit when |
| --- | --- | --- |
| UI | React 19, strict TypeScript, Vite; same dependency versions as the inspected Atlas webapp | Real-device constraints require another runtime |
| Routing | Three hash routes; browser history and static hosting need no rewrite rules or router dependency | More nested routes justify a router |
| State | Feature-owned React state; shared pure contract policies; one root voice session | Cross-device synchronization is authorized |
| Persistence | Versioned localStorage for non-sensitive preferences only; memory for lesson evidence | Durable progress requirements and deletion policy are agreed |
| Voice | Provider-neutral adapter; deterministic mock by default; WebRTC transport through a same-origin server SDP broker | Comparative real-audio evaluations justify a provider change |
| Provider candidate | OpenAI Realtime, configurable server-side model; no claim of provider quality or account access | Scoped credentials, budget and audio evaluation become available |
| Backend | Minimal Node HTTP broker for local opt-in voice; no database, account system or telemetry | Public hosting/authentication are selected |
| Hosting | Loopback-only local dev/build preview; no deployment target | Separate deployment mandate |
| Sentence advancement | Explicit Continue only after translation and explanation | Product owner decides EN-Q07 |

Npm lockfile and package versions are exact. No UI framework, state library,
database, analytics, remote fonts or audio collection is needed. A native app or
full-stack framework adds migration and setup cost without current requirements.
Browser speech recognition alone cannot establish pronunciation; an STT + TTS
pipeline would also change the primary continuous native-audio experience.

## Module graph

`src/app` owns navigation and the long-lived voice adapter. Feature components
receive `LessonModuleProps`, import typed content, and keep their current exercise
and helper visibility separate. `src/voice` handles transport/provider protocol
and emits validated `VoiceEvent`s. `src/assessment` handles event reduction,
attempt allocation, deduplication and cancellable scheduling. Shared types and
pure eligibility policies live only in `src/contracts`. No feature imports another
feature's reducer. Dependencies point toward contracts, never from contracts into
React, provider implementations or feature code.

Public exports are at `src/contracts/index.ts`; ownership and entry points are
in [parallel-handoff.md](parallel-handoff.md). Contracts are version 1 in this
foundation; incompatible changes require the integration owner's coordination.

## Independent evidence and ordering

An image verb has ten obligations: three spelling fields, oral Spanish meaning,
three pronunciations, and three own sentences. A visible-base verb has nine;
the displayed base has no spelling gate but retains all oral obligations.
Sentence mode has translation, tense, structure and meaning/fit obligations.

Each `AttemptRef` identifies session, exercise, exercise generation, obligation,
attempt ID and per-obligation revision. On an edited spelling input, invalidate
that field immediately, but render red/green only after debounce or explicit
processing. Allocate a revision before dispatching assessment. A simultaneous
utterance may reference several obligations and return one `AssessmentBatch`.
Apply each result independently only if its full reference matches the current
attempt; an unrelated newer spelling input must not discard valid oral evidence.
Deduplicate event IDs for the active exercise. Clear old deduplication state on
exercise replacement. Never remap an old provider response onto the new context.

The current attempt replaces the previous one for that obligation; old accepted
evidence cannot survive a correction to its underlying input. Retain unrelated
accepted evidence. Statuses are not-attempted, processing, uncertain, incorrect
and accepted. Transport failures are connection errors, never incorrect answers.
Malformed or uncorrelated provider events cannot create accepted evidence.

Spelling must originate from typed input. Meaning, pronunciation, own sentences
and sentence-mode work require audio, except explicitly labelled mock fixtures.
Transcripts can support semantic assessment but never certify pronunciation.
Ambiguous/absent audio returns uncertain and asks for clarification, with no
penalty. Do not reject contractions, connected speech, valid agreement ("he buys")
or alternate translations solely for differing text. Participle sentences require
a complete grammatical construction. These are model rubric requirements, not
substring rules. Local spelling checks are deterministic and separately owned.

## Completion and interruption

Both verb modes require every applicable obligation accepted for this generation.
Wait at least 1,800 ms after the latest activity with no learner speech, assistant
speech, focused typing, question, pending processing, disconnection or stop/pause
intent. This is a tunable local default, not an approved exact product timing.
The reducer owns an `activityRevision`; every activity invalidates the scheduled
`AdvanceTicket`. Recheck all conditions inside the timer callback. A question
remains pending until resolved even if its speech has ended. Provider speech-end
does not mean the assistant has finished answering. Helper open/close changes
presentation only; it must never recreate session/exercise IDs or evidence.

Sentence mode first accepts an oral translation, then identifies its valid tense
and explains structure and meaning/fit. Explanation attempts are allocated only
after translation acceptance; earlier speculative results cannot pass later stages.
Editing/replacing an accepted translation invalidates dependent explanation.
Completion enables explicit Continue. Do not reuse the automatic verb timer.
Grammar and vocabulary levels are independent 1-3 settings, not CEFR labels.

## Coaching and spoilers

`HintRequest` is tied to exercise, stage, target, request ID and hint revision.
Allocate a newer revision on changed attempts/stages and discard stale responses.
Live hints are generated by the conversational model, progressively at levels
1-3. Before translation acceptance, reveal neither target translation nor tense.
Verb hints guide without supplying or autofilling the requested form. Curriculum
hint seeds are rubric context; deterministic mock hints are labelled fixtures.
Provider instructions and output validation must enforce stage restrictions;
keyword filtering alone cannot prove semantic no-spoiler behavior. If a hint
fails validation, suppress it and retain progress. Do not speak unvalidated hint
content; use validated text before asking the voice provider to speak it.

Optional under-field help is off by default and appears only after a processed
genuine spelling error, for 6 seconds. It reveals IPA and Spanish sound guidance
on request, never autofills. Uncertainty cannot trigger it. In-call tables have
a separate visibility state and must preserve current stage and evidence.

## Voice, cost and privacy boundary

The consulted [official WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime)
describes a server SDP exchange at `/v1/realtime/calls`. Use a same-origin broker;
permanent API keys stay server-side. The browser carries audio through WebRTC
and receives structured data-channel events. Model selection remains configurable.
This documentation establishes a transport candidate, not linguistic quality.

Default mock mode makes no microphone or external requests. Real mode needs an
explicit local opt-in, configured server credentials and separate authorization
for paid validation. Reject cross-origin broker requests, cap body size, avoid
logging prompts/audio/provider bodies, close all tracks/channels on stop or error,
and impose a 10-minute local session cap with one active session and no automatic
reconnect spending. A time cap is not a monetary cap. Budget, rates, retention,
pronunciation calibration, latency and physical mobile behavior remain unverified.
Provider-side usage limits and retention settings need explicit later scope.

Store only help/difficulty/preferred-mode settings under a versioned browser key.
Never persist tokens, audio, transcripts, scores or provider mode. Reset clears
only the owned settings key. No anonymous ID, cookies or analytics are created.
There is no claim that provider audio has zero retention; review the account's
actual data policy before paid use. No public broker/auth design is selected.

## Verification scope

Foundation checks cover independent obligation policies, stale attempt identity,
source separation, noninterruptive completion, settings validation and routing.
Provider implementation, curriculum, reducers and feature behavior belong to
their independent workers. Browser smoke validates actual rendering at mobile
sizes but does not validate a microphone, acoustic pronunciation or physical iOS.
No real provider calls, deployment or user acceptance are implied.

Requested architecture routing is Astra/ultra. This executor's actual model and
speed configuration are not exposed in its session metadata; no verified routing
receipt or silent substitution claim is made. No additional agents were spawned.
