# French parity contract

Base source: `6347dd4c08ff487d0933dc7c06da9139c7f9fddd`. The October 24 request
adds French to Lang Lessons with Spanish as the base teaching language. It
preserves the existing English curriculum, data and provider-evidence boundaries.

| Existing capability | French implementation |
| --- | --- |
| Picture and visible-word verb practice | Separate 25-verb curriculum; infinitive, present je/j’, past participle |
| Real photographs, expansion, preload and history | Reviewed local photograph reuse with French contextual cues and provenance |
| Typed form checks and sound help | Accent-sensitive NFC comparison, IPA and Spanish pronunciation guidance |
| Oral meaning, pronunciation and original sentences | French-specific rubric, independent audio evidence, stale-attempt rejection |
| Reference and completion dictionary | Full present conjugation, auxiliary/agreement notes, attributed French entries |
| Sentence translation, tense and explanation | Six French constructions, Spanish prompts, all nine difficulty pairs per construction |
| Written hints and tutor | Spanish coaching, canonical session language and no-answer-leak policy |
| Account preferences | Persistent learningLanguage, legacy English default and field-level offline merging |
| Drafts, photos and progress | Canonical account + mode + language sessions; existing IndexedDB scope retained |
| Professor views and feedback | Language attribution on sessions/results and Spanish French feedback |

## Compatibility and lifecycle

The additive `2026-10-24-learning-language` migration adds a constrained language
column and an index. Existing rows default to `en`; no historical progress is
rewritten. English operation fingerprints remain valid. Language joins selection,
replay verification and outstanding-call checks. There remains one current
practice pointer per account. Switching languages must use the root save/exit
guard before mounting another canonical session. A synced preference cannot
reinterpret a mounted exercise.

French content identifiers start with `fr-`; obligation identifiers use
`infinitive` and `present` instead of English `base` and `past`. The shared
`participle` obligation remains scoped to its canonical session. Snapshot parsing
requires the exact corresponding form keys; feature restoration verifies content
and photograph membership. Text feedback never certifies oral pronunciation.

Once French sessions exist, a runtime without language partitioning is not a safe
rollback target: it could select them as English. Prefer a forward fix or a
reviewed language-aware rollback; do not delete or relabel learner history.

## Verification

Run `npm run check` for behavior, content, type and production build checks.
Run `node scripts/smoke-french.cjs 5184` against a running app with the supplied
Playwright/Chrome tooling. The browser helper exercises actual rendering with
simulated authenticated service responses and no provider allocation. Real SQL
integration tests use an explicitly disposable PostgreSQL database through
`P2_DISPOSABLE_DATABASE_URL`; production data must never be their target.

Real microphone/provider quality and physical-device pronunciation calibration
are separate from simulated transport and browser rendering. Publication and
runtime acceptance require their own exact revision/image receipts.
