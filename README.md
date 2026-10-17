# Lang Lessons

A voice-first English-learning app with three lesson types: picture-based
irregular verbs, visible-base irregular verbs, and Spanish-to-English sentences.
The home screen presents lesson cards. Selecting a lesson automatically connects
the voice coach when the local voice service is enabled. The lesson keeps compact
mute and pause/resume controls; progress and preferences open in modal dialogs.
Preferences use a section sidebar for Appearance, Voice, Learning and Storage,
with compact section navigation on small screens. They include system/light/dark
appearance, microphone permission and independent learning settings. Test adapters and simulated evidence are confined
to internal fixtures, never offered as an application mode.

## Local development

Requires Node >=22.12, npm and Python 3.10+. From this repository's root, install
exact dependencies and start the frontend plus the local voice broker:

```sh
npm ci --cache /tmp/lang-lessons-npm-cache
node scripts/dev-local.mjs
```

Open `http://127.0.0.1:5174/`. Choose Picture, Verb or Sentence to open a
lesson and start its voice call. A disabled service displays a connection message
and a retry button. Written verb spelling is checked locally even while voice is
disabled or paused; oral requirements still need a voice call. For verbs, write the requested forms and speak the meaning,
pronunciations and original sentences. Progress opens the current lesson's
requirements; Preferences and reference dialogs preserve the current exercise.
Sentence practice accepts translation before explanation and waits for **Next
exercise**. **Pause call** releases the microphone and connection; **Resume call**
keeps the same exercise. **All lessons** ends the call and returns home.

The readiness message distinguishes calls that are turned off from missing server
credentials. A retry cannot enable a disabled service; restart with the explicit
voice option below when ready to use paid voice.

The broker reads its credentials from `.env.local`; the launcher itself does not
load secrets. Paid voice stays disabled, even if `ALLOW_PAID_VOICE=1` was
inherited from the terminal. Ctrl-C stops both processes; either process exiting
also stops the other. It checks
ports 5174 and 8787 before starting and preserves occupied listeners. For just
the frontend, `npm run dev` remains available.

Vite binds loopback on port 5174 with strict port selection. It does not kill an
occupied listener or expose a public preview. The three hash routes reload
without server rewrites. Browsing the catalog and preferences needs no key or provider call.
Do not put credentials in `VITE_*` variables or browser code.

```sh
npm run check
npm run preview
```

For a separate built-app preview terminal, run `npm run preview` from this
repository's root after a successful build, then open `http://127.0.0.1:4174/`.
Dev and preview keep running until stopped with Ctrl-C. The voice broker is
required only for voice conversations.

`check` runs Node/TypeScript behavior tests, curriculum integrity and Python
mutation tests, strict type checking and the production build. The curriculum
checks require Python 3.10+.
Run them alone with `npm run test:content`. JSON module attributes and explicit
TypeScript-extension imports are supported by the shared no-emit configuration.
Preview binds loopback on 4174. No new CI, hosting, security configuration
or deployment is installed by this foundation.

## Credentials and live voice

Browsing lessons needs no account or credentials. For voice, use a dedicated
OpenAI project and server API key. Store the key as `OPENAI_API_KEY` in the ignored
`.env.local` file, using [.env.example](.env.example) for the variable names. If
the file already exists, preserve it; do not overwrite an existing credential.
The broker does not automatically load env files with `npm run dev:voice` alone.
Never prefix a credential with `VITE_`; Vite exposes those variables to browsers.

Stop the default local launcher before enabling live voice:

```sh
node scripts/dev-local.mjs --voice
```

Select a lesson and allow the browser microphone prompt. Selecting a lesson (or
opening its direct URL) initiates the call automatically; there is no session-mode
selector or second Start action. Starting the processes or browsing the home
screen alone makes no paid provider request. Check the
project's model access, credit balance and enforced monthly spend limit first.
An alert alone does not cap spending, and even enforced limits can allow a small
overrun while enforcement propagates. See the [official spend-limit guide](https://developers.openai.com/api/docs/guides/spend-limits).
`OPENAI_REALTIME_MODEL` is an optional server override; the current broker default
is `gpt-realtime-2.1`. Key creation and a green local check do not prove that the
account can use that model or that real speech assessment works.

No database, Docker, login fixture, OAuth redirect or public tunnel is required.
Use the loopback URL for microphone testing on this computer. Physical phone
testing needs a separately prepared secure origin; emulated viewport checks do
not verify a phone microphone. See [voice integration](docs/voice-integration.md)
for transport and evidence limits.

## Browser verification

Use the selected environment's supplied Playwright and Chromium tooling. The
helper follows the retained onboarding launch approach with writable temporary
profile paths. It never disables TLS validation. Set `CHROMIUM_EXECUTABLE_PATH`
only if the environment supplies Chromium elsewhere; no browser installation is
performed. With dev and/or preview already running:

If the supplied Playwright package is outside this repository, set `NODE_PATH`
to its containing `node_modules` directory. On macOS with an existing Google
Chrome installation, use:

```sh
export CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Then run the existing helpers (omit port 4174 if preview is not running):

```sh
npm run test:browser -- 5174 4174
node scripts/smoke-practice.cjs 5174 4174
```

The helpers check 320x640, 390x844, 844x390 and 1024x768 viewport rendering,
home cards, direct lesson URLs, back navigation, preference dialogs, theme and
independent difficulty persistence, owned-key reset, progress dialogs, reflow and
absence of external requests. Browser transport fixtures intercept the local
broker and inject media/peer objects to check automatic startup, cancellation,
mute, pause/resume and connection failures without a provider call. These are
actual Chromium renders with simulated transport, not real audio evidence.
`SCREENSHOT_PATH=/tmp/lang-lessons-home.png` optionally captures the home screen.
Owned UI and feature fixtures run independently with
`UX_BROWSER=1 node --import tsx --test tests/ux-browser.test.ts`,
`SENTENCES_BROWSER=1 node --import tsx --test tests/sentences-browser.test.ts`, and
`VERBS_BROWSER=1 node --import tsx --test tests/verbs-browser.test.ts`.

## Contracts, ownership and privacy

- [Architecture](docs/architecture.md): defaults, evidence, interruption, staged
  coaching, persistence, provider candidate and open validation limits.
- [Parallel handoff](docs/parallel-handoff.md): exact ownership and entry points.
- [Typed contracts](src/contracts/index.ts): shared implementation authority.
- [Atlas intake](docs/atlas-intake-en-wp-01.md): coordinator-owned knowledge update.

Only theme, help, untimed-help, difficulty and preferred-mode settings persist under
`lang-lessons.settings.v1`. No transcript, audio, score, token, provider mode,
analytics identifier or learning history is stored. Clearing preferences removes
only that key. Blocked/malformed storage falls back to in-memory defaults.

Continuous voice uses one provider-neutral session and a same-origin SDP broker
with permanent credentials only on the server. Run the disabled-by-default local
broker with `npm run dev:voice`. See [voice integration](docs/voice-integration.md)
for adapter/controller APIs, setup, privacy and limits. Real calls require
separately scoped credentials, budget and authorization; no real pronunciation,
latency, retention or cost validation has occurred in this task.

## Model-call observability

Optional server-side [Phoenix tracing](docs/observability.md) records model-call
latency, outcomes and available token usage without capturing prompts, responses
or audio. Trace export does not need an OpenAI key or make paid model calls.

## Published reconciliation

The [October 17 reconciliation](docs/evidence/published-reconciliation-2026-10-17.md)
pins published code, PRs, current checks and the Atlas handoff. Earlier dated
receipts describe their original local revisions. The four past tenses are
planned alongside the existing four present tenses; implementation has not begun.
