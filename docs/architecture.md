# EN-WP-01 architecture and contract decision

Date: 2026-10-16. Owner: EN-WP-01 foundation/integration executor.
Status: selected reversible implementation defaults under the delegated roadmap
launch. These are implementation decisions, not retroactive product approvals.

## Exercise feedback update (2026-10-24)

Both verb modes show the sourced local dictionary after every editable spelling
field is accepted. The learner advances explicitly with Next so the definition
remains available to read. The existing quiet-period scheduler still reports
full oral completion once; it no longer navigates away from the visible-base
verb. Dictionary visibility and written navigation never satisfy oral obligations.

`VerbCompletionCard` composes `VerbDictionaryEntry`, `VerbFormSummary`, optional
`VerbSentencePractice` and the explicit Next action. The same components serve
both verb modes and languages, preserving the reviewed definitions and examples.
Source and license attribution remain in Preferences > Credits. Dictionary
content remains local.

Optional current-verb writing uses an explicit submit to the same-origin
`/api/realtime/verb-writing` endpoint. Opening or editing the composer never
requests correction, and no automatic retries occur. The account broker requires
an owned, open verb session with the current practice identity; the server
resolves the verb and lesson language from curriculum and uses the existing
server-only OpenAI key. A validated response supplies brief Spanish feedback
and an optional corrected sentence in the target language. Editing, closing or
replacing the exercise aborts pending work and invalidates stale results. This
coaching path writes no assessment evidence or learner progress, satisfies no
oral obligations and adds no completion gate.

Sentence writing uses whole-word highlights and readable missing-text cues.
An information icon inside the Spanish prompt reuses `InfoTooltip`, the same
floating hover/focus/tap component as both verb exercises. It opens above its
trigger without changing cue or input geometry. The existing per-attempt hint request remains
subject to the help preference; generic instructions need no provider request.
After a matched translation and correct tense selection, a brief Spanish
explanation describes that alternative's construction and the authored context.
The explanation separates a tense badge, reference sentence, construction
formula, contextual use and any specific notes. English alternatives retain
their original contextual caveats; French retains its authored explanation.
Editing or switching exercises removes it. Completed oral exercises can show a
clearly labelled reference example, without claiming it matches an unlisted
spoken translation. These presentation changes create no assessment evidence.

## Sentence dictionary and rewriting update (2026-10-25)

### Written translation review amendment

Authored matching remains a fast local acceptance path. Unmatched wording stays
neutral until the existing sentence-hint request returns a structured review.
One validated result controls acceptance, actual issue spans and their individual
Spanish hints. Word order or synonyms alone never generate red reference-distance
marks or guessed missing-text markers. Provider failures and uncertainty stay
neutral. The same request returns the actual tense and brief grammar for accepted
variants; neither is revealed before the learner completes the tense choice.

`parseWrittenTranslationReview` validates the verdict, language-specific tense,
field limits and unique, whole-word, nonoverlapping issue excerpts against the
exact draft. Hint spoiler guards apply to pre-acceptance hints. Request/cache
identity includes session, exercise, generation, sentence, language and draft.
Edits, IME, replacement and unmount remove obsolete feedback and abort requests.

`ReviewedTranslationPractice` renders the actual accepted draft, a transient tense
choice, completion-only grammar and the shared optional writing component. It
does not impersonate an authored alternative or mutate its snapshot/progress
contract. Existing persisted reference comparison remains unchanged (unmatched
text is uncertain); no model review creates durable grades or oral evidence.
Reviewed acceptance and tense selection are transient and rechecked after reload.
The existing help preference controls these model requests; disabled help leaves
unmatched wording neutral and still permits local authored matches.

The written annotation can enable dictionary mode and open a word's entry within
the exercise. `DictionaryEntryCard` is the shared presentation for sentence and
verb dictionaries. Exact, unambiguous curriculum verb-form matches reuse the
reviewed local entry; other words use `/api/realtime/word-dictionary`. The broker
derives language from the authored sentence, validates owned open sentence
access and sends only the selected word to the public Wiktionary endpoint.
Provider markup becomes inert text, never executable content. Internal editorial
references and duplicate excerpts are omitted. Dynamic source/license attribution
and adaptation details appear in Preferences > Credits, with links for entries
consulted in the current page session; French word entries
explicitly retain the source's English definitions. No pronunciation is inferred.
Structurally valid Translingual groups can appear alongside English groups;
the reader selects the requested language instead of rejecting the whole entry.
Dictionary access uses a separate read authorization: another tab's active
practice does not revoke access to public reference content. Paid rewriting
still requires the active practice pointer, and neither path grants new progress
or oral-evidence authority.

The [Wikimedia REST API documentation](https://www.mediawiki.org/wiki/Wikimedia_REST_API)
identifies Wiktionary's structured definition endpoint as experimental. Lookup
failures stay operational errors with manual retry, distinct from missing words.
Bounded cache, request/response size, rate, concurrency and total-duration limits
apply. Editing, disabling dictionary mode or changing the exercise cancels
pending lookups and removes stale results.

After a matched written translation, **Escribe otros ejemplos** accepts further
examples in the lesson language. The accepted sentence is optional inspiration;
the learner can choose another topic or tense without preserving its meaning.
The existing `/api/realtime/sentence-rewrite` URL is retained. The broker resolves
the authoritative language and validates the owned, open, active session.

`SentenceRewritePractice` and `VerbSentencePractice` are thin contextual wrappers
around one `WrittenPractice` composer and one `WrittenCoachingResult`. Both verb
modes and Sentence share the disclosure, underline input, character counter,
submit action, draft lifetime and feedback styles. Verb examples still require
the current verb in a legitimate form. Shared server instructions and schema
request corrections for grammar, spelling, accents, capitalization, punctuation
and word choice while preserving the learner's intended meaning. Sentence
examples are not assessed as translations of the reference.

Validated corrections are compared with the original draft using case-sensitive
word alignment: deleted text is struck through and replacement text underlined,
with concise Spanish explanation and no tutor/status headings. This local
comparison displays supplied corrections; it makes no independent grammar claim.
Both server and client reject a revision that returns the unchanged draft.
`WritingLineField`, `CharacterCount` and `useWrittenCoaching` provide the shared
field and request behavior. The counter is hidden below 800 characters, neutral
from 800, orange from 900 and red from 950, retaining the 1,000-character limit.
Only explicit submission requests coaching; editing, closing or changing identity
invalidates late responses, and failures retain the draft without automatic retries.

These paths do not change assessment or progress, satisfy oral obligations or
add a completion gate. Automated tests use intercepted dictionary/model
transport and make no paid inference calls; public dictionary API readback is
separate validation evidence.

## Product flow update (2026-10-19)

The 2026-10-19 browser review supersedes automatic voice startup: the header has
one phone button that starts the tutor, changes to hang up during a call, and is
disabled while readiness is unknown or unavailable. Readiness checks do not
request media or allocate a call segment. The lifecycle rechecks readiness before
allocation, and the adapter starts its data-channel deadline after SDP negotiation.
Transport tests remain simulated evidence, not real voice validation.

Account preferences now contain profile name/photo editing and sign-out. Profile
changes retain the active account/session/exercise identity. Uploaded photographs
are locally resized and stored as bounded raster data in the account backend.
The backend validates browser timezone request context and records prospective
changes in timezone history; the catalog no longer asks learners to configure it.
The later session-flow review supersedes recovery choices on entry. All three
lesson modes enter directly: the backend atomically selects the saved written
practice and maintains one current-practice pointer per account. Concurrent
entries cannot create duplicate current sessions; switching modes retains the
other mode's drafts and historical progress without showing a list. Text-only
exit saves without closing the canonical record or asking for confirmation.
Current call transport is separate from historical call evidence. Only an
actually connected call asks for exit confirmation; an unresolved live transport
can be checked or ended without presenting written-session recovery controls.
Confirming departure ends that call and saves the same open written practice.
Production transport recovery excludes receipts older than 65 minutes (the
provider's documented 60-minute maximum plus a conservative setup margin),
without inferring whether the historical call connected. Entry reconciles those
expired receipts without sending a provider request.

All three exercise routes use the remaining viewport height for a stable practice
card below the header and lesson navigation. Photographs retain their proportions
and occupy at most 300px or 40% of the card's content height, with a 96px allowance
in very short viewports. Exercise feedback and call controls
scroll inside that card instead of increasing the page height. The card is
keyboard-focusable; text reflow and short viewports retain internal scrolling.
Routine local saves and progress synchronization are silent. Failed persistence
still displays an actionable notice and retry control inside the card; internal
event counts are not shown to learners.

The follow-up preferences review fixes the home tools to the viewport footer and
keeps the modal dimensions stable across sections. The content pane scrolls while
section navigation and sign-out remain in the sidebar. Storage is automatic:
non-sensitive settings have an account-scoped browser cache and an authenticated
PostgreSQL snapshot. Local pending field changes survive reload and merge with the
current server snapshot after revision conflicts. This supersedes the earlier
device-only preferences default below; microphone permission remains browser-owned.

### Earlier product flow (2026-10-17)

The user's browser review supersedes the initial mock-first product defaults:
the root is a lesson catalog, selecting a lesson starts the configured voice
adapter automatically, and test adapters are available only in internal fixtures.
Preferences and lesson progress use native modal dialogs. Theme is a validated,
backward-compatible preference in the existing version-one storage object.
Microphone permission remains browser-owned and is not persisted as a preference.
The initial implementation history below does not authorize live paid validation.

## Authority and inspected state

EN-WP-08 extends the tense contract to eight present/past constructions from app
main `58658440109c7344a40d67e17dad6cb3cae7f720`. The coordinator's subsequent
explicit implementation mandate supersedes EN-D15's historical planned-only
state for this candidate. One integration writer owns the compatible shared-type,
settings, curriculum, provider-guidance and feature changes; no manifest, routing,
obligation or persistence-key migration is required. `PresentTense` remains an
exported subset. Version-one settings gain `sentenceTense`, defaulting to `all`
for older records. It filters the next prompt, not a valid learner translation.
No new application evidence is persisted; changing selection preserves current
identity, accepted work and staged explanation until the next prompt.

The remaining paragraphs describe the original foundation checkpoint.

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
| Routing | Home catalog plus three lesson hash routes; browser history and static hosting need no rewrite rules or router dependency | More nested routes justify a router |
| State | Feature-owned React state; shared pure contract policies; one root voice session | Cross-device synchronization is authorized |
| Persistence | Versioned localStorage for non-sensitive preferences only; memory for lesson evidence | Durable progress requirements and deletion policy are agreed |
| Voice | Provider-neutral adapter; live WebRTC in the application; deterministic adapters only in tests; transport through a same-origin server SDP broker | Comparative real-audio evaluations justify a provider change |
| Provider candidate | OpenAI Realtime, configurable server-side model; no claim of provider quality or account access | Scoped credentials, budget and audio evaluation become available |
| Backend | Minimal Node HTTP broker for local opt-in voice; no database or account system; optional content-free Phoenix/OTLP tracing | Public hosting/authentication are selected |
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

Spelling must originate from typed input. Assessed meaning, pronunciation,
original-sentence obligations and sentence-mode completion require audio, except
explicitly labelled mock fixtures. Optional typed verb sentences receive coaching
through a separate request and cannot satisfy those obligations.
The sentence writing field runs alongside a call or independently while offline.
Its debounced local comparison is separate practice feedback, never oral evidence
or a semantic rejection of wording outside the authored alternatives.
After a written translation matches an authored alternative, the learner can
identify its tense with a local selector. The expected tense comes from that
matched construction, not the sentence filter or another accepted alternative.
Edits reset the selection; neither written step creates oral evidence.
Eligibility helpers reject mock evidence by default; mock sessions must pass an
explicit `allowMock: true` argument and remain visibly labelled as mock evidence.
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
Scoped presentation-hold IDs, active question drafts and IME composition block
advancement. Closing a helper renews activity before re-evaluating the pause.

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

Written sentence hints use a separate same-origin broker request after the local
700 ms typing debounce, only while global help is enabled and the draft differs
from the authored examples. The server resolves curriculum by sentence ID and
asks the model for a brief Spanish hint about this attempt, allowing valid
paraphrases and ignoring capitalization. Hints appear below the answer when the
learner opens the information button or highlighted differences. It requests
neither pronunciation nor an answer reveal. Editing,
exercise replacement and disabling help invalidate the current response and
abort its request. Text feedback cannot advance or overwrite the audio ledger.
Credentials remain server-only; bounded request rate, concurrency and timeout
apply independently of voice availability. Requests are never retried automatically.

Typing finalizes after 700 ms idle, Enter/Check or changed nonempty blur, after
IME composition ends. Deduplicate dispatch for the same draft revision. Feedback
uses `Intl.Segmenter` grapheme indices, including gap positions for omissions;
never insert the expected missing letter. These details align with the supplied
EN-WP-02 specification excerpt (task `01a146b8-b7b9-7053-8b90-c121691830c8`;
coordinator-reported artifact SHA-256
`8b67a5acf68c6721c0617c35c41876fe39df2b8d168cf6ccd01bdd34493d373f`).
The original artifact file was not independently available in this container.

Optional under-field help is off by default and appears only after a processed
genuine spelling error, for 8 seconds of foreground visibility. Untimed help is
an independent accessibility preference. Hold expiration while focused or open;
editing, dismissing or changing exercise closes an open guide. It reveals IPA and Spanish sound guidance
on request, never autofills. Uncertainty cannot trigger it. In-call tables have
a separate visibility state and must preserve current stage and evidence.

## Voice, cost and privacy boundary

The consulted [official WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime)
describes a server SDP exchange at `/v1/realtime/calls`. Use a same-origin broker;
permanent API keys stay server-side. The browser carries audio through WebRTC
and receives structured data-channel events. Model selection remains configurable.
This documentation establishes a transport candidate, not linguistic quality.

The home catalog makes no microphone or external requests. Opening a lesson
starts voice after a same-origin service readiness check; browser permission is
requested if needed. The service needs explicit local opt-in and configured
server credentials. Paid validation retains its separate authorization boundary. Reject cross-origin broker requests, cap body size, avoid
logging prompts/audio/provider bodies, close all tracks/channels on stop or error,
and impose a 10-minute local session cap with one active session and no automatic
reconnect spending. A time cap is not a monetary cap. Budget, rates, retention,
pronunciation calibration, latency and physical mobile behavior remain unverified.
Provider-side usage limits and retention settings need explicit later scope.

Store only theme/help/untimed-help/difficulty/preferred-mode settings under a versioned browser key.
Never persist tokens, audio, transcripts, scores or provider mode. Reset clears
only the owned settings key. The home catalog creates no anonymous ID, cookies or analytics. Opt-in operational
tracing uses transient session IDs as described in [observability](observability.md).
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

## Phoenix observability extension (2026-10-17)

The requested integration adds opt-in server-only OpenTelemetry export and a
content-free browser observer for WebRTC operations. It does not replace voice
contracts or authorize paid validation. See [observability](observability.md) for
configuration, captured metadata, trust labels, failure behavior and evidence
limits. Provider usage reported through the browser is not authoritative billing.
