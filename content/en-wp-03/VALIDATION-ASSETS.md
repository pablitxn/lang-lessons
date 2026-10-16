# EN-WP-03 asset and build validation amendment, 2026-10-16

This amends [VALIDATION.md](VALIDATION.md) for the follow-up dispatch, which
explicitly authorized original local illustrations and closing image references.
The original published evidence remains unchanged. Prior content head:
`88dd533b7de2af8f72839955a01b91881c4dc913`; same branch/draft PR #1:
`content/en-wp-03-curriculum-v1`. The complete foundation
`fd1678b93b3a55166fd8492bea307e6191e9a7dd` was merged additively at `0d5463c`.
The final response/PR supplies the resulting immutable asset commit SHA.

## Changed result

Exactly 25 original SVG scenes now live under `public/images/verbs/`. Every
authored verb references a nonempty local image source, Spanish nonvisual cue,
context and attribution. Ten abstract/directional/multisense cues are explicitly
marked ambiguous; consumers should show their Spanish context. The ledger
records each original source, creator, rights basis and SHA-256. There are no
external assets, fonts, scripts, logos or printed English answer/tense labels.
Rendering and file checks do not establish independent classroom comprehension.

The adapter now uses the real image sources and combines nonvisual description
and context in alt text. Extensionful test imports were removed, and explicit
example-family fields replace a cast rejected by TypeScript. JSON import
attributes compile under the foundation's existing settings. No package,
lockfile, shared types, tsconfig, routing or global-style edits were authored.

## Executed checks

| Check | Actual result |
| --- | --- |
| `npm ci --cache /tmp/lang-lessons-en-wp03-npm-cache` | Installed the foundation's locked dependencies; lockfile unchanged |
| `python3 content/en-wp-03/check_content.py` | Passed exact25, curriculum/fixtures, every local file reference/hash, XML parse/accessibility/reference safety and original provenance invariants |
| `python3 -m unittest discover -s content/en-wp-03/tests -v` | 21 passed; includes corrupted hashes/inventory, absent context, malformed XML, external-resource and printed-answer-text rejection |
| `npm run check` | 25 Node tests passed (eight content tests plus foundation tests), strict TypeScript passed, Vite production build passed |
| Deterministic renderer rerun | Asset, ledger and verb-data hashes unchanged on rerender |
| `SCREENSHOT_PATH=/workspace/scratch/en-wp03-cue-contact-sheet.png node content/en-wp-03/check_assets_browser.cjs 5193 4193` | All 25 assets fetched with HTTP 200 and SVG MIME from both dev and built preview; served bytes matched source; all decoded at 320x240; Spanish alt present; reflow at 320/390/844/1024 widths; no external requests/page errors |
| `npm run test:browser -- 5193 4193` | Current supplied Playwright/Chromium helper passed both servers at all four foundation viewport sizes, including routes/preferences/reload/reset/reflow and no external requests |
| Contact-sheet inspection | All 25 distinct scenes visually inspected in the local browser screenshot; no printed answer words in the SVG scenes |

Browser tools: supplied Playwright resolved from the current environment and
`/usr/bin/chromium` as documented by the current foundation helper, with writable
temporary config/cache paths. No TLS bypass, public hosting, microphone grant,
paid image provider or external navigation. The asset review grid is a temporary
browser test surface, not a shipped lesson screen or learner acceptance test.

## Remaining evidence limits

No mocked transport, real speech/pronunciation, live model hints, physical mobile,
classroom/user acceptance or deployment was evaluated. Independent linguistic
and cue-comprehension review remains. Original repository authorship is recorded
without claiming legal review or a separate public license grant. EN-WP-02/05
own contextual-cue presentation within actual lessons. The earlier empty-image
and uncompiled-adapter gaps are closed. Atlas canonical docs remain untouched.
