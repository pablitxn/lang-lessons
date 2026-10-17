# EN-WP-06 sentence practice

Implemented on `feat/en-wp-06-sentences` from integration base
`b03bf1d2517eb74846115bd59d25331174bfd3ef`. Dependencies are consumed through
additive merges: UI PR #3 at `462fbda76c9931c7ef6736228e7280f1a7a628d0` and
content PR #1 at `5e0fec5e3f3c20c4327d59c77d72c75d07250dde`. Their owning
branches and published receipts remain unchanged. This task owns only
`src/features/sentences/**`, this file and `tests/sentences*.test.ts`.

## Current application flow, 2026-10-17

The root starts the voice call after the selected lesson has established an
exercise context; an unsupported difficulty pair waits for corrected settings.
The lesson presents its Spanish prompt, current stage, requested hint and
concise uncertainty/error notices. **Your progress** and **Reference table**
open native dialogs that preserve stage/evidence and hold advancement. Root
mute/pause controls remain available within them.

The arrow below the prompt, labelled **Next sentence** for assistive technology,
skips an unfinished exercise without
marking it complete, including offline or paused practice. It preserves call
state and discards old hints, evidence and pending responses. Selection honors
both difficulty settings and avoids an immediate repeat when alternatives
exist. A completed exercise keeps its separate **Next exercise** action.

The production interface contains no mock textarea or simulation notice, typed
question composer, coach response panel or independent call controls. Questions
are spoken during the call. Fixtures deliver transcripts and verdicts through
injected adapters; the obsolete feature `submitMockResponse` API was removed.
The dated receipts below preserve the original implementation evidence.

## Integration entry point

Import `SentenceLesson` from `src/features/sentences/index.ts`. It accepts the
shared `LessonModuleProps` (`settings`, `voice`, `sessionId`, `onComplete`) plus
optional feature-local composition props:

| Prop | Purpose |
| --- | --- |
| `connectionState` | Seed/update the current root-owned connection state, especially when mounting after connection |
| `microphoneMuted` | Seed the microphone indicator until adapter events arrive |
| `sessionControls` | Root mute/pause controls rendered inside progress/reference dialogs |

The feature never calls `voice.connect` or `voice.disconnect`. The root owns
automatic connection, retry, mute and pause/resume. The integration supplies
current connection state and dialog controls while keeping one continuous
adapter for the lesson.

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
be displayed; all other generated text is suppressed and replaced by a reviewed
authored fallback. Its origin remains explicit in the session snapshot; internal
validation details are not displayed in the lesson. This is intentionally stricter than keyword filters
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

Spoken questions establish `questionPending` through adapter intent events before
question-directed final transcripts, then release it on resolution. The session's
question methods remain available to internal tests and orchestration; the
production lesson has no typed form or manual question-resolution button.
Neither conversational questions nor text establish translation/pronunciation
evidence. In-call progress/reference dialogs use scoped presentation holds and
keep the same exercise/stage/evidence. Ongoing oral work can still be assessed
while a dialog is open; the hold blocks changing prompts rather than muting the
call.

Simulation exists only in internal fixtures and transport tests, with explicit
source provenance. Fixtures send transcript and assessment events through an
injected adapter, never a production response textarea. No learner responses or
scores are persisted.

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

## Integration refresh amendment, 2026-10-16

The integration base advanced during draft PR #4 creation to
`34a5185a035e4c9df0b35af6b28356fbee6019b3`. Its voice/runtime/controller changes
were read and additively merged at `fe33a32`; no published history was rewritten.
The original feature commit `8b2a6d4bd8bc3a31e89daa24cc329b4205b7e550` and
the preceding validation receipt remain available. This section supersedes the
earlier combined-check counts for the refreshed candidate.

The feature now supplies `onCancelHint` and cancels pending hints on disposal.
It also queues cancellation when a generated hint is withheld by its stricter
display envelope; actual audible adherence still requires provider evaluation.
Questions use `voice.askQuestion` when provided, and mock textarea submissions
register a known fixture with the actual mock adapter rather than submitting
an unknown audio reference. Provider-pending and root presentation-hold events
continue through the shared controller unchanged. Root connection/state replay
is exercised with the actual `createSessionRuntime` and `createMockVoiceAdapter`.

Refreshed results: 17 focused sentence tests pass; the combined check passes 91
Node tests (two optional browser tests skipped), 21 Python content tests, strict
TypeScript and the Vite build. The opted-in sentence browser check passes again
at all four documented viewport sizes, with no page errors/external requests.
These add actual root/mock orchestration evidence, not real speech, model or
provider evidence. The final feature commit/PR metadata identifies this refreshed
candidate. Owned paths remain unchanged; no provider/controller/root/configuration
files were authored by EN-WP-06.
