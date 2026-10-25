# Voice availability and local startup

Date: 2026-10-24. Base: `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`.
Scope: local startup configuration and read-only voice diagnosis. This receipt
does not establish a successful provider call or microphone/audio acceptance.

## Findings and change

The previous local launcher always supplied `ALLOW_PAID_VOICE=0` unless started
with `--voice`. That process variable overrode saved env-file configuration.
The previous `npm run dev` started only Vite, and `dev:voice` did not load the
credential file. These defaults made local voice availability depend on special
startup commands.

The launcher now honors inherited or saved configuration. Explicit `--voice`
and `--no-voice` flags override it for one run. The broker loads the optional
account env file followed by `.env.local`; inherited variables retain Node's
normal precedence. The frontend does not receive the inherited provider key.
`npm run dev` starts both processes; `dev:frontend` preserves frontend-only use.
The credential example enables availability once a server key is configured.
The broker still requires both the explicit enable flag and a key. Browsing,
readiness checks and opening an exercise never start a paid voice call.

The inspected running local environment had already been started with `--voice`,
and its actual student exercise showed an enabled Start tutor button. This
supersedes any assumption that its current process was disabled. The saved local
configuration was updated without replacing its credential, and the environment
was restarted successfully using only `npm run dev`.

Read-only production inspection found voice enabled, a configured server key and
an accepted model-catalog request listing the configured realtime/transcription
models. The inspected readiness/authentication source matched the local base.
Administrator access to voice returns 403 because calls require student practice
permission. A current authenticated production student and an actual call remain
unverified; these observations do not establish the cause of a student's reported
production failure. No production configuration, accounts or permissions changed.

## Verification

- `npm ci --cache /tmp/lang-lessons-npm-cache`: passed in the isolated worktree.
- `npm run check`: passed; 456 Node tests passed, 88 optional tests skipped;
  28 Python/content tests, curriculum integrity, strict TypeScript and Vite build
  passed. The existing large-bundle warning remains.
- Actual launcher subprocesses with an explicit fixture key: saved enablement,
  explicit disablement, saved disablement, explicit enablement and missing key
  returned the expected readiness result. Conflicting flags were rejected.
  Checks requested status only and did not request microphone or provider calls.
- Independent patch review: no blocking findings in flag/env precedence, secret
  handling, browser-helper compatibility or the scripts-only manifest change.
- Supplied `npm run test:browser -- 5174`: passed all four viewports with mocked
  HTTP/media and no page errors or external requests. A focused Chromium check
  verified enabled readiness before media/session allocation, an explicit
  simulated connection and hangup/track cleanup.
- The supplied `smoke-practice.cjs` failed its 200% text layout assertion on both
  the original and isolated trees. Its lifecycle-only variant also contains an
  outdated expectation that grammar/vocabulary level three has no prompt. These
  failures were preserved rather than changing unrelated layout/curriculum work.
- The actual local student browser showed `Start tutor` enabled after the normal
  restart. It did not request microphone access or start a provider session.
- `node --check scripts/dev-local.mjs` and `git diff --check`: passed.

Browser rendering and transport fixtures are recorded separately from physical
devices, real provider responses, billing/quota and actual speech assessment.
