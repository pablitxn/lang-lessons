# Sentence content and presentation refinement

Date: 2026-10-25. Local changes on `codex/exercise-feedback`, based on
`b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. No commit, publication or deployment
is claimed. Prior exercise work and concurrent voice changes were preserved.

## Changes

- Removed the source footer and the multiple-meanings note from the exercise.
  Public entries viewed in this page session retain direct source links,
  contributor attribution, license and adaptation information in Preferences >
  Credits. The French dictionary eyebrow still identifies English definitions.
- Dictionary normalization removes explicit internal editorial references while
  preserving lexical glossary wording. Nested meanings repeated as standalone
  senses and repeated usage examples are deduplicated before display limits.
- Renamed the optional writing disclosure to **Escribe otros ejemplos**.
  The correction contract and explicit-submit behavior remain unchanged.
- Grammar explanations separate the tense, example, formula, contextual use
  and specific notes. All authored alternatives remain covered, English
  contextual caveats are preserved, and French retains its authored copy.
  The existing plain-text helper remains compatible.

## Validation

- Final `npm run check`: 511 Node tests passed, 94 opt-in tests skipped;
  28 Python tests, content integrity, TypeScript and Vite build passed.
  The existing bundle-size warning remains.
- Fifteen dictionary HTTP tests passed, including editorial cleanup, preserved
  lexical text and nested-definition/example deduplication.
- Ten grammar content tests passed, including every alternative and exact
  French authored paragraphs.
- Sentence tools and rewrite browser suites passed four viewport sizes. The
  tests verify absent inline notices and relocated linked source/license
  attribution, as well as existing draft/cancellation behavior. P5 dictionary
  credits regression passed. Model/dictionary transport was intercepted.
- Grammar rendered at 390px and 663px and with 200% text without overflow.
- Independent review of the attribution subscription found no actionable issue.
  `git diff --check` passed.

## Live observation

After restarting the local development stack with its existing configuration,
the authenticated Sentence lesson returned a real public Wiktionary lookup for
`my`. The definition contained no `Appendix:` reference; the three displayed
senses had distinct examples. The exercise had no source footer or redundant
note. Preferences > Credits showed the exact `my#English` source and license.

The grammar layout and new disclosure title were verified in the actual app.
The tutor remained stopped, and no paid inference was invoked.

- `/tmp/lang-lessons-sentence-grammar-refined-live.png`: actual authenticated UI.
- `/tmp/lang-lessons-grammar-390.png`: narrow grammar fixture.
- `/tmp/lang-lessons-grammar-663.png`: wider grammar fixture.
