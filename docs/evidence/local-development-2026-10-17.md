# Local development setup verification

Date: 2026-10-17. Task: local development and project credential preparation.
Base: `57db399d8ea5ee800b915390622a73f10a9cd8c2`.
Branch: `codex/local-development-setup`. This receipt describes uncommitted local
changes; it does not establish publication, CI, merge or deployment.

## Scope

- Added a local launcher for Vite and the loopback broker, with explicit live-voice
  opt-in, occupied-port checks and coordinated process cleanup.
- Added a credential-variable example and corrected local setup/browser guidance.
- Preserved manifests, lockfile, routes, global styles, contracts and lesson code.
- Installed the existing locked dependencies with `npm ci` on macOS; Node 26.10.0,
  npm 11.19.1 and Python 3.14.7 were observed. No runtime pins were changed.
- A dedicated OpenAI project and key were created through separately authorized
  account setup. Credential values and account identifiers are excluded here.

## Checks and observed results

| Check | Result |
| --- | --- |
| `npm ci --cache /tmp/lang-lessons-npm-cache` | Passed; 30 packages added, audit reported zero vulnerabilities. |
| `npm run check` | Passed; 123 Node tests passed, three opt-in browser fixtures skipped, 21 Python tests passed, curriculum integrity and TypeScript/Vite build passed. |
| `npm run test:browser -- 5174` | Passed at 320x640, 390x844, 844x390 and 1024x768 using the supplied Playwright package and installed Google Chrome. |
| `node scripts/smoke-practice.cjs 5174` | Passed all three actual practice flows at all four viewports; explicit mock outcomes, no external requests. |
| `node --check scripts/dev-local.mjs` | Passed. |
| Local `/api/realtime/status` through Vite | Returned `enabled: false` and `maxDurationSeconds: 600`. |
| Local session POST with paid voice disabled | Returned HTTP 503 before any provider request. |
| Duplicate launcher on occupied ports | Exited with an actionable error; preserved the existing listeners. |
| Inherited `ALLOW_PAID_VOICE=1` without `--voice` | Still reported disabled through the actual broker/proxy. |
| SIGINT to launcher | Exited zero and released both ports. |
| Frontend process terminated | Launcher stopped the broker and released both ports. |
| Secret handling | Local env file ignored by Git with restricted permissions; exact credential absent from generated build and check log. |
| Read-only OpenAI model catalog | New key accepted; configured `gpt-realtime-2.1` and `gpt-4o-mini-transcribe` both listed. No inference requested. |
| `git diff --check` | Passed. |

The restricted shell initially blocked npm DNS and loopback listeners. The same
installation and checks succeeded with approved network/loopback access. The
browser helpers used the environment-supplied Playwright through `NODE_PATH`,
with `CHROMIUM_EXECUTABLE_PATH` pointing to the existing macOS Google Chrome.
No browser was installed and no TLS checks were disabled.

## Current local workflow and limits

Run `node scripts/dev-local.mjs` from the repository root and open
`http://127.0.0.1:5174/`. The broker binds `127.0.0.1:8787`; Ctrl-C stops both.
For a deliberate live session, stop that launcher, run the same command with
`--voice`, select live voice in the app, consent to sharing audio and press Start.

Provider-side project spending was visibly set to USD 10 monthly with enforcement
enabled. Enforcement may allow a small overrun while propagating; see the
[official spend-limit guide](https://developers.openai.com/api/docs/guides/spend-limits).
The organization dashboard showed a negative prepaid credit balance during setup.
Key acceptance/model listing does not establish sufficient credit or live-session
success. No balance was topped up.

No real voice session, paid inference, microphone capture, physical device testing,
pronunciation calibration, provider retention validation or latency evaluation was
performed. Browser results are actual desktop rendering with simulated evidence.

## Credential-source amendment, 2026-10-17

The user subsequently authorized recreating the local key under Personal to use
that organization's existing credits. A dedicated `lang-lessons` project was
created there with an enforced USD 10 monthly project limit. Personal also has
an existing enforced USD 5 organization limit, shared across its projects; that
global limit was not changed. The dashboard showed USD 103.38 credit and USD 0.17
monthly organization spend at inspection.

The Platform picker confirmed a new `lang-lessons` key in the Personal project,
with a 90-day lifetime. After local destination approval, the secure helper
replaced `OPENAI_API_KEY` in the ignored `.env.local`. A read-only model-catalog
request accepted the new key and listed both configured voice models. The local
launcher was restarted to refresh the broker credential, with paid voice disabled.
No inference or microphone capture was requested. The earlier OrchidLabs key was
not revoked, and no other application's credentials were changed.

OpenAI's [Service Credit Terms](https://openai.com/policies/service-credit-terms/)
state that credits are non-transferable. [Project documentation](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)
states that personal API keys are scoped to a project and its resources. No
credits were transferred between organizations and no new credits were purchased.
