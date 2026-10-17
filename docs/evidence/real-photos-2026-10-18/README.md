# Real photograph replacement receipt

Task owner/integration writer: current root executor, scoped real-photo task.
Research/selection began 2026-10-17; final local verification: 2026-10-18,
Europe/Istanbul. Base HEAD: `6c1b5eda48994b2d3caef29e6f2efcb99d0fcfd7`.
Working branch: `codex/lesson-prompt-sound-help`; changes remain uncommitted.
This receipt describes the combined local working tree, not a published revision.

## Result and scope

Replaced 25 generated SVG exercise scenes and the picture lesson cover with
30 locally served real photographs from Pexels. Removed the SVG renderer.
Collections support N photos per verb; five verbs initially have two photos.
The selected photograph, Spanish alt/context and attribution stay together for
an exercise. Abstract/directional context is visible. Source/license credits
are available beside the photo, and reading credits holds automatic advancement.

Policy and source comparison: [ASSETS.md](../../../content/en-wp-03/ASSETS.md).
Item provenance: [ledger](../../../content/en-wp-03/asset-ledger.json).
Review artifacts: [30-photo contact sheet](contact-sheet.jpg),
[actual mobile picture exercise](picture-mobile.png).

The photo writer owns content/assets, their integrity/browser tests, the verb
presentation additions and image-policy documentation for this task. Shared
contracts, manifests, lockfile, routing and global styles were not changed by
this task. The only photo edit in the concurrently modified App.tsx is its
lesson-cover image reference. Concurrent preferences, sentence-writing,
settings, spelling and shared UI work was preserved and is outside this receipt.

## Verification

- `npm ci --no-audit --no-fund`: passed with authorized network access. The
  initial sandbox attempt could not resolve the package registry.
- `npm run check`: passed on the final local tree: 194 Node tests, 191 passed,
  three browser opt-in tests skipped; 26 Python tests passed; TypeScript and
  production build passed. Loopback broker tests required execution outside
  the restricted sandbox; no paid provider inference was performed.
- README `npm run test:browser -- 5195 4195`: passed for development and
  production previews at 320x640, 390x844, 844x390 and 1024x768. Browser
  permission/broker fixtures are simulated; this is actual Chromium rendering.
- `VERBS_BROWSER=1 node --import tsx --test tests/verbs-browser.test.ts`:
  passed for both verb modes at the same four viewports, including matching
  photo credits/context, stable exercise/photo, credit-reading hold, helper and
  evidence preservation, automatic advancement, reflow and 200% text.
- `node content/en-wp-03/check_assets_browser.cjs 5195` and `... 4195`:
  all 30 JPEGs returned HTTP 200 with correct MIME and exact local bytes,
  decoded and rendered at 320/390/844/1024 widths. No page errors or external
  requests. Full collection size is approximately 2.8 MiB.
- `git diff --check`: passed.

The environment supplied Playwright through `NODE_PATH` and Chrome through
`CHROMIUM_EXECUTABLE_PATH`; no repository browser dependency was added.
A browser regression exposed delayed native details-toggle notification;
the credit summary now holds advancement synchronously before opening, and
that regression passes on the final implementation.

## Atlas coordinator intake

Decision supplied directly by Pablo: always use real photographs; prefer free
image banks and allow future collections with N images per irregular verb.
The app repo owns this implementation and image policy. No canonical Atlas
files were edited. The coordinator may intake this receipt and source comparison
under the existing English-learning topic. Relevant standards:
[engineering language](https://github.com/pablitxn/sysadmin-workspace/blob/main/atlas/ops/standards/engineering-language-and-commits.md)
and [parallel integration](https://github.com/pablitxn/sysadmin-workspace/blob/main/atlas/ops/standards/pull-request-and-parallel-integration.md).

No commit, push, PR, merge or deployment was performed. Independent learner
comprehension, physical devices and real voice/provider behavior remain
unverified. Provider anti-AI rules, source-page inspection and visual review
are sourcing evidence, not an authenticity guarantee or automated AI detection.
Historical SVG screenshots/receipts remain dated evidence and are not active
exercise images.

## Lesson-cover amendment (2026-10-18)

Pablo clarified that the home catalog should retain the graphic style of the
other cards rather than display a photograph. The Picture cover now uses
serif see/think/say typography on its existing warm pastel background, matching
the Verb and Sentence covers. This supersedes the cover-photo statement above;
exercise photos and their selection are unchanged. The real-photo policy now
explicitly permits graphic covers. Verified separately with the production
build and actual browser layout checks at mobile, tablet and desktop widths.

## Picture information amendment (2026-10-18)

Pablo requested removal of the Photo credit control and replacement of Use
another cue with an information icon and hover tooltip. The exercise now shows
an information icon with the selected photo's Spanish description/context in a
hover/focus tooltip. Touch opens it; Escape, blur or an outside tap dismisses it.
The tooltip remains hoverable and holds automatic advancement while read, without
changing the exercise, selected photograph or evidence. Photo attribution and
license provenance remain in the ledger; no credit control appears in the UI.

The supplied verb browser fixture checks hover, pointer movement onto the
tooltip, focus/Escape, actual touch taps/outside taps, viewport bounds and the
presentation hold at 320/390/844/1024 widths for both verb modes. Unit and content
checks pass. The combined build currently cannot complete because concurrent
SentenceLesson.tsx work imports a not-yet-present WrittenTranslation module;
that unrelated in-progress source was preserved.

## Photo layout and writing-line amendment (2026-10-18)

Pablo requested removal of empty image gutters, a subtle full-screen expansion
control, and writing lines in place of boxed verb inputs. Reviewed all 30 source
photographs individually: 18 landscape, 11 portrait and one square. A uniform
wide crop would remove useful hands, objects or facial gestures from several
portraits, so the final presentation preserves each complete photograph.

The photo frame now follows the image's native aspect ratio without a padded
horizontal stage. At sufficient container width the photo and answers sit side
by side; narrow layouts stack them. Image height is bounded by the viewport.
The information icon overlays the photo, with no additional text beneath it.

The top-right expand control is hidden until mouse hover, keyboard focus or a
touch on the image. Touch reveal expires after 4.5 seconds or an outside tap.
The native modal occupies the viewport and contains the complete image, with a
close control, Escape dismissal, local keyboard focus and focus restoration.
Opening synchronously holds automatic advancement; closing/unmounting releases
that hold and restores background scrolling. The same selected photo and all
answers survive opening and closing. Missing-image feedback retains the factual
Spanish alternative and learner progress.

Verb inputs use a serif writing line, a stronger focus/error rule and a quiet
Check action. Labels, correction markers, sound help, input finalization and
accessible touch targets are retained. These styles are scoped to verb lessons.

Validation on the local working tree:

- `npm run check`: 205 Node tests, 202 passed and three opt-in browser tests
  skipped; 26 Python tests passed; TypeScript/production build passed.
- Opt-in verb Chromium suite: both modes at 320x640, 390x844, 844x390 and
  1024x768, including hover/touch expansion, viewport modal bounds, keyboard
  dismissal/reopening/focus restoration, presentation hold, stable photo and
  answers, correction/help behavior and 200% text reflow.
- All 30 photos selected in the actual localhost:5174 lesson and rendered at
  320/390/674/1024px in light and dark themes: native ratios preserved, frame
  bounds matched image bounds, no horizontal overflow, page errors or external
  requests. Actual source identity was checked for every variant.
- [Complete current layout review](layout-review.jpg) combines those 30 distinct
  actual lesson renders; it supersedes the earlier contact sheet for this review.

All browser voice transport was disabled or explicitly mocked. No provider,
physical phone, publishing or deployment evidence is implied.

### Vertical-order correction (2026-10-18)

Pablo preferred the original reading order, particularly on mobile. The lesson
now keeps the photo above the answers at every width, superseding the two-column
layout described above. Natural photo framing, expansion and writing lines stay
in place. The earlier layout contact sheet records the superseded arrangement.

### Quiet help and English photo copy (2026-10-18)

Pablo requested one English poetic sentence per photo, a small help icon beside
spelling corrections, removal of the repeated error explanation, and tighter
spacing. All 30 ledger records now use `tooltip_en`; their factual Spanish
alternatives and pronunciation guidance remain intentional curriculum content.
The picture tooltip has English language metadata.

Spelling help now opens on hover, focus or tap beside the correction and retains
IPA plus the Spanish sound guide in a compact quotation-style tooltip. Escape,
blur and outside taps close it. Existing help opt-in, timed/untimed offers,
visibility pauses, presentation holds and no-autofill behavior are preserved.
The redundant error paragraph is visually hidden with a single accessible
announcement. Empty/success status does not reserve a visible line; verb field
margins and input padding are reduced. The vertical photo-before-answers order
is unchanged.

Validation: `npm run check` passed (207 Node tests: 204 passed, three opt-in
browser tests skipped; 26 Python tests; production build). Both opt-in UX and
verb Chromium suites passed at all four supported viewports, including hover
into the tooltip, touch dismissal, focus/expiry, no layout movement on open and
200% text. The component-only UX harness keeps its extra mock controls in flow;
the verb suite and actual application retain the fixed two-tool dock. Actual
localhost:5174 renders were inspected at 390 and 674 pixels with voice disabled.
A rapid image-viewer reopen regression exposed a delayed native close event;
removing the redundant state update fixed it, and the final verb suite plus
TypeScript/production build passed again. No provider call or deployment occurred.

### Shuffled navigation and automatic checking (2026-10-18)

Picture sessions now shuffle the entire current collection of 50 photographs
once per cycle. Previous/next follows that order without choosing a new random
item on every click. Each occurrence retains its exact photo and typed drafts,
including partial input. Exhausting a cycle appends another shuffle; earlier
items remain navigable. Starting a new lesson session resets this in-memory
history. Visible-verb practice uses the same behavior with all 25 verbs.

Revisits allocate fresh exercise and attempt identities and reassess stored
spelling locally. Old provider results, oral evidence, speech queues, questions
and hints are not replayed. Previously completed items remain editable without
automatic skipping or duplicate completion reporting. Navigation still works
offline and while paused.

The arrows overlay the photo. Each arrow and the expand control appears only
when its own hit region is hovered or keyboard-focused; hovering elsewhere on
the photograph reveals neither. Touching the photograph reveals its controls.
Keyboard focus survives navigation and falls back to Next at the start of
history. Portraits retain a readable size on short landscape viewports.

Routine Check buttons are removed from verb spelling and sentence translation;
debounce, Enter and blur still validate automatically. The separate verb hint
button is removed. Error-only sound help remains beside corrections, and
refocusing an input reoffers an expired helper.

Validation on the final local working tree:

- `npm run check`: 213 Node tests, 210 passed and three opt-in suites skipped;
  26 Python tests passed; TypeScript and production build passed.
- Verb Chromium suite passed both modes at 320/390/844/1024px, including draft
  restoration, exact photo restoration, completed-item review, modal behavior,
  keyboard focus, hover/touch controls, automatic checking and 200% text.
- Mobile component Chromium suite passed all four widths, including help offer
  expiry/reoffer, input composition and finalization deduplication.
- Existing written-sentence browser smoke passed four widths in offline and
  mocked-call modes, including automatic checking, IME and hint races.
- Actual localhost:5174 renders checked at 390x844, 674x1026, 1024x768 and
  844x320: button-region hover, backward/forward answers, narrow portrait bounds
  and no horizontal overflow. Mobile and short-height screenshots inspected.

Voice and hint services were disabled or intercepted by explicit fixtures.
These results do not imply physical-device, live-provider or deployment testing.
