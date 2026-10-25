# Coherent written translation review

Date: 2026-10-25. Local, uncommitted work on `codex/exercise-feedback`; base and
HEAD are `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. No PR, push or deployment is
claimed. Existing exercise work and concurrent voice-readiness changes remain.

## Problem and result

The valid draft `Tomorrow at this time, the kids will be playing in the yard.`
was compared literally with an authored alternative. The UI marked its reordered
time phrase and synonym as errors and invented an omission, while an independent
model hint correctly praised the translation. The two outputs could disagree.

Authored matches still complete locally. Other drafts now remain neutral until
one structured review determines acceptance, concrete issues, or uncertainty.
Only genuine, validated issue excerpts are highlighted, with a separate hint for
each. Omissions anchor an existing incomplete phrase, such as `in the`; they do
not produce guessed reference insertions. Pending and failed review stays neutral.

Accepted variants unlock the learner's actual tense exercise and optional example
writing. After a correct tense choice, the grammar card shows the learner's exact
sentence and the reviewed explanation. No authored alternative is fabricated.
Progress display follows this transient state, including edit/reset behavior.

The shared parser rejects contradictory verdicts, cross-language tenses, oversized
fields, ambiguous/repeated excerpts, overlapping spans and split words/graphemes.
Request/cache scoping includes full exercise identity, language and exact draft;
edits, IME and replacements remove stale output. Existing authorization, limits,
deadline handling and hint spoiler guards remain. One request supplies the review;
there are no automatic paid retries or extra per-word model calls.

## Validation

- `npm run check`: 544 Node tests passed, 95 opt-in tests skipped; content integrity,
  28 Python tests, TypeScript and Vite build passed. Existing bundle-size warning.
- 46 targeted mocked hint/voice tests passed, including structured verdicts,
  the reported variant, an incomplete location, actual-tense differences and French.
- Seven parser/render regressions passed: neutral reference mismatch, accepted
  variant, genuine issues, omission anchors, malformed review and exact text.
- New semantic browser suite passed English at 390x844 and 1024x768, French at
  390x844, and disabled help at 390x844. It checks the exact reported draft, genuine
  grammar/missing-place issues, distinct and identical per-issue hints, actual tense,
  transient Progress wording, cached-draft resets, and late responses across edits
  and new exercise identities even when the sentence and draft repeat.
- Sentence tools passed four viewport sizes. The integrated written-sentence
  helper passed four sizes with disabled and simulated active voice, 200% text,
  keyboard, touch, IME and cancellation. Keyboard navigation passed all three modes.
  Automated provider transport was mocked; no physical audio was evaluated.
- Independent scoped review found and resolved duplicate-hint accessible selection
  and transient tense Progress wording. `git diff --check` passed.
- A supplemental review of optional Verb writing found a stalled-authorization
  slot leak. Authorization now races cancellation like Sentence rewriting. Nineteen
  focused mocked tests passed, including slot recovery after deadline/disconnect
  before authorization settles, and no late provider dispatch. The final complete
  check above includes this repair.

## Live observation

After the local server restart, Sentence restored the user's exact saved draft.
The application's normal provider review accepted it: the live UI showed one green
sentence with no red spans or omission marker, the tense chooser and optional
examples. The user's answer was not edited and the tutor remained stopped. This
single observed real review is separate from mocked regression evidence; it does
not establish general linguistic quality or oral assessment accuracy.

- Live acceptance: `/tmp/lang-lessons-translation-accepted-live.png`
- Mocked accepted tense/grammar: `/tmp/lang-lessons-reviewed-future-mobile.png`
- Mocked targeted omission: `/tmp/lang-lessons-reviewed-missing-place-mobile.png`

## Persistence boundary

Model acceptance and tense selection are intentionally transient. Existing v1
written snapshots recompute authored matching and remain unchanged: an unmatched
reference remains uncertain in durable written evidence. Reloading can request a
fresh review. No reviewed result creates durable model grades, oral evidence or
completion. Persisting reviewed grades requires a separate versioned design.
