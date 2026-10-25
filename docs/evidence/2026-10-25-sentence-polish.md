# Sentence tooltip, rewrite layout and dictionary corrections

Date: 2026-10-25. Local working-tree evidence on `codex/exercise-feedback`,
based on `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. No commit, publication or
deployment is claimed. Earlier exercise changes and concurrent voice-readiness
work were preserved. This receipt records the follow-up to the earlier
`2026-10-25-sentence-tools.md` implementation.

## Delivered behavior

- Sentence help and both verb exercises use the extracted `InfoTooltip`.
  Hover, keyboard focus, tap, Escape, outside dismissal and presentation holds
  retain the verb control's behavior. Help floats above the information icon,
  constrained by the viewport and clipping ancestor, without resizing the cue
  or covering the answer input. Sentence error triggers and Alt+Down reuse it.
- The dictionary toggle aligns with the right edge of the exercise and Next
  button. The extra dictionary instruction paragraph was removed.
- The rewrite section is named **Reescribir frase**. The optional badge,
  subtitle and visible field guidance were removed; the accessible field label
  remains. `WritingLineField` provides an underline-style, growing textarea.
  The submit button says **Corregir**, without an arrow.
- `CharacterCount` is hidden below 800, neutral at 800–899, orange at 900–949
  and red from 950. The 1,000-character limit and explicit model submission
  remain enforced.

## Dictionary failure analysis

Two independent failures were reproduced:

1. Wiktionary places `Translingual` groups before English senses for words
   including `my`, `I` and `it`. The original parser rejected the whole response.
   It now validates the response structure and selects the requested language.
2. Authenticated dictionary requests reused the paid-rewrite authorization hook,
   so another browser tab changing the active practice pointer caused HTTP 403.
   The separate `authorizeWordDictionary` hook validates account permissions,
   ownership, an open Sentence session and matching language, while allowing
   reference reading from another owned open tab. Paid rewriting still requires
   the active practice pointer. Dictionary reading grants no model budget and
   does not write progress, change the pointer or create oral evidence.

## Validation

- Final `npm run check`: 507 Node tests passed, 94 opt-in tests skipped;
  28 Python tests, content integrity, TypeScript and Vite build passed.
  The existing bundle-size warning remains.
- Thirteen focused dictionary HTTP tests passed, including mixed-language
  groups and the separate authorization hook without fallback to rewriting.
- Dictionary and Sentence-rewrite authorization suites separately passed
  against actual disposable PostgreSQL: two tests, zero skips. They verified
  inactive owned-session dictionary access, owner/language/mode/status/account
  denials, unchanged active-pointer requirements for paid rewriting, and no
  pointer or evidence mutations. A temporary container used a cached image and
  an ephemeral loopback port; it was removed after the run. The application
  database and configuration were untouched.
- Sentence rewrite browser tests passed four viewport sizes, exact character
  thresholds, growth/shrink, the maximum length, explicit dispatch, IME,
  errors and stale-response cancellation.
- Sentence tools and existing Sentence browser suites passed four viewport
  sizes, including no-reflow tooltip geometry, dictionary alignment and
  one-click Next during pending help.
- Existing verb suites passed both modes at four sizes and 200% text. P5
  dictionary rendering and attribution checks passed.
- The supplied written-Sentence browser helper passed eight viewport/call-state
  cases, tense selection, hint races, keyboard behavior and touch checks.
- `git diff --check` passed. Browser model transport was intercepted; no paid
  inference, microphone or physical-device validation was performed.

## Live local observation

The local stack was restarted with its existing saved configuration. The
authenticated Sentence lesson retained the homework translation and tense.
Selecting `my` displayed its real Wiktionary determiner definition and example.
The isolated route was also verified against ten live public dictionary lookups
in English and French. Those requests used no model inference.

The actual app showed the shared floating help, right-aligned dictionary toggle,
compact rewrite field, hidden empty counter and **Corregir** button. The tutor
remained stopped, and no rewrite was submitted to a real model.

Screenshots:

- `/tmp/lang-lessons-sentence-dictionary-fixed.png`: authenticated `my` lookup.
- `/tmp/lang-lessons-sentence-polish-live.png`: compact rewrite UI.
- `/tmp/lang-lessons-sentence-tooltip-live.png`: shared floating tooltip.
- `/tmp/lang-lessons-sentence-tools-mobile.png`: integrated fixture with
  explicitly mocked dictionary/model transport.
