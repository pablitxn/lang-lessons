# Integration checkpoint evidence — 2026-10-16

Code tested: `82ec55d48da5d3d9922e799486457bdb9f8fb94a` on
`integration/en-roadmap-local`. This receipt is a subsequent documentation-only
commit. [Draft PR #5](https://github.com/pablitxn/lang-lessons/pull/5) targets frozen
foundation `fd1678b93b3a55166fd8492bea307e6191e9a7dd`; no GitHub merge occurred.

## Validation

| Evidence | Result and limit |
| --- | --- |
| Final `npm test` | 97 tests: 95 pass, zero fail, two opt-in browser tests skipped in this command. |
| Final focused controller/session tests | 20 pass, including pending generation, independent holds, stale events, cancellation, explicit restart and idle offline status. |
| Final `npm run build` | Strict TypeScript and Vite production build pass. |
| Combined `npm run check` at preceding `14a95bcae448af6feaa67691562a8e2ec5fb0701` | 94 Node pass, two opt-in skips; content integrity; 21 Python mutation tests; strict build pass. Final code adds the focused idle-session fix and test above. |
| Content integrity | Exact 25 verbs, 17 authored prompts, 69 authored oracle cases, 25 local original SVG assets. Authored oracles do not prove runtime language assessment. |
| Root browser helper at `14a95bc` | Eight successful Chromium runs: dev 5174 and production preview 4174 at 320×640, 390×844, 844×390, 1024×768. Routes, reload/history, preferences, persistence/reset, mock start/mute/stop, session preservation and reflow pass; zero page errors/external requests. |
| Integrated sentence practice helper at `14a95bc` | Eight runs at those ports/viewports. Actual root, sentence feature, controller and mock adapter: staged translation/explanation, question hold, preferences preserve evidence, manual Next, no history persistence, reflow; zero page errors/external requests. |
| Owned UI browser fixture | Separately opted in; four viewports pass debounce/deduplication, grapheme colors, IME/help state, focus restoration, question draft, sequence and 200% text reflow. |
| Owned sentence browser fixture | Separately opted in; four viewports pass staged feature/controller/UI behavior, alternatives, spoiler display envelope and cleanup. Transport and verdicts explicitly simulated. |
| Protocol tests | Injected JSON/audio-item fixtures: request correlation, unavailable/uncertain audio, stale generations/revisions, independent results, hint cancellation, lexical withholding, late speech events, accepted translation memory, generation versus playback completion and conversation after lesson acceptance. |
| Browser transport lifecycle tests | Injected media/peer/audio/fetch: late permission results, abort, mute, disabled broker, peer failure, same-origin endpoint enforcement and idempotent cleanup. No real microphone. |
| Broker tests | Real loopback HTTP with injected upstream fetch/fake key: disabled default, host/origin/content/size validation, SDP exchange, redaction and conservative single-session lease. No real upstream request. |
| Hosted workflow query | No PR-triggered workflow runs at `14a95bc`; no CI configuration was added. This is not a green hosted check claim. |
| Identity and engineering checks | Atlas guard accepted command-scoped author/committer; remote `14a95bc` author and committer resolve to `pablitxn`. English scoped Conventional Commits and five-section PR body checked. Bounded tracked-text audit returned zero candidates across 116 files before this receipt; intentional Spanish curriculum remains localized data. |

Browser tooling used the environment's supplied Playwright and `/usr/bin/chromium`
with writable temporary profile directories. No TLS bypass, browser installation,
physical-device claim or real-provider claim. Screenshot inspected at
`/tmp/lang-lessons-integrated.png`; it is supporting rendering evidence, not a
committed product artifact. The final idle-message correction was checked with
focused behavior tests and a fresh production build.

## Reproduction and scope

Use the README commands. Final temporary logs are
`/tmp/lang-lessons-final-tests.log`, `/tmp/lang-lessons-validated-check.log`,
`/tmp/lang-lessons-validated-browser.log` and
`/tmp/lang-lessons-validated-practice.log`. Environment logs are ephemeral; this
receipt records their relevant outcomes. Dev and built-preview loopback listeners
may still be running on 5174/4174. No enabled voice broker was started.

Shared/runtime ownership and imported feature commits are in
[the integration intake](../atlas-intake-integration.md). Canonical Atlas and
stored credentials/identity were not edited. Foundation, content and UI branches
remain unchanged by this executor; sentence owner updates were incorporated by
ordinary additive merges into the integration branch.

## Remaining work

The two verb routes retain honest integration placeholders until EN-WP-05's branch
is available. Compose its exported feature entry points through the existing
root renderer and rerun combined checks and actual root practice scenarios.

Real provider authorization, credentials, budget, account/model availability,
physical mobile microphone testing, acoustic/linguistic calibration, latency,
retention/cost verification and semantic no-spoiler evaluation remain outside this
checkpoint. The lexical guard and sentence display envelope have documented
limits; authored mock acceptance never establishes those claims. Remote main
remains absent; the new-container provisioning failure cause is unproven.
