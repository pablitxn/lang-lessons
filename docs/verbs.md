# EN-WP-05 irregular-verb lessons

Checkpoint: 2026-10-16. Branch: `feat/en-wp-05-verb-lessons`.
Dispatch base: `b03bf1d2517eb74846115bd59d25331174bfd3ef`.

This module implements image/three-input and visible-base/two-input lessons
against the shared assessment controller, curriculum and mobile UI. It does
not add a reducer, provider, connection owner, spelling algorithm or route.

## Current application flow, 2026-10-17

EN-WP-08 expands original-sentence coaching and the reference table to eight
present/past constructions. Exact25, the two/three spelling slots and seven oral
obligations remain. Use finite past for the past family, complete lexical
participle constructions for participle evidence and valid progressive derivatives
for base-family practice. Generic structures reveal no verb answers; supplied
examples stay provider context. A selected sentence tense filters sentence mode
only and never replaces verb progress or adds an incompatible extra completion gate.

The current working tree uses the root's automatic voice call when a lesson is
selected. It shows the image or supplied base, required spelling fields and
requested hints. **Your progress** and **Reference table** open native dialogs
with root mute/pause controls. Helper holds preserve the current exercise and
block automatic advancement while open.

Previous/next controls manually navigate without completing an exercise.
Picture controls sit inside the photo and appear when their own hit region is
hovered, when keyboard-focused, or after a touch reveals the photo controls.
The expand control follows the same visibility behavior. Keyboard navigation
retains focus on the corresponding arrow, or Next at the beginning of history.

Both verb modes use shuffled rounds of all 25 verbs, with no repetition within
a round or immediately across its boundary. Picture mode also keeps a shuffled
photo bag per verb: each of that verb's photos appears before its bag is refilled.
With the current three photos per verb, three rounds cover all 75 photographs.
Photo bags may have different sizes without changing the verb rotation.
Navigation retains each item's exact photograph, partial drafts and checked
spelling. Reaching the end appends a new round; revisiting history consumes no
new random choices or photos. A new lesson session starts a new deck and blank
drafts. This history is in memory, not persisted across reloads.

Navigation works offline and while paused, preserves call state, interrupts old
coach audio and clears transient speech, hints and queued requests. Every visit
receives fresh attempt identities; saved spelling is reassessed locally and old
oral/provider evidence cannot satisfy the new visit. Completed entries remain
editable for review without automatic skipping or duplicate completion reports.

The production feature has no simulated-evidence notice, coach response panel,
typed question form or independent call controls. Questions are spoken. Unclear
oral input that is withheld from model assessment displays a concise repeat
request, including an unclear queued turn after oral completion. Fresh clear
speech, question resolution or a new exercise clears that notice. Internal
fixtures retain explicit simulation controls and source markers. The optional
written sentence practice described below is separate from spoken questions and
oral assessment.

The 2026-10-16 integration request and verification receipt below describe the
original checkpoint; they do not describe the current production interface.

## Entry point and ownership

Import `VerbLesson` from `src/features/verbs/index.ts`.
The required props are `LessonModuleProps & { mode: VerbMode }`.
Two optional feature-local integration props are supported:

- `sessionControls?: ReactNode`: root microphone mute and call pause/resume
  controls, rendered inside progress/reference dialogs only.
- `claimUtterance?: (utteranceId: string) => void`: root reservation of a live
  transcript while its assessment is queued. Required before live oral assessment
  is enabled; see the concrete root integration request below.

Settings changes and callback identity changes preserve the mounted controller.
A mode, adapter or session-ID replacement disposes the old feature. The feature
never calls `voice.connect` or `voice.disconnect`. Root connection, pause/resume, media teardown and route composition remain with
EN-WP-01/04. Provider selection is not part of the learner interface.

New authored paths are exclusively `src/features/verbs/**`, this document and
`tests/verbs*.test.ts`. Dependencies were incorporated through additive merges:
UI PR3 at `462fbda76c9931c7ef6736228e7280f1a7a628d0`, content PR1 at
`5e0fec5e3f3c20c4327d59c77d72c75d07250dde`, and refreshed integration at
`34a5185a035e4c9df0b35af6b28356fbee6019b3`. The dependency-only candidate is
`42f80369da452b2cbdabaa86690431207cfa2134`. Producer-owned files were not
independently edited. UI PR3 and all original producer revisions remain intact.

## Learning behavior

| Mode | Written requirements | Oral requirements |
| --- | --- | --- |
| Image | Base, past, past participle | Spanish meaning, all three pronunciations, three original sentences |
| Visible base | Past and past participle; supplied base is read-only | The same seven oral requirements |

Images are reviewed real photographs stored locally with provenance in the
content ledger. They cue an action, not a tense. Each has a short English poetic
tooltip; its factual Spanish alternative remains available to assistive
technology. The complete photograph keeps its natural aspect ratio, with a
full-screen viewer. Photo and answer controls preserve the vertical reading
order. No answer is prefilled on a new item.

The shared controller is created once per mounted feature. Its `onContextChange`
updates the same voice adapter; `onCancelHint` cancels obsolete hint playback.
Its stable snapshot drives `useSyncExternalStore`, field feedback, progress,
uncertainty, processing, system errors and pending advancement. A single batch
can satisfy several obligations in any order. Valid accepted oral evidence
survives an unrelated spelling edit. Meaning, pronunciation and complete original
sentences remain separate signals; transcripts are never acoustic proof.

Every edited spelling field immediately calls `controller.invalidate` for that
field only. UI finalization waits for the shared debounce/IME policy, then
`beginAttempt` allocates current refs and `voice.submit` performs the shared
local spelling assessment. There is no manual Check button: debounce, Enter and
blur finalize input automatically. Feature draft-revision deduplication prevents the
processing-ref change from dispatching the same written draft twice. Current
results reach the existing `SpellingField` without remapping refs. A full correct
form is green; only wrong letters/gap markers are red after processing. Optional
sound help is genuine-error-only, beside the correction in a tooltip, and never
autofills. Refocusing the input reoffers an expired sound-help icon. There is no
separate hint button in the verb exercise.
An uncertain check has an explicit retry action; reconnection never silently
resubmits an old draft.

Final learner utterances retain their actual `utteranceId`. The feature requests
all open oral obligations together, preserving the raw natural wording,
contractions and connected speech for assessment. A later utterance waits while
a prior oral assessment is processing so it cannot supersede still-valid refs.
A scoped queue hold blocks advancement. Accepted results are retained, and the
next queued utterance attempts only requirements still open. Each assessment
request must eventually receive terminal results for its requested refs, or a
transport error; a missing provider result deliberately remains pending rather
than becoming success or a learner error. Provider completeness/latency remains
an integration/evaluation responsibility.

Uncertain recognition creates uncertainty, requests clarification and does not
submit invented valid audio. A prior-exercise response, old draft or superseded
submission failure cannot overwrite a current accepted attempt. Stop/pause,
disconnection and questions clear queued unsubmitted work. No paid automatic
replay occurs after reconnect.

Questions use `voice.askQuestion` where supported, with a fallback for older
fixture adapters. They have no assessment refs. The feature establishes
`questionPending` before releasing the composer draft hold, retains the visible
question, and preserves progress. A late hint cannot hide the newer answer.
Before all requirements are accepted, hints advance through levels 1-3 for a
current correlated target. The reference table contains general learning roles,
not the target verb's spelling or prewritten example sentences.

The controller alone owns the 1,800ms quiet timer. Every applicable requirement
must be accepted, with no speech, assistant output, processing, question, focused
input, composition, active question draft, helper hold, pause/stop intent or
connection problem. Stay here pauses rather than immediately advancing. After
a genuine safe pause, `onComplete(exerciseId)` fires once. Both verb modes keep
the current verb available for dictionary review until the learner selects Next.

The local dictionary appears after all editable spelling fields are accepted:
three fields in Pictures, two in the supplied-base Verb exercise. English and
French reuse their reviewed, attributed snapshots without a runtime dictionary
request. Dictionary visibility does not create oral evidence or report full
completion. Editing a written form hides the card immediately; restored accepted
writing can reveal it again. Next verifies the current exercise identity and
written results, so a stale or repeated click cannot skip the following verb.

`VerbCompletionCard` composes the shared dictionary, optional writing practice
and explicit Next action for both verb modes. `VerbDictionaryEntry` presents the
lemma, supplied pronunciation, Spanish curriculum meaning, unchanged sourced
definitions and examples; `VerbFormSummary` displays the accepted forms.
Source credits and licensing details remain in Preferences > Credits. These
components reuse the same English and French curriculum contracts rather than fetching or
generating dictionary content.

After the spelling gate, learners can optionally open `VerbSentencePractice`
and write a sentence using the current verb, in any tense or context. Only an
explicit submit sends it to `/api/realtime/verb-writing`; opening, typing and
reconnecting make no correction request, and failures have no automatic retry.
The tutor returns brief Spanish feedback and, when needed, a corrected sentence
in the lesson language. The learner's original draft stays editable, and a
provider failure remains a retryable service error rather than a wrong answer.

`VerbSentencePractice` is a contextual wrapper around the same `WrittenPractice`
and `WrittenCoachingResult` used by Sentence. Both verb modes inherit the compact
**Escribe otros ejemplos** disclosure, underline field, **Corregir** button and
800/900/950 character-counter thresholds. The current verb is a short reference
above the draft. No duplicate composer, optional badge, guidance paragraph or
tutor/verdict heading remains. Shared prompts cover grammar, spelling, accents,
capitalization and punctuation; the current verb requirement remains specific
to verb practice. Corrections show case-sensitive word edits and plain Spanish
feedback without changing the learner's intended meaning.
For correct examples, the same prompt requests one or two brief grammatical
observations grounded in the learner's actual wording, rather than generic praise.

The broker reuses the existing server-only OpenAI key. Account authorization
checks the owned, open verb session and current practice identity before the
request; the server resolves the verb and language from curriculum. The client
sends only the session, exercise and generation identity, verb ID and draft.
Editing, closing practice or replacing the exercise cancels the request and
invalidates late results. This optional coaching does not submit assessment
evidence, satisfy oral obligations or write learner progress, and it never gates
the explicit Next action.

## 2026-10-16 root integration request: live transcript reservation

Historical request: the integrated root now supplies `claimUtterance`. The
following request and dependency description are preserved as checkpoint
provenance, not outstanding application work.

Integration `34a5185` forwards a final live transcript as conversation if the
feature has not submitted it by the next microtask. That behavior preserves
questions after the checklist. It must distinguish a transcript reserved by this
feature's queue from an unclaimed conversational utterance. Otherwise a queued
utterance could create a conversation request and later a second assessment
request for the same audio.

Concrete EN-WP-01-owned change, not applied to shared files by this worker:

1. Expose `claimUtterance(id)` from `createSessionRuntime`. It adds the ID to the
   same `submittedUtterances` set already checked by the conversation fallback,
   using the existing bounded retention policy. It makes no provider call.
2. Pass that stable callback into `VerbLesson.claimUtterance` when composing the
   feature. The feature claims only utterances with open oral obligations;
   post-checklist conversational questions remain unclaimed for the root.
3. Pass the actual root controls into `sessionControls` for the modal sheet.

This was a dependency at the feature checkpoint above. Integration PR #5 supplied
`claimUtterance` and root controls; it is resolved in published main
`b74af6712e4907637cdd844418c77b985ca44572`. PR #8 then removed mock controls
from the product and retained deterministic adapters in internal fixtures.
Typed spelling works before voice connection and during pause; oral evidence
still requires voice. Historical verification below retains its original scope.
See the [published reconciliation](evidence/published-reconciliation-2026-10-17.md)
for current checks and remaining real-audio acceptance limits.

## 2026-10-16 verification receipt

The draft PR identifies the immutable feature head and current target base.
Use that SHA when reading this receipt. New code ownership remains the paths
listed above; dependency merges retain their original authors and commits.
The existing Git identity configuration and credentials were preserved; normal
Git commits use the approved process-scoped author/committer and Atlas guard.

Commands:

```sh
npm ci --cache /tmp/lang-lessons-npm-cache
npm run check
VERBS_BROWSER=1 node --import tsx --test tests/verbs-browser.test.ts
git diff --check
```

Feature unit tests cover both gates, single-turn multiple obligations,
out-of-order processing, writing deduplication, independent oral preservation,
queued utterances, uncertainty versus error, invalid audio/mock sources,
questions/speech/focus/helper/pause holds, superseded transport failures,
progressive/canceled hints and teardown. A test also uses the current production
mock adapter with the current root runtime, including explicit Start, local
spelling, mock oral evidence, typed questions, resume and quiet advancement.
No feature-owned connection is created.

The optional browser test uses the environment's supplied Playwright and
Chromium, writable temporary profiles, a loopback Vite process on strict port
5193, and no TLS bypass. Both modes run at 320x640, 390x844, 844x390 and
1024x768, including image loading and 200% text reflow. Checks include processed
spelling, opt-in sound help without autofill, duplicate-finalization suppression,
full oral/written gates, scoped helper holds with root Stop reachable, question
and continued-speech holds, explicit pause, complete quiet interval, one next
exercise, no immediate repeat, cleared new drafts and no page errors/external
requests. Debounce and quiet-period clocks are fake; DOM rendering and browser
interaction are actual Chromium. Local screenshots are
`/tmp/en-wp-05-image.png` and `/tmp/en-wp-05-visible.png`.

The recording adapter under `__fixtures__` is a test double only. Its oral
acceptances are explicitly requested simulated outcomes, not language or
pronunciation judgments. Production mock integration is tested separately.
Physical keyboards, screen readers, actual continuous microphone audio, provider
linguistics, pronunciation calibration and latency remain unverified. The root
production entry remains controlled by the integration owner; this branch does
not register features or claim the root app is fully integrated.

## Coordinator-only Atlas intake

Link EN-WP-05's draft result, immutable tested revision and this gate description
under the existing EN-D02/03/04/05/06/07/08/12/14 IDs. Preserve exact25 and the
natural-language rubric ownership, including subject agreement and complete
participle constructions. Record mock versus real evidence and the live
reservation dependency. Shared Atlas canonical documents were not edited.
No paid calls, main merge, deployment or security-setting changes occurred.
