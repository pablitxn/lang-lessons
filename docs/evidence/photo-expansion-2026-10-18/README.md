# Verb photograph expansion receipt

Date: 2026-10-18 (Europe/Istanbul). Scoped application/content writer: current
root executor. Base HEAD: `6c1b5eda48994b2d3caef29e6f2efcb99d0fcfd7`.
Branch: `codex/lesson-prompt-sound-help`. This is uncommitted local evidence.

## Inventory and scope

The inspected working tree had 30 photographs for 25 verbs: be, beat, break,
buy and choose had two each; the remaining twenty verbs had one each.
Added one photograph for each of those twenty verbs. The resulting inventory
has 50 photographs, two per verb, an increase of 66.7 percent.

The existing 30 records and files, primary cues in verbs.json and exercise
selection implementation are preserved. This task changes only the photo
ledger, twenty new local JPEGs, the collection counts in ASSETS.md and README.md,
and this evidence directory. Existing concurrent application changes remain
outside this task. No shared contracts, manifests or lockfile were edited.

## Source and visual review

All twenty additions are Pexels photographs. Each individual item page was
opened and checked for its photographer/uploader credit and free license link;
the [Pexels License](https://www.pexels.com/license/) was reviewed on this date.
Individual URLs, creator credits, license URL, review date, Spanish factual
alternative/context, English tooltip and SHA-256 are in the
[asset ledger](../../../content/en-wp-03/asset-ledger.json).

The actual downloaded photographs were visually reviewed together at roughly
mobile width; additional full-size checks covered the small scissors/paper
scene and wooden-block construction. A distant baseball candidate was rejected
in favor of a dog approaching a flying disc. Context explicitly identifies
catching rather than jumping. Construction, dreaming, direction and other
ambiguous scenes retain contextual cues; a still image does not establish
unique learner comprehension.

The [contact sheet](contact-sheet.jpg) contains only the twenty additions in
ledger order. It is a review layout of original photographs, not an exercise
asset or synthetic replacement scene. Images are local JPEGs, at most 960
pixels wide and 500 KB each, with only the recorded CDN resize/compression.
New files total 1.53 MiB; the complete collection totals 4.29 MiB. Source and
visual review cannot certify third-party authenticity or every possible right.

## Verification

- `npm ci`: passed; no manifest or lockfile changes.
- `npm run check`: passed, 207 Node tests (204 passed, three optional browser
  tests skipped), 26 Python tests, TypeScript and production build. The initial
  sandbox run could not open loopback listeners; the full rerun with local
  execution permission passed. No provider calls were made.
- `node content/en-wp-03/check_assets_browser.cjs 5174`: passed in supplied
  Chrome for all 50 photos: HTTP 200, JPEG MIME, exact served/local byte equality,
  decoding, Spanish alternatives and reflow at 320/390/844/1024 pixels. Zero
  page errors and zero external requests.
- `VERBS_BROWSER=1 node --import tsx --test tests/verbs-browser.test.ts`:
  passed for both verb modes at 320x640, 390x844, 844x390 and 1024x768. This
  checks stable photo/context, helper and full-screen viewer behavior, preserved
  answers/evidence, progression holds, reflow and 200 percent text. Voice
  evidence in this fixture is explicitly mocked.
- `git diff --check`: passed.

The browser helpers used the environment-supplied Playwright through NODE_PATH
and the installed Google Chrome through CHROMIUM_EXECUTABLE_PATH. No browser
dependency was added. Physical-device comprehension, real provider behavior,
publication and deployment are outside this local validation.

## Coordinator handoff

Pablo requested more photographs for the existing verbs and a baseline count.
The application owns the expanded collection and provenance; this receipt is
available for coordinator intake. No shared Atlas canonical documents were
edited. Existing dated 30-photo receipts remain historical evidence.
