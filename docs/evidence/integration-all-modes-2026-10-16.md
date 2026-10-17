# All-mode integration evidence — 2026-10-16

Tested combined code: `7d31ed21cfdfb1bc88ec633267860ffb839e7438` on
`integration/en-roadmap-local`, [draft PR #5](https://github.com/pablitxn/lang-lessons/pull/5).
The subsequent commit updates documentation only. This receipt supersedes the
earlier receipt's pending verb integration item; it does not overwrite historical
evidence or imply that real-provider evaluation is complete.

## Imported feature and ownership

Verb [PR #6](https://github.com/pablitxn/lang-lessons/pull/6) was incorporated by
ordinary additive merge at its supplied head
`bb92fdd20e52a11016eeec130d69748dc14d1fc5`, containing feature commit
`37f288fcda5942a9c51e8988ec9b33f886ac17c8`, against integration base
`82ec55d48da5d3d9922e799486457bdb9f8fb94a`. No producer branch was changed.
The existing content/UI/sentence revisions and ownership remain as recorded in
[the coordinator intake](../atlas-intake-integration.md).

Integration changes are limited to root route composition, the shared session
runtime and its tests, root controls, the browser helper and integration docs.
Both verb routes import the producer's `VerbLesson`; no parallel feature
implementation or feature-file modification was introduced.

`claimUtterance(id)` reserves queued live audio in the same bounded set used by
the conversational fallback. It makes no model call. Both routes receive the
stable callback, so their deliberate live-assessment integration guard is
satisfied. Actual root lifecycle controls are also provided to the feature and
its modal reference sheet. Stopping or restarting invalidates any old fallback
microtask. No new shared evidence schema or dependency was required.

## Executed checks

| Check | Actual result |
| --- | --- |
| `npm run check` | 113 Node tests: 110 passed, zero failed, three optional browser tests skipped in this command. Content integrity, all 21 Python mutation tests, strict TypeScript and production build passed. |
| Runtime reservation tests | A held second utterance waits for the first result, then assesses only remaining obligations; neither produces an extra conversation call. Post-checklist speech receives one conversation request. Duplicate finals, uncertain audio and stop/restart do not cause duplicate or stale submissions. Real-mode fixture only; no microphone/network/model implementation. |
| `VERBS_BROWSER=1 node --import tsx --test tests/verbs-browser.test.ts` | Passed: both modes at four viewports, eight cases, using actual rendered feature/UI/controller with explicit fixture verdicts and controlled clocks. |
| `node scripts/smoke-practice.cjs 5174` | Passed all 12 root-app cases: three modes at 320×640, 390×844, 844×390 and 1024×768. Actual root/feature/controller/production mock adapter. |
| `node scripts/smoke-practice.cjs 4174` | Passed the same 12 root-app cases against the built production preview. |
| `npm run test:browser -- 5174 4174` | Passed eight route/settings/session smoke cases across both servers and four viewports. |
| Rendering inspection | Reviewed generated 390px image-verb and 1024px visible-verb/sentence screenshots. No clipping or horizontal overflow in the checked layouts. Verb flows also pass 200% text reflow. |
| Git/engineering checks | Whitespace check, command-scoped Atlas author/committer guard, scoped Conventional Commits and five-section English PR checks passed. No stored identity or credential changes. |

The root verb cases check three versus two spelling inputs, loaded local images,
neutral typing before debounce, real local spelling verdicts, opt-in help without
autofill, uncertainty, seven oral fixture acceptances surviving an unrelated edit,
IME deferral, focused-input holds, reference-sheet Stop/restart, preserved accepted
work, question and unfinished-draft holds, explicit pause, exactly the full quiet
interval before automatic next, no immediate repeat, cleared new drafts, and route
replacement while a spelling operation is pending. The root sentence cases check
translation before explanation, question hold, preferences preserving evidence,
manual Next and preference-only persistence. No external requests or page errors
were observed in these browser suites.

Browser tooling is the environment's supplied Playwright and `/usr/bin/chromium`,
with writable temporary profiles. No TLS bypass, browser install or physical
device was involved. Verb timer checks use a controlled browser clock. Oral
verdicts are explicit mock outcomes; they do not validate English, pronunciation,
model-generated hints or acoustic quality. The earlier UI/sentence owned browser
fixtures remain separately documented; this follow-up did not relabel those
historical runs as fresh checks.

Supporting ephemeral logs: `/tmp/lang-lessons-combined-check.log`,
`/tmp/lang-lessons-three-mode-browser.log`,
`/tmp/lang-lessons-three-mode-preview.log`,
`/tmp/lang-lessons-all-modes-shell.log`. Screenshots follow
`/tmp/lang-lessons-{verb-image,verb-visible,sentence}-{390,1024}.png`.
The committed receipt preserves conclusions even if temporary artifacts expire.

## Startup

From the saved Cloud workspace, first terminal:

```sh
cd /workspace/lang-lessons
npm ci --cache /tmp/lang-lessons-npm-cache
npm run dev
```

Open `http://127.0.0.1:5174/`, leave session mode on Mock, and press **Start mock
session**. No broker, key, microphone permission or paid call is needed. Use
**Mock response simulator** to choose oral outcomes for verbs; the sentence input
clearly labels its acceptance fixture. The README describes the three flows.

For validation and a separate preview terminal:

```sh
cd /workspace/lang-lessons
npm run check
npm run preview
```

Open `http://127.0.0.1:4174/`. With both servers running, use the browser commands
listed above. Dev/preview bind loopback with strict ports; inspect an occupied
listener rather than killing another task's process. Ctrl-C stops a server.
The existing local dev/preview listeners remained available at handoff.

## Remaining gates and environment status

There is no remaining feature-composition blocker for deterministic local use.
Real live-voice use still requires separately supplied authorization, credentials,
budget and model/account availability checks. Physical mobile microphone behavior,
permission interruption, acoustic and linguistic calibration, latency, exact
costs, retention/account controls and semantic/audible no-spoiler behavior remain
unverified. See [voice integration limits](../voice-integration.md).

The platform reported an environment disconnect around 22:54 UTC. Commands,
ongoing browser jobs and Git transport continued to execute successfully afterward;
the new code checkpoint was pushed before final documentation. No credential,
security or environment configuration repair was attempted. Remote main remains
absent and the separate provisioning root cause remains unproven. No GitHub PR
merge, force push, deployment, paid provider call or canonical Atlas edit occurred.
