# Three photographs per verb

Date: 2026-10-18 (Europe/Istanbul). Scoped content writer: current root executor.
Base HEAD: `6c1b5eda48994b2d3caef29e6f2efcb99d0fcfd7` on
`codex/lesson-prompt-sound-help`. Uncommitted local working-tree evidence.

Pablo requested exactly three photos for each current verb after the preceding
expansion to fifty. Added twenty-five distinct Pexels photographs, one for each
verb. The collection now contains 75 photos for 25 verbs, exactly three each.
The first fifty ledger records were checked for equality before/after appending;
their files and primary verb cues remain unchanged. Shared implementation,
contracts, manifests and lockfile were not edited by this continuation.

Every selected item page was opened and its credited creator and free-use
license link reviewed. The existing Pexels License review applies. Individual
source/download/license URLs, SHA-256, date, Spanish factual/contextual cues and
English tooltips are in the [ledger](../../../../content/en-wp-03/asset-ledger.json).
All additions were visually reviewed as downloaded photographs. Two candidates
were rejected because they showed adding ingredients rather than whisking and
a bubble toy with the child's mouth outside the frame. A food-serving candidate
whose page could not be reopened was replaced with a verified waiter photograph.
The blood scene shows only a small fingertip drop beside a glucose strip and
is marked ambiguous; context directs attention to the drop rather than testing.

The [contact sheet](contact-sheet.jpg) contains only these 25 additions in verb
order. It is a review layout, not an exercise image or generated replacement.
The additions total 2.56 MiB; all 75 photographs total 6.85 MiB. Every local JPEG
is at most 960 pixels wide and 500 KB, with recorded CDN resize/compression and
no generative edits. Source/visual review is not an authenticity or rights audit.

## Validation

- Exact inventory assertion: 75 distinct assets, 25 verbs, exactly three each.
- `npm run check`: passed on the combined local tree: 211 Node tests, 208
  passed and three optional browser suites skipped; 26 Python tests passed;
  TypeScript and production build passed. Vite warns that the combined main
  JavaScript chunk is 522.85 kB; no code-splitting change is part of this task.
- `node content/en-wp-03/check_assets_browser.cjs 5174`: all 75 JPEGs served
  HTTP 200 with JPEG MIME and exact source bytes, decoded and reflowed at
  320/390/844/1024-pixel widths. Zero page errors or external requests.
- Existing content tests enumerate selection of every variant with matching
  context and attribution; no selection implementation change was needed.
- `git diff --check`: passed.

The browser used supplied Playwright via NODE_PATH and installed Google Chrome
via CHROMIUM_EXECUTABLE_PATH. No provider inference or physical-device testing
was performed. The previous two-photo receipts remain historical evidence.
Publication, deployment and shared Atlas edits were not performed. This
application-owned receipt is available to the coordinator for intake.
