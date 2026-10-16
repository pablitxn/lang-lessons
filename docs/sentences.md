# EN-WP-06 sentence practice

Implemented on `feat/en-wp-06-sentences` from integration base
`b03bf1d2517eb74846115bd59d25331174bfd3ef`. Dependencies are consumed through
additive merges: UI PR #3 at `462fbda76c9931c7ef6736228e7280f1a7a628d0` and
content PR #1 at `5e0fec5e3f3c20c4327d59c77d72c75d07250dde`. Their owning
branches and published receipts remain unchanged. This task owns only
`src/features/sentences/**`, this file and `tests/sentences*.test.ts`.

## Integration entry point

Import `SentenceLesson` from `src/features/sentences/index.ts`. It accepts the
shared `LessonModuleProps` (`settings`, `voice`, `sessionId`, `onComplete`) plus
optional feature-local composition props:

| Prop | Purpose |
| --- | --- |
| `connectionState` | Seed/update the current root-owned connection state, especially when mounting after connection |
| `microphoneMuted` | Seed the microphone indicator until adapter events arrive |
| `onStartVoice` | Optional explicit root connection/retry callback; no microphone starts on mount |
| `onStopVoice` | Optional root stop callback; pauses feature work before asking the root to stop transport |

Without start/stop callbacks, the feature directs the learner to root
conversation controls. It can request mute/unmute and pause practice but never
calls `voice.connect` or `voice.disconnect`. Root ownership of the continuous
adapter and its costs/lifetime is preserved. There is no routing, root app,
shared type, configuration, manifest or global-style edit here. The integration
owner must compose the feature into the final application and supply the root's
current connection state and callbacks.

`session.ts` is orchestration around the existing `createAssessmentController`,
not a separate evidence reducer. Each mounted feature creates one controller,
subscribes to adapter events and exposes its stable snapshot to React through
`useSyncExternalStore`. Strict Mode cleanup removes the listener and disposes
the controller before a new one is attached. Unmount never disconnects the
root adapter. `onContextChange` calls `voice.setContext`, including every stage
transition. Current identity, attempt revision, dedupe, source validation,
explanation invalidation and manual completion stay in the shared controller.

## Learning flow

The learner sees the Spanish sentence and its context and speaks an English
translation. Current final transcript events allocate translation-only attempts
and are submitted with their actual utterance ID. Partial, duplicate, stale,
paused, question-directed or already-processing responses cannot silently create
new evidence. No answer is accepted from a local token/tense/suffix comparison.
The adapter's correlated semantic assessment is authoritative; the feature keeps
the curriculum's alternatives available in the private exercise context.

Once translation is accepted, the controller exposes the explanation stage.
One spoken explanation may attempt tense, structure and meaning/fit together.
Each is independently accepted, uncertain or incorrect; retry targets only the
remaining obligations. A translation stays accepted when an explanation is
partial. Both residence constructions and their contractions are forwarded
unchanged; their actual construction, not an exclusive target tense, governs
the explanation. Other grammatical variants require semantic assessment rather
than closed-string rejection. Four present tenses remain the initial curriculum.

All four accepted requirements enable manual Next only when speech, questions,
processing, composition, focused drafts and helper holds permit it. There is no
sentence auto-advance timer or repeated "want another?" interruption. Next
notifies `onComplete` once for the completed exercise, then selects a new prompt
with a fresh identity/generation and no immediate repeat when alternatives exist.
Skip is an explicit prompt change and never calls `onComplete`. Revising an
accepted translation invalidates dependent explanations through the controller.

Grammar and vocabulary settings filter independently and exactly. The current
authored matrix does not fill every combination. Missing combinations produce
an explicit settings message, not an automatic change to either dimension.
Changing preferences mid-exercise preserves the active prompt/stage/evidence
and applies the requested pair at the next prompt. If the completed exercise
has no eligible successor, it waits for a supported selection and another
explicit Next action.

## Hints and disclosure

Each hint calls `beginHint` then `voice.requestHint` with the correlated stage,
target and progressive level 1–3. New attempts/stages invalidate late replies.
The current `HintResult` contract has no semantic safety verdict. Consequently,
pre-translation output uses a conservative exact envelope of reviewed Spanish
or English meaning-focused questions at each level. Matching model output can
be displayed; all other generated text is suppressed and replaced by a clearly
labelled authored fallback. This is intentionally stricter than keyword filters
and blocks direct answers, tense labels, formulas, cloze, fragments and encoded
answers. It does not claim to understand arbitrary paraphrased spoilers.

Corrective assessment feedback, generic coach feedback and error messages also
cannot bypass that pre-acceptance display boundary. The hidden reference-table
DOM contains only meaning-focused guidance before translation acceptance; it
contains tense/structure reference content only afterwards, upon explicit help.
After acceptance, explanation coaching can discuss the learner's construction.
Neither hints nor helper tables fill in responses or satisfy obligations.

Richer free-form generated coaching needs a provider-side semantic-safety
contract/evaluation. The feature makes model hint requests but this task made
no real model call. The adapter must not speak/stream unvalidated hint or
answer-bearing audio before a guard approves it; the feature's text gate does
not certify remote audio safety and the current interface has no approval-to-
speech method. Real audible coaching therefore remains a provider/integration
validation requirement, not a demonstrated capability of this receipt.

## Uncertainty, questions and helpers

Uncertain recognition allocates only eligible unaccepted obligations and marks
them uncertain with a neutral repeat request. Guessed transcript text is not
resubmitted as confident language or scored incorrect. Accepted independent
work survives. The shared source policy prevents typed text from becoming oral
success. Transport errors preserve accepted work, settle pending work to
uncertainty and never expose raw provider error bodies or trigger automatic
resubmission/spending.

Question submission establishes `questionPending` before releasing the draft
hold. It sends a conversation-only typed input with no assessment attempts;
questions never count as translations/explanations. The adapter should emit
question intent before a question-directed final transcript, then a resolution
intent after responding. An explicit "My question is resolved" action also
releases the hold. In-call tables use scoped presentation holds and keep the
same exercise/stage/evidence. Ongoing oral work can still be assessed while a
table is open; the hold blocks changing prompts rather than muting the call.

Mock mode displays a persistent simulated-evidence notice and a mock oral-response
textarea. This is a typed fixture, never microphone evidence. It forwards work
to the injected mock adapter and does not grade it locally. Real mode has no
such input and rejects the mock submission method. IME composition blocks mock
submission; nonempty drafts and focus hold manual advancement. No learner
responses or scores are persisted.

## Validation receipt, 2026-10-16

The draft PR/final response supplies the immutable feature head containing this
receipt. Base and dependency SHAs are pinned above. Executed commands:

```sh
node --import tsx --test tests/sentences.test.ts
npm run check
SENTENCES_BROWSER=1 node --import tsx --test tests/sentences-browser.test.ts
git diff --check
```

Actual results: 16 focused feature tests passed. The combined check passed 60
Node tests (two optional browser tests skipped in that command), 21 Python
content tests, strict TypeScript and Vite production build. The separate opted-in
sentence browser test passed at 320x640, 390x844, 844x390 and 1024x768. It uses
the current supplied Playwright and `/usr/bin/chromium`, writable temporary
profile paths and its own loopback Vite process on strict port 5196; it cleans
up that process and does not bypass TLS or access a microphone/provider.

The browser runs the actual React feature, real shared controller, authored
curriculum and mobile components, with an explicitly simulated transport and
manually delivered verdicts. It verifies stage sequencing, residence variants,
no-spoiler DOM/fallback behavior, uncertain audio, IME, helper/question/speech
holds, manual Next, settings deferral/missing pairs, cleanup and Strict Mode
subscription count. No page errors, external requests or horizontal overflow
occurred. A 390px screenshot was inspected at
`/workspace/scratch/en-wp06-sentence-feature.png`.

The root production build still composes the foundation shell; the feature is
typechecked and exercised through its local browser fixture until the integration
owner registers it. Fake verdicts establish flow, not linguistic correctness.
Real speech, frontier-model assessment/hints, audible guard behavior, physical
mobile/screen-reader behavior and user acceptance remain unverified. There is no
paid call, deployment, main merge, force push or credential/configuration change.

## Atlas intake for the coordinator

Append this implementation/draft receipt to EN-WP-06 through the existing Atlas
intake. Preserve EN-D09–D11/14 and the distinction between model requests,
authored fallbacks, simulated verdicts, actual browser rendering and real voice
evidence. Sentence advancement remains manual pending the separate EN-Q07
decision. Canonical Atlas docs were not edited by this worker. Requested model
routing was Sol 6.1/high/fast; this session does not expose a verifiable actual
model/effort/speed receipt, and no substitution or additional agent is claimed.
