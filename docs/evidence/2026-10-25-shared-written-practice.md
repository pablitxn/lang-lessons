# Shared optional written practice and correction feedback

Date: 2026-10-25. Local working-tree changes on `codex/exercise-feedback`, based
on `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. No commit, publication or deployment
is claimed. Prior exercise work and concurrent voice changes were preserved.

## Delivered behavior

- `WrittenPractice` owns the disclosure, draft, underline field, character count,
  submit action and request lifetime for Sentence and both Verb modes.
  `SentenceRewritePractice` and `VerbSentencePractice` only supply context and
  copy. The obsolete duplicated styles and verb-only hook wrapper were removed.
- All modes display **Escribe otros ejemplos**, **Corregir** without an arrow,
  no optional badge or subtitle, and the same 800/900/950 counter thresholds.
  Sentence shows its reference sentence; Verb shows the current lemma.
- `WrittenCoachingResult` supplies one headerless feedback view. A case-sensitive
  word diff strikes removed text and underlines the replacement, including
  capitalization, accents and punctuation. Assistive technology receives the
  complete corrected sentence and Spanish explanation instead of interleaved
  deleted/inserted text. No tutor label or verdict heading remains.
- Shared server instructions and response schema request grammar, agreement,
  spelling, accents, capitalization, punctuation and word-choice corrections,
  preserving the learner's intended meaning. Sentence examples can change topic,
  participants and tense; the reference is optional inspiration. Verb examples
  still require the current verb in a legitimate construction.
- Both boundaries reject unchanged revision outputs and reject meaning-based
  off-topic verdicts for free Sentence examples as operational response errors.
  No automatic retry or fabricated replacement is introduced.
- Account/session authorization, explicit submission, IME protection, scoped
  caching, cancellation and stale-result rejection remain intact. Optional
  writing does not create progress or oral evidence.

## Validation

- `npm run check`: 518 Node tests passed, 94 opt-in tests skipped. Content
  integrity, 28 Python tests, TypeScript and Vite build passed. The existing
  bundle-size warning remains.
- Thirty mocked HTTP tests passed for the shared correction rules, source
  payload boundaries, contradictory results, authorization and bounded transport.
- Word-diff tests and an independent 202-case round-trip probe preserved exact
  draft and corrected text through repetitions, Unicode, emoji, whitespace and
  maximum-length input. Independent scoped review found no actionable defect.
- Verb standalone, Sentence standalone and integrated Sentence tools suites passed four viewport
  sizes with mocked coaching responses, including del/ins reconstruction,
  removed headings, compact input, character thresholds, request lifetime and
  original-answer preservation.
- Integrated Verb lessons passed both modes at four viewport sizes and 200%
  text, including the shared composer after the written completion gate.
- `git diff --check` passed. No paid inference or real voice call ran; provider
  behavior and model linguistic quality were not established by these mocks.

## Local runtime

The local development server was restarted with its existing configuration to
load the shared prompts. The authenticated Sentence route retained its original
answer and tense; its new composer showed **Frase de referencia**, **Tu ejemplo**
and **Corregir**. The tutor remained stopped.

Screenshots use clearly labelled simulated coaching fixtures:

- `/tmp/lang-lessons-sentence-rewrite-mobile.png`
- `/tmp/lang-lessons-verb-writing-mobile.png`
