# Sentence audio capture-stage correction

Branch: `integration/en-roadmap-local`, [draft PR #5](https://github.com/pablitxn/lang-lessons/pull/5).
Application fix: `351c20aa5316c2f1c32b4d70338760fc7dae11e6`.
Browser fixture correction: `24c779963d305c578cebf130ac14c892799ba611`.
The following receipt commit changes documentation only.

## Reproduction and behavior

Independent review of `1427866ec0d6baabf7b94df8905a72bc84ee77f4` found that
audio begun in translation could acquire explanation obligations when its final
transcript arrived after another response completed translation. The integrated
session/runtime/protocol regression first failed: delayed B was assigned `tense`,
`structure` and `meaning-fit` instead of zero obligations.

The regression now exercises this exact sequence: A is submitted for translation;
B starts and stops while A remains pending; A is accepted; B's final transcript
arrives. B remains conversational, creates no explanation evidence and releases
only its own transcription hold. A new C begun during explanation can satisfy
the three explanation obligations. The exercise never skips that stage.

The protocol records the stage and an internal transition epoch at audio capture.
Final sentence transcripts include an adapter-owned `sentenceScope` receipt.
Missing, mismatched or invalidated receipts cannot allocate feature attempts.
The protocol separately rejects assessment refs for invalid captures before
making a model request; it does not let them supersede a valid pending attempt.
Zero-ref conversational handling remains available. Duplicate speech-start events
retain the original capture, and returning to translation does not reactivate old
audio. The deterministic mock adapter follows the same boundary.

Same-exercise stage changes still preserve outstanding transcription holds and
their timeout. No transcription is discarded merely because translation was
accepted. These changes complement the previous review fixes documented in
[the preceding receipt](integration-review-2026-10-16.md).

## Executed validation

| Check | Result |
| --- | --- |
| `npm run check` | 126 Node tests: 123 pass, zero failures, three opt-in browser skips. Content integrity, 21 Python mutation tests, strict TypeScript and production build pass. |
| Added behavioral regressions | Integrated delayed B race; protocol stage transition and return cycle with duplicate starts and fresh-request preservation; missing capture receipt/replay; mock return cycle. All five pass in the combined check. |
| Optional browser suites together | All three suites pass, covering 16 UI/feature viewport/mode cases with injected verdicts. |
| `node scripts/smoke-practice.cjs 5174 4174` | 24 root cases pass across three modes, four viewports and dev/built preview, with zero page errors or external requests. |
| Hosted CI | No PR-triggered workflow runs returned for the application fix; local results are not hosted checks. |

The first optional-browser run passed sentence/UI suites but failed the verb
fixture with `clock.pauseAt: Cannot fast-forward to the past`. Its timestamp came
from a browser `Date.now()` plus 10 ms and could expire before the next tool
round trip under concurrent load. The verb/UI/root helpers now install a known
clock and freeze it before navigation. The combined optional suites and root
suite were rerun successfully. No production behavior changed for this fixture
correction. The earlier root run also passed all 24 cases.

Supporting temporary logs: `/tmp/lang-lessons-stage-race-reproduction.log`,
`/tmp/lang-lessons-stage-final-check.log`,
`/tmp/lang-lessons-stage-owned-browser.log` (fixture failure),
`/tmp/lang-lessons-stage-owned-browser-final.log`,
`/tmp/lang-lessons-stage-root-browser.log`, and
`/tmp/lang-lessons-stage-root-browser-final.log`.

## Ownership and evidence limits

EN-WP-01 changed shared voice contracts, protocol and mock adapter. The parent
explicitly authorized the narrow sentence-session correction on this integration
branch; its fixture and associated tests were updated to carry capture receipts.
Browser helpers changed only clock setup. Producer branches, canonical Atlas
documents, credentials, identity configuration and provider configuration remain
unchanged. The coordinator owns final Atlas/Notion reconciliation through
[the intake](../atlas-intake-integration.md).

The race test uses the actual local session/runtime/protocol with injected audio
events and verdicts; it uses no microphone, network or provider. Chromium checks
exercise real rendering and deterministic mock interactions. These are not
real-voice, semantic model-quality or physical-device evidence. Live voice/model
and subscription tests remain explicitly deferred to the user's next session.
All prior credential, budget, acoustic, latency, physical mobile/accessibility,
provider retention/cost and audible-coaching checks remain open. No paid call,
deployment, main/default change, force push or GitHub PR merge occurred.
