# Sentence hint placement and concise coaching

Date: 2026-10-25. Local working tree on `codex/exercise-feedback`, based on
`b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. Existing feature and concurrent voice
changes were preserved. No commit, publication or deployment is claimed.

## Delivered behavior

- Correct optional examples in Sentence and both Verb modes use the same prompt
  to request one or two useful grammar observations grounded in the actual draft.
  The response remains headerless and does not impose the inspiration's tense.
- Dictionary mode has a 44-pixel icon control with its accessible name retained.
  Missing text reads **Falta**; the feedback heading and comparison note are gone.
- Shared `InfoTooltip` supports portaled placement at the actual annotation/input
  trigger. Cue help floats outside the Spanish prompt. Placement avoids the cue,
  input, annotation and dock, preserves layout and clamps to the viewport.
  Default verb tooltip behavior and holds remain intact.
- The hint filter accepts generic temporal references to `futuro`; explicit tense
  answers, formulas and full-answer leaks remain rejected. Server failures carry
  safe reason codes, and the client displays fixed Spanish messages. Authorization,
  provider and stream waits are bounded; there are no automatic provider retries.
- The broker rejects authenticated hint requests when their authorization hook is
  missing. Existing ownership, language and active-practice restrictions remain.

## Validation

- `npm run check`: 530 Node tests passed, 94 opt-in tests skipped; content integrity,
  28 Python tests, TypeScript and Vite build passed. Existing bundle-size warning.
- 37 mocked hint/voice HTTP and message tests passed, including safe errors,
  future-clue regressions, deadlines and fail-closed authorization.
- 32 mocked writing endpoint tests passed, including both modes' grammar guidance
  instructions and preservation of successful explanatory feedback.
- Sentence tools passed at 320x640, 390x844, 844x390 and 1024x768: icon/gap access,
  portal geometry, unchanged layout, safe failed hint, accepted grammar feedback,
  keyboard/Next handling and stale-response cancellation.
- The integrated written-sentence helper passed four sizes with disabled and
  simulated active voice, 200% text, IME, pointer-gap traversal, Escape/touch,
  cancellation and provider-failure preservation. Both verb modes passed their
  browser regression at all four sizes. These automated transports were mocked;
  no physical microphone or real model correction was exercised by them.
- `git diff --check` passed. Screenshots were visually reviewed.

## Local observation

The development server was restarted to load the changed server prompts. The
authenticated page retained the incomplete future-tense draft. Its hint request
showed access denial. A read-only database check found Verb as the active practice
and Sentence still open but inactive. Re-entering Sentence through the catalog
restored its saved draft and active practice without changing access policy.

The normal application's automatic hint flow then returned an actual provider
hint about the omitted location, shown below the missing-text marker. This is one
observed live hint, separate from the mocked automated tests; it does not establish
general model quality, successful-example coaching quality or voice accuracy.
The earlier screenshot's exact error cannot be reconstructed from its generic
message. No tutor call was started.

- Live UI: `/tmp/lang-lessons-sentence-hint-refined-live.png`
- Mocked accepted grammar: `/tmp/lang-lessons-sentence-tools-mobile.png`
- Mocked error tooltip: `/tmp/lang-lessons-sentence-error-tooltip-mobile.png`
