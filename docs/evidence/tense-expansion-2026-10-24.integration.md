# Tense expansion integration review

Status: `complete-clean` for the source-integration scope below. The previously
reported P2 direct-auxiliary hint finding is fixed and independently revalidated.
No remaining actionable integration regression was found in the reviewed patch.

Repository: `pablitxn/lang-lessons`.
Worktree: `/workspace/lang-lessons-exercises`.
Branch: `feat/tense-practice-expansion`.
Base: `b562273e1a45fd31bd23a523a6ca4ebc379f0030`.
Review target: uncommitted working-tree files pinned by SHA-256 below; a final
commit SHA is not yet available. The integrator must confirm these hashes at
commit time or request an applicability review for subsequent edits.

## Scope and conclusions

- Reviewed additive tense categories and JSON adaptation, both language guides,
  preferences labels, written tense group navigation, tutor instructions, written
  hint output screening, and associated inventory/behavior tests.
- Existing tense values and content identifiers remain usable. Settings and
  written snapshots derive accepted categories from the shared inventory and
  preserve the existing language boundary.
- Practice filters do not force the tense of a recognized alternate translation.
  Typed recognition remains client-reported evidence and does not certify oral
  completion or pronunciation.
- The Future picker group is reachable, with bounded navigation between unequal
  group lengths. Browser rendering verification remains with the test worker.
- No storage migration, credentials, dependency manifest, production, private
  instance MR, or infrastructure changes were needed in this reviewed scope.

## Resolved finding

The first review reproduced `Use will.` as HTTP 200 from the written hint handler
for `sentence-future-simple-bags`, using an injected fake provider. The corrected
`futureOrRecentFormula` guard rejects bounded will/shall and relevant venir +
de/d constructions after accent/punctuation normalization. Added regression
cases cover direct forms and a typographic elision.

Independent after-fix endpoint reproductions both returned HTTP 502 with the
generic unavailable response: `Use will.` for the future-simple prompt and
`Usa vient d’ouvrir.` for a new French passe-recent prompt. Only loopback HTTP
and an injected local fake provider were used.

## Executed validation

`node --import tsx --test tests/sentence-hints-server.test.ts tests/french-voice.test.ts tests/voice-protocol.test.ts tests/settings.test.ts tests/french-settings.test.ts tests/tense-expansion.test.ts`

Result: 66 passed, zero failed/skipped. The expansion tests exercise all 198
language/tense/difficulty cells, exact original-record hashes, same-normalized
answer category consistency, selection, written serialization/restoration, and
language filtering. Test log: `/tmp/tense-integration-review-final-tests.log`.

## Limits

This is an independent code review with targeted unit/HTTP tests, not an
exhaustive linguistic assessment, security audit, physical-device acceptance,
real provider/audio evaluation, PostgreSQL test, CI attestation, or deployment
verification. The lexical hint filter remains conservative and heuristic;
passing its tests does not prove semantic no-spoiler completeness. The separate
pedagogy worker reviews the new authored sentences. Full-check/browser results
belong to their executing workers and are not claimed as independent runs here.
No review task action was denied, pending approval, or left with an uncertain
external outcome. Repository contents were not edited by this reviewer.

## Reviewed file hashes

| File | SHA-256 |
| --- | --- |
| `src/contracts/curriculum.ts` | `b03fdf083f3c9996c89e5383b62b8d500512bd658d6af00a278fd0555f6b9565` |
| `src/content/index.ts` | `2140c5cb5b46596519f193f92fea61e54a34a5713a3f2d7963bc828047d577bf` |
| `src/content/tense-guide.ts` | `55ee4fa5b98e55cf48c12c371b00b43bcb5873a01ca7c293491c2e9e50edbbfd` |
| `src/features/sentences/WrittenTense.tsx` | `25dc73fc0610ddcb43ca6193956bee04491b786053121be490e7f26b6bfa8cce` |
| `src/app/Preferences.tsx` | `52e18da79c3663a76023ca5e622921137bf771768fb0c12bae1b57f325b5e9d1` |
| `src/voice/protocol.ts` | `785b8b5c6de256d77a06540e8d5a7e05093f5372710db5e3b4a6ce1afa01b03a` |
| `server/sentence-hints.ts` | `1964432fd68e2f29661e6f5d772322b2b89f08760c0e28d18d3ab4e7cbf907c0` |
| `tests/sentence-hints-server.test.ts` | `ee6fc83dadcfa7d4ba312b6985a41bb5a8c5994730d4e2b15caad8ab0eb5f386` |
| `tests/tense-expansion.test.ts` | `4f19015dd277b9a3d6ffdff77c215e5181f5f2f48552f559c8af7dd9d25e30d4` |
| `tests/past-tenses.test.ts` | `a29a800ac6c8f602ce43806819bd69beee84763754783705456be8f852b15795` |
| `tests/content.test.ts` | `0c59bdc21e0d03205ce0f44610969993f902a938b1a425f964bd512492330e93` |
| `tests/french-content.test.ts` | `7f5c2395e2985524ce80d189fa9a3c60869018ac1a7984857415bf9655a3523c` |
| `scripts/smoke-tense-expansion.cjs` | `5630639305e504e70c4620c1c33585c6b381af001e9710898d1c18bc121a6f4e` |
| `content/en-wp-03/check_content.py` | `84099ee6bad8b5bf01edcb5caf44fe1a63d7dab9dcab18da696e3887d0d0d683` |
| `content/en-wp-03/tests/test_content.py` | `546a6a9561a545aac8a6dd3c85353ffdf9f0c0a1e1eee66222bdc28a980ccefa` |

Reviewer identity: `/root/integration_review`; inherited model configuration, exact model/usage receipt not exposed.
