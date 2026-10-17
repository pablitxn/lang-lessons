# Independent-review corrections and final local readiness

Application code tested: `c030b172e657429dec183bd1853fe1f47090f729` on
`integration/en-roadmap-local`, [draft PR #5](https://github.com/pablitxn/lang-lessons/pull/5).
The following receipt commit changes documentation only. All three routes remain
composed from the original producer modules; their branches are unchanged.

## Reproduced defects and corrections

Independent review of `7d31ed21cfdfb1bc88ec633267860ffb839e7438` supplied three
actionable findings. New deterministic tests first reproduced all three failures
(24 pass, three fail in that focused reproduction run):

1. After speech stopped, a four-second delayed question allowed the completed
   verb to advance before its transcript arrived. `transcription-pending` now
   independently holds completion until each final transcript is delivered.
   Out-of-order/duplicate finals release only the corresponding hold. A
   20-second post-speech timeout fails into a connection error and preserves the
   exercise; it does not enable advancement. Replacement/disposal/provider error
   clear timers. Same-exercise sentence stage changes retain outstanding audio.
2. A reserved second utterance disappeared when the first assessment accepted
   every oral target. The verb queue now forwards that turn as conversation with
   zero assessment refs. An unclear queued turn asks for clarification instead.
   Reservations still prevent duplicate root fallback requests, and Stop cancels
   unsubmitted work without automatic replay.
3. `Start with I have.` was withheld/replaced on screen yet could create a speech
   response. Sentence display and provider speech now share
   `src/assessment/coaching-policy.ts`. Rejected pre-translation hints, question
   responses and assessment coaching create no speech request. Reviewed allowed
   prompts are checked positively too. This is deliberately a strict prompt
   envelope before translation acceptance, not unrestricted model coaching.

Parent explicitly authorized the narrow integration-branch changes to verb and
sentence session files. Shared controller/protocol/contract changes remain under
integration ownership. No producer branch was pushed or rewritten.

## Final executed validation

| Check | Result |
| --- | --- |
| `npm run check` | 121 Node tests: 118 pass, zero fail, three opt-in browser tests skipped in that command. Content integrity, 21 Python mutation tests, strict TypeScript and production build pass. |
| Focused final protocol/runtime suite | 32 pass, including all reproduced review defects, transcription timeout, same-exercise stage transitions, replacement/error cleanup, duplicate/out-of-order transcripts, queued uncertainty and positive/negative shared coaching decisions. |
| `UX_BROWSER=1 SENTENCES_BROWSER=1 VERBS_BROWSER=1 node --import tsx --test tests/ux-browser.test.ts tests/sentences-browser.test.ts tests/verbs-browser.test.ts` | All three suites pass together: 16 viewport/mode cases. Actual rendered UI/features, simulated verdicts and controlled timers. |
| `node scripts/smoke-practice.cjs 5174 4174` | All 24 root-app cases pass after the review fixes: three modes, four viewports, dev and built preview. Zero page errors or external requests. |
| Root shell/settings smoke | Eight passes at the preceding all-mode checkpoint; unchanged shell/routing/settings code. Final root suite also verifies preferences preserve current work and route replacement cancels pending work. |
| Rendering | Mobile and desktop screenshots inspected in the preceding all-mode check; the final suite regenerated screenshots with unchanged layout/styles and no reflow failures. |
| Hosted CI | No PR-triggered workflow runs were returned for the application checkpoints; no hosted CI workflow was installed. Local tests are not presented as hosted checks. |

The initial concurrent optional-browser run exposed a separate fixture failure:
the help-expiration assertion observed one remaining offer instead of zero. The
test had installed a controlled clock after app timers already existed. It now
installs the clock before navigation and advances it consistently. The complete
concurrent suite then passed. No production UI behavior was changed to satisfy
that assertion; this failure is recorded rather than omitted.

Root cases exercise independent spelling/oral evidence, typing debounce and IME,
opt-in sound help without autofill, uncertain audio fixtures, question/draft/helper
holds, modal Stop/restart, the complete 1,800ms quiet interval, no immediate verb
repeat, cleared new drafts, route cancellation and sentence translation followed
by explanation and manual Next. Runtime/protocol fixtures inject audio-item
references and provider JSON; they do not access a microphone or provider.

Temporary supporting logs: `/tmp/lang-lessons-review-reproduction.log`,
`/tmp/lang-lessons-review-focused.log`, `/tmp/lang-lessons-review-final-check.log`,
`/tmp/lang-lessons-all-owned-browser.log` (initial fixture failure),
`/tmp/lang-lessons-reviewed-owned-browser.log` (passing rerun), and
`/tmp/lang-lessons-review-final-practice.log` (24 final root passes).

## Readiness and remaining manual checks

Deterministic local practice is ready for independent review. Exact startup and
preview commands are in the [README](../../README.md) and
[all-mode receipt](integration-all-modes-2026-10-16.md#startup). Use Mock mode;
no key or voice broker is needed. Dev/preview remain loopback-only.

Per the user's latest direction, real voice/model API and subscription testing
is deferred until the next session. Remaining checks include provider credentials,
authorization/budget/model availability, actual microphone/permission interruption,
acoustic and linguistic quality, latency, physical mobile/screen-reader behavior,
provider retention/costs, and semantic/audible adherence to approved coaching.
The pre-translation prompt envelope limits free-form coaching and needs explicit
review before relaxing it. No paid call, deployment, security/credential change,
main/default change, force push or GitHub PR merge occurred.

The platform's reported 22:54 UTC environment disconnect did not prevent subsequent
execution. Shell commands, completed browser jobs, and successful Git pushes are
confirmed; a 22:57:51 UTC read-only check verified matching local/remote head and
the unchanged producer branch. No underlying transport error was exposed to this
executor, so neither cause nor automatic reconnection mechanism is claimed.

Canonical Atlas and Notion updates remain with the coordinator. The committed
[intake](../atlas-intake-integration.md) contains ownership, imported revisions,
review corrections and evidence limits for that reconciliation.
