# Present, past and future exercise expansion

Date: 2026-10-24 UTC. Repository: `pablitxn/lang-lessons`.
Base: `b562273e1a45fd31bd23a523a6ca4ebc379f0030` (merged French parity PR28).
Branch: `feat/tense-practice-expansion`; isolated worktree:
`/workspace/lang-lessons-exercises`. The remote PR records the resulting immutable
head and publication status. This receipt binds the tested source through the
review hashes and compiled bundle below; later corrections require an amendment.

## Result and inventory

The Spanish-based curriculum grows from 87 to 285 sentence prompts (+198):
English 33 to 150 and French 54 to 135. Counts below use the authored primary
construction (French: first alternative), so a prompt offering several valid
constructions is counted once. Filtering still considers every valid alternative.

| Language | Primary construction | Before | Added | After |
| --- | --- | ---: | ---: | ---: |
| en | present_simple | 4 | +9 | 13 |
| en | present_continuous | 4 | +9 | 13 |
| en | present_perfect | 5 | +9 | 14 |
| en | present_perfect_continuous | 4 | +9 | 13 |
| en | past_simple | 4 | +9 | 13 |
| en | past_continuous | 4 | +9 | 13 |
| en | past_perfect | 4 | +9 | 13 |
| en | past_perfect_continuous | 4 | +9 | 13 |
| en | future_simple | 0 | +9 | 9 |
| en | future_going_to | 0 | +9 | 9 |
| en | future_continuous | 0 | +9 | 9 |
| en | future_perfect | 0 | +9 | 9 |
| en | future_perfect_continuous | 0 | +9 | 9 |
| fr | fr-present | 9 | +9 | 18 |
| fr | fr-passe-compose | 9 | +9 | 18 |
| fr | fr-imparfait | 9 | +9 | 18 |
| fr | fr-futur-proche | 9 | +9 | 18 |
| fr | fr-futur-simple | 9 | +9 | 18 |
| fr | fr-conditionnel-present | 9 | +9 | 18 |
| fr | fr-passe-recent | 0 | +9 | 9 |
| fr | fr-plus-que-parfait | 0 | +9 | 9 |
| fr | fr-futur-anterieur | 0 | +9 | 9 |

Every one of the 22 constructions covers all nine grammar/vocabulary pairs:
198 nonempty selection cells. Existing English categories grow by nine prompts
each, and existing French categories by nine each. New constructions start with
nine each. There are 260 new reference translations. All 87 original records
remain exactly equal, with unchanged IDs, alternatives and hints; automated
hash guards protect this continuity. No verb, photograph, dictionary, persisted
progress record or data schema was replaced.

New prompts vary subjects, domestic/travel/work/public-service contexts,
affirmation, negation, questions and temporal contrasts. Required time/context
cues appear in the visible Spanish sentence. Level one means simpler syntax
within a construction, not a claim of beginner or CEFR proficiency. French
ongoing actions use présent naturally; conditionnel remains a distinct category.
Literary tenses and a comprehensive subjunctive/conditional curriculum are outside
this core expansion. Authored examples remain non-exhaustive; filters do not
force the label of a different valid accepted construction.

## Ownership and review

The integration owner is the only writer for shared contracts, adapters, picker,
voice/hint integration and aggregate receipts. Separate workers authored English
present/past, English futures and French, with separate test and independent
pedagogy/code reviewers. Original task scope and source policy come from AGENTS,
architecture/parallel handoff and the neighboring Atlas at
`b1c10f52e456f064963685dfa4a69b7daf524829`; local `atlas-navigate` was read.
Application ownership takes precedence over dated Atlas deployment observations.

- [Machine-readable inventory](tense-expansion-2026-10-24.inventory.json).
- [Independent pedagogy review](tense-expansion-2026-10-24.pedagogy.json): all
  198 additions/260 alternatives reviewed, five small wording/difficulty fixes
  applied, `complete-clean`. Original record equality and per-language duplicate
  checks passed. This is independent AI review, not human certification.
- [Independent integration review](tense-expansion-2026-10-24.integration.md):
  `complete-clean` after fixing a direct auxiliary leak in written hints.
  Its 66 targeted tests passed; exact reviewed hashes match the final source.
- Grammar sources and their access limits are recorded in
  [English sources](../../content/en-wp-03/SOURCES.md) and
  [French curriculum](../../content/fr/README.md). Cambridge full-page access
  returned 403; official search excerpts were used and labeled accordingly.

## Validation

- `npm ci --cache /tmp/lang-lessons-exercises-npm-cache`: passed with the
  unchanged lockfile and dependencies.
- `npm run check`: 456 Node tests passed, 88 existing opt-in fixtures skipped
  (544 total); English content integrity passed; all 28 Python mutation tests
  passed; strict TypeScript and Vite build passed. This repository defines no
  separate lint command; `git diff --check` is clean.
- New tests exercise all 198 language/tense/difficulty cells, no immediate repeat
  when alternatives exist, actual-alternative tense recognition, unlisted-valid
  uncertainty, original-record preservation, language-specific settings and
  written draft/tense restoration. Text evidence remains client-reported and
  cannot establish oral completion.
- `smoke-tense-expansion.cjs`: 44 filter/translation/picker scenarios across
  English/French at 390 and 1024 px, 16 new-construction reload checks and
  navigation between unequal Present/Past/Future groups. Both development and final production-bundle executions passed.
  The [validation manifest](tense-expansion-2026-10-24.validation.json) pins
  the exact source and bundle hashes.
- `smoke-past-tenses.cjs`: all 51 scenarios passed at 320, 390 and 1024 px,
  including 39 present/past/future sentence scenarios and 12 past-verb scenarios.
- `smoke-french.cjs`: all four scenario groups passed on both development and final production builds, covering all
  three modes, repeated language switching, preserved drafts/photos/identities,
  fresh-device French hydration, nine filters, dictionary/spelling, 37 unique
  decoded photo files and mocked active-call switching.
- `smoke-browser.cjs`: all four production viewport groups passed (320x640,
  390x844, 844x390 and 1024x768), including routes, offline spelling, reference
  rows, preferences/persistence and no external requests.
- Original `smoke-written-sentences.cjs` fails at its first 320x640/voice-disabled
  200% text-size assertion (`.ll-exercise` bottom exceeds viewport after scrolling).
  Independent execution of the unmodified script/app at exact base b562273
  reproduces the same assertion. This is pre-existing; the rest of that script
  remains unrun after the early failure. New picker/typed lifecycle coverage is
  supplied separately, without claiming full 200% layout acceptance.

Compiled bundle: `dist/assets/index-Bg2vRJxR.js`, SHA-256
`fd54c981fe2ee392d44f5c230dc538048bf3af7a3c03d696e0665bb5e6d5489c`.
Vite reports 1,314.88 kB (252.27 kB gzip) for this bundle; the existing >500 kB
advisory remains. Browser runs use actual Chromium rendering with synthetic
HTTP/media/provider verdict fixtures, never real provider calls or microphones.
No PostgreSQL/production database test was run in this task; the untouched
storage format and preserved records are covered locally by serialization and
session fixtures. Physical devices, acoustic quality and live-provider behavior
remain unverified.

## Publication and deployment boundary

The user authorized implementation and source publication end to end, including
main integration after checks. Start with a draft PR; verify its remote head,
available CI and current main before the authorized merge. The source repository
has no GitHub Actions workflow; report actual external status checks separately
from local quality checks and from private packaging CI.

Private instance MR4, its pipeline and in-flight backup recovery belong to the
parent/Mac release owner. This task did not query or mutate that MR, production,
its database or infrastructure, and does not establish deployment of this
expansion. The parent receives this source revision and evidence for a later
coordinated release. No credentials, permissions, purchases or paid inference
were introduced. Atlas receives this app-owned intake through the parent;
canonical shared Atlas files were not edited.
