# Lesson UX and main integration, 2026-10-17

Local integration branch: `codex/lesson-prompt-sound-help`.
Parents: UX checkpoint `9535a7528397d626d357b833c5dae63b044a544c`
and fetched main `9dd7f28d823751d7e56d81756d15ff3660bf1d19`.
The local merge containing this receipt preserves both histories. No remote
publication or deployment is part of this integration.

## Combined behavior

The 16 additional sentence prompts and four past tenses use the same sentence-only
cues, arrow navigation, PC preferences trigger, compact voice-error badge and
fixed Progress/Reference footer. All 82 authored verb-form respellings remain
available alongside IPA. Manual skip applies pending tense/difficulty preferences
offline, starts a fresh exercise and never reports skipped work as completed.

The new sentence rubrics do not require hidden authoring context. Past residence
accepts simple and continuous readings; trench duration does not establish
completion. Omitted subjects permit compatible pronouns and English agreement.
The 99 authored oracle cases include the additional residence variant. Verb
reference tables describe auxiliary roles without supplying requested be/do
forms; the full sentence structure guide remains gated by translation acceptance.

Conflicts in `SentenceLesson.tsx` and `voice-protocol.test.ts` were resolved by
retaining the sentence-only copy, expanded guide and both sets of regression
tests. Delayed audio protection and all prior navigation/session changes remain.

## Verification

- `npm run check`: 185 Node tests, 182 passed and three optional browser tests
  skipped; 25 Python tests, strict TypeScript and production build passed.
- `npm run test:content` after the oracle amendment: 25 verbs, 33 prompts,
  99 authored cases and all 25 Python tests passed.
- `npm run test:browser -- 5174`: passed at 320x640, 390x844, 844x390 and 1024x768.
- `node scripts/smoke-practice.cjs 5174`: all three modes at those four viewports
  passed, plus eight simulated transport lifecycle scenarios.
- `node scripts/smoke-past-tenses.cjs 5174`: all 38 scenarios passed: eight tenses
  at three widths, four past tenses offline at three widths, and both verb
  reference guides. Checks include sentence-only cues, arrow-only buttons,
  deferred preference selection, footer tools and the voice-error dialog.
- Inspected the 390px sentence, compact offline lesson and tense-preference
  screenshots. No horizontal overflow, page errors or external requests occurred.
- `git diff --check` and the staged equivalent passed. Main was fetched again
  before finalization and still matched the integration parent above.

Browser verification uses the supplied Playwright runtime and installed Chrome.
Media and provider results are injected and external requests are blocked;
disabled-service scenarios make no session request. This verifies actual browser
rendering and local state transitions, not real pronunciation assessment,
microphone behavior on physical devices or model quality. No paid inference ran.
Earlier published receipts remain unchanged.
