# Exercise feedback and completion explanations

Date: 2026-10-24. Local branch: `codex/exercise-feedback`.
Base: `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`.
Status: local implementation and verification; no commit, publication or deployment.

## Behavior

- Sentence help has a visible information button and appears below the answer
  in normal flow, with hover, focus, tap, Escape and Alt+Down support. The input
  describes the open tooltip for assistive technology.
- Whole submitted words replace character-level error triangles. Missing chunks
  receive explicit text labels without supplying the answer. Feedback identifies
  reference differences and acknowledges that other wording can be valid.
- A matched translation and correct tense selection reveal Spanish grammar
  guidance for that alternative. Mixed-tense alternatives retain their own
  reading. Editing or changing exercises resets the written explanation. Oral
  completion can show a clearly labelled reference example.
- Both verb modes show their existing sourced local dictionary after all
  editable spelling forms pass. Definitions remain until explicit Next;
  written completion does not manufacture oral evidence.

## Ownership and review

The integration writer owned sentence composition, shared architecture and this
receipt. Separate workers owned verb state/UI, written-feedback UI and grammar
copy. No manifest, lockfile, route, global stylesheet, shared contract, provider
or canonical Atlas document changed. Concurrent French curriculum was preserved.
Independent review found and resolved an alternative-context contradiction and
the keyboard tooltip accessibility relationship.

## Verification

- `npm ci --cache /tmp/lang-lessons-npm-cache`: dependencies installed from the
  existing lockfile; no dependency upgrade.
- `npm run check`: 467 Node tests passed, 88 optional tests skipped; 28 Python
  content tests passed; TypeScript and production build passed.
- Opt-in `tests/verbs-browser.test.ts`: both verb modes passed at 320x640,
  390x844, 844x390 and 1024x768 with injected transport and verdicts.
- Opt-in `tests/sentences-browser.test.ts`: passed at the same four sizes,
  including matched-alternative grammar, wrong-tense gating, edit/reset,
  oral/reference distinction and no external requests. Its old fixed-index and
  unsupported-difficulty assumptions were updated for the expanded curriculum.
- `node scripts/smoke-written-sentences.cjs 5174`: passed all eight viewport and
  service-state cohorts, keyboard tense selection, alternate constructions,
  homework omissions, hint debounce/abort/failure/races and touch help. A focused
  Chromium check additionally passed the final input-to-tooltip accessibility
  association, Escape cleanup and nonoverlap, with zero hint or voice requests.
  The helper's layout assertion now checks the existing internal card scroll.
- `git diff --check`: passed.

Browser rendering uses the supplied Playwright package and installed Google
Chrome. Screenshots in `/tmp/lang-lessons-written-browser/` were visually
inspected for the reported homework example, mobile error help and completion
grammar. Local execution logs are in `/tmp/lang-lessons-feedback-check.log`,
`/tmp/lang-lessons-feedback-browser.log` and
`/tmp/lang-lessons-feedback-sentences-browser.log`.

These checks establish local UI behavior with controlled fixtures. They do not
establish physical-device, screen-reader, real-audio or live-provider validation.
No paid inference was performed. Atlas context remains the repository's existing
architecture and parallel-handoff contracts; canonical knowledge intake is left
to its coordinator.
