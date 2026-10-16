# EN-WP-02 mobile UI

Checkpoint: 2026-10-16. Implemented as a bounded component module against
foundation `fd1678b93b3a55166fd8492bea307e6191e9a7dd` on
`feat/en-wp-02-mobile-ui`. The integration owner composes these components into
EN-WP-05/06. This branch does not modify application routing or make the
foundation preview claim to run a lesson.

The implementation follows the supplied EN-WP-02 design artifact, SHA-256
`8b67a5acf68c6721c0617c35c41876fe39df2b8d168cf6ccd01bdd34493d373f`, and
[the foundation architecture](architecture.md). The original design artifacts
remain preserved outside this repository in the delegated specification task.
Repository contracts and `TIMING` are authoritative for implementation.

## Ownership and import surface

Import components from `src/ui/mobile/index.ts`; this entry imports scoped CSS.
No new dependency, provider, shared schema or domain controller is introduced.

| Export | Integration contract |
| --- | --- |
| `PracticeLayout` | Children are the exercise; optional `progress`, `coach`, `controls` slots. `mock` displays an explicit simulated-evidence notice. |
| `ExerciseCue` | Optional image with alt/attribution, supplied `base`, or `spanish` prompt. Broken images preserve attempts and offer caller-supplied alternate cue action. |
| `SpellingField` | Controlled native input; `label`, `value`, current `attempt`, optional `result`/`processing`, help preferences, phonetic guidance, `onChange`, `onFinalize`, activity and hold callbacks. |
| `ObligationProgress` | `mode`, current `identity`, and authoritative `evidence`. Only applicable current-exercise requirements are displayed; no supplied-base spelling gate. |
| `ReferenceTable` | `title`, `caption`, `columns`, `rows`, required `onHoldChange(id, held)`, and optional live session `controls` inside the modal. |
| `VoiceControls` | Actual `state`, `muted`, speaker flags, optional error/mock label and `onStart`, `onMute`, `onStop` intent callbacks. Never starts a microphone on mount. |
| `QuestionComposer` | `onSubmit(question)` and `onDraftActiveChange(active)`. Questions preserve the exercise; composing blocks submit. |
| `CoachMessage` | Supplied text with optional pending/uncertain/mock states. No local hint generation or evaluation. |
| `CompletionNotice` | Controller-owned `pending` and `onStay`; quiet completion text, no local advancement timer. |
| `SentencePrompt` | Authoritative `stage`, `onHint` and `onNext`. Next is available only at `complete`. |

`SpellingFieldProps`, `ReferenceTableProps` and `VoiceControlsProps` are exported
for adapters. The other component props are explicit in their exports and can
be derived using React's `ComponentProps`. UI-only interfaces live in this module;
shared domain contracts remain exclusively with EN-WP-01.

## Controller responsibilities

EN-WP-04 owns assessment/reducer APIs, source validation, revisions, voice,
transport and safe advancement. Feature modules supply callbacks rather than
having presentation import an unfinished controller API. The component API
therefore remains usable with the controller's eventual exported API.

For every spelling draft edit, the feature must allocate/invalidate that
obligation's current attempt and update `value` and `attempt` together. The
new draft retains unrelated accepted oral evidence. `onFinalize(value)` requests
assessment for the current attempt; it must not accept an old attempt in order
to simplify UI wiring. The field deduplicates idle/blur/Enter/Check dispatches
for a draft. A new retry must receive a new attempt revision from the controller.

Spelling results require a matching full `AttemptRef` and
`spelling.submittedText === value`; uncertain results can omit spelling details
and remain visibly uncertain. The UI never computes edit distance, accepted
forms or correct letters. The assessment worker supplies `Intl.Segmenter`
grapheme indices and omission-gap positions. Omissions show a marker without
inserting the expected character. An old generation/attempt/revision or changed
text cannot render stale red/green feedback or enable sound help.

Connect `onActivity({ inputFocused, compositionActive })` to the controller's
interaction state. Use current exercise scoping when several fields share a
controller. Input-group focus includes the Check/help controls, so moving
between them cannot briefly release the typing hold. Update activity on every
`onChange` as well, because typing renews the natural-pause clock.

Both reference tables and open sound guides call `onHoldChange(id, held)` with
stable scoped IDs, releasing their own hold on close/unmount. The caller must
renew activity before releasing a hold and recheck all completion conditions.
Opening a helper must not replace a feature/session, reset stage, or remount
fields. Put actual Stop/mic controls into `ReferenceTable.controls` so they
remain reachable while the rest of the page is inert behind the native dialog.

The question callback must establish `questionPending` synchronously before the
composer releases its draft hold. A typed question never supplies evidence for
an oral translation or pronunciation. Voice success, muting and errors are only
shown after the voice controller supplies the corresponding state. Keyboard
focus never implicitly disconnects or mutes the call.

## Visual and educational behavior

A calm single-column practice space uses warm neutral surfaces, restrained
borders, dark ink and teal actions. The layout becomes two columns only at
960px where enough space remains; it reflows into one column at mobile widths.
The dock stays in document flow, with safe-area padding, to avoid covering a
focused input when a software keyboard occupies the viewport. No per-key color
animation or microphone animation is used. The framework and root theme remain
unchanged; all CSS selectors belong to `ll-*` classes.

The native input keeps caret, selection, undo, autocomplete controls and screen
reader editing. After the shared 700ms idle interval, changed nonempty blur,
Enter or Check, the feature receives one finalization intent. IME composition
must end first. Empty fields remain unattempted. The field shows a quiet Checking
status until the matching result arrives.

Processed spelling appears immediately below the input inside its labeled field
group, preserving native editing. A complete correct FORM is green (`#17643C`)
with a check and text. In an incorrect form only erroneous learner LETTERS or gap
markers are red (`#B42318`) and underlined; other letters stay neutral. Editing
returns the field to neutral until the new current result is processed. Nothing
autofills, normalizes or overwrites the learner's draft.

Sound help is off by default through the shared preferences. It is eligible
only after a current processed genuine spelling error and explicit help opt-in.
Its offer lasts the shared 8-second foreground interval. The clock pauses while
the offer is focused/hovered, the guide is open or the document is hidden.
Typing-field focus does not turn an 8-second offer into an indefinite offer.
Untimed help is the separate accessibility preference. Closing a guide dismisses
its offer even with untimed help enabled; explicit Check can reoffer an expired
error's help without duplicate assessment. Turning help off or changing the
current result removes the guide. Activation reveals phonetics and a Spanish
textual sound guide below the relevant input. Uncertainty and service failures
never qualify, and no prerecorded audio collection is required.

Reference tables are separate from conditional spelling help. A persistent
button opens a native modal bottom sheet on small screens and centered sheet on
larger screens, with caption, column/row headers, a labeled keyboard-scrollable
table region and visible Close. This centered desktop dialog is a deliberate
implementation simplification of the original inline-panel proposal: native
focus containment and background inertness work consistently at every width.
The presentation hold prevents changing the exercise behind the sheet.

Image mode is composed with an action image and three spelling fields; the image
never implies a tense. Visible-base mode supplies a read-only base and two
spelling fields, while retaining all three pronunciation and sentence obligations.
Progress has 10 and 9 independent requirements respectively, grouped as meaning,
pronunciation, original sentences and spelling. Only accepted applicable current
records count; processing, uncertainty and errors retain distinct text/icons.
A fully accepted checklist is distinct from safe advancement.

Sentence mode starts with the Spanish prompt and oral translation. Only after
acceptance does the stage prompt ask for tense, structure, meaning and fit. One
spoken answer may supply several obligations; natural contractions and valid
alternatives are preserved by the controller's rubric. Sentence Next remains
manual after explanation. Generic reference content is caller-supplied: the
curriculum/feature owner must not reveal the target tense or answer before
translation acceptance. Grammar and vocabulary settings remain independent in
the foundation, not duplicated in this module.

## Accessibility

Controls are at least 48 CSS pixels high and wide with 8px action gaps. Input
text is 16px or larger. All outcomes have text and icons beyond red/green, and
incorrect letters are also underlined. Status announcements are polite and
field-level; duplicate decorative spelling is hidden from screen readers.
Labels, invalid state and under-field guides are associated through stable IDs.
Spanish prompts/guides carry `lang="es"`; phonetic content stays curated.

The modal uses native focus containment. Escape/Close restores the opener;
closing sound help restores its field before removing its Close button. A
focused offer cannot expire and strand focus. Tables scroll inside their own
region. No new exercise automatically summons a mobile keyboard. Reduced-motion
preferences remove any inherited module motion. Actual screen-reader and
physical mobile keyboard behavior still require device validation.

## 2026-10-16 task receipt

Base: `fd1678b93b3a55166fd8492bea307e6191e9a7dd`.
Branch: `feat/en-wp-02-mobile-ui`. The draft PR validation identifies the immutable
tested head containing this receipt; no merge or deployment is performed.

Owned additions: `src/ui/mobile/**`, `docs/ux.md`, `tests/ux.test.ts` and
`tests/ux-browser.test.ts`. Package manifests, lockfile, shared types, routing,
global CSS, root application composition and canonical Atlas docs are unchanged.
The inherited Git identity configuration and credentials remain unchanged;
commit-scoped identity values follow the repository's approved author/committer
standard, checked with Atlas's guard.

Validation commands:

```sh
npm ci --cache /tmp/lang-lessons-npm-cache
npm run check
UX_BROWSER=1 node --import tsx --test tests/ux-browser.test.ts
git diff --check
```

The optional browser test uses the selected environment's current Playwright
resolution, `/usr/bin/chromium` (or explicit `CHROMIUM_EXECUTABLE_PATH`) and the
foundation helper's writable temporary profile locations. It starts/stops its
own loopback Vite process on strict port 5192. It never bypasses TLS, installs a
browser, requests a microphone or contacts a provider. Normal `npm run check`
skips the optional browser fixture unless `UX_BROWSER=1` is supplied.

Actual Chromium fixture checks: 320x640, 390x844, 844x390 and 1024x768; processed
letter/form colors, debounce/deduplication, IME hold, stale-result suppression,
help opt-in/no autofill, focus-held expiry and untimed dismissal, scoped helper
holds/focus restoration, preserved draft/progress/generation, question draft,
translation/explanation/Next sequence, normal and 200% text reflow, no page errors
and no external requests. Help expiry uses a fake browser clock. A 390px
screenshot is captured to `/tmp/en-wp-02-mobile-ui.png` for local inspection.
These are actual rendered components with deliberately simulated controller
snapshots; no real pronunciation, continuous audio or linguistic validation is
claimed. The root production build covers the unchanged foundation composition;
the direct component fixture is exercised through Vite in the browser test.

Remaining integration work: EN-WP-05/06 compose these exports and wire
EN-WP-04's controller, then EN-WP-07 validates the combined revision. Software
keyboard, screen-reader, microphone, barge-in and real-provider behavior remain
unverified. No paid calls, shared-controller edits, merge or deployment occurred.

## Atlas intake for the coordinator

EN-WP-02's original specification is now followed by a bounded implementation
and draft PR. Preserve EN-D01-D14 and the architecture's tunable local timing
defaults; do not recast them as new product approvals. Link this spec and the
immutable PR receipt after final integration. EN-Q07 remains manual sentence
advancement pending a separate product decision. No canonical Atlas file was
edited by this worker, and this UI fixture is not combined application evidence.
