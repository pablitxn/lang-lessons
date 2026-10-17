# Lang Lessons

A mobile-first English-learning app foundation with three practice modes:
image-based irregular verbs, visible-base irregular verbs, and Spanish-to-English
sentences. The foundation provides a responsive shell, navigation, preferences,
shared contracts and focused policy tests. The integration branch also provides
curriculum, mobile UI, the shared assessment controller, explicit mock simulation
and an opt-in WebRTC adapter. All three modes are composed end to end: image verbs,
visible-base verbs and staged sentence practice. Default mock mode uses no
microphone or paid provider calls. Oral outcomes in this mode are explicit
simulation fixtures, not an evaluation of the learner's English.

## Local development

Requires Node >=22.12 and npm. The selected Cloud environment was checked with
Node 24.19.0 and npm 11.9.0. Install exact dependencies and run the shell:

```sh
npm ci --cache /tmp/lang-lessons-npm-cache
npm run dev
```

Open `http://127.0.0.1:5174/`. Choose Picture, Verb or Sentence and press **Start
mock session**. For verbs, write the requested forms, then open **Mock response
simulator** to send a chosen oral outcome. Seven oral obligations are independent
of the two/three spelling checks. Complete work advances after a quiet pause;
focused input, questions and helpers keep the exercise open. Sentence mode offers
an explicitly labelled acceptance fixture for translation, then explanation,
and waits for **Next exercise**. Preferences preserve the current exercise.

Vite binds loopback on port 5174 with strict port selection. It does not kill an
occupied listener or expose a public preview. The three hash routes reload
without server rewrites. No key, account, database or provider call is needed.
Do not put credentials in `VITE_*` variables or browser code.

```sh
npm run check
npm run preview
```

For a separate built-app preview terminal, run `cd /workspace/lang-lessons &&
npm run preview` after a successful build, then open `http://127.0.0.1:4174/`.
From this saved environment, begin every command sequence with
`cd /workspace/lang-lessons`. Dev and preview keep running until stopped with
Ctrl-C. The voice broker is unnecessary for mock practice.

`check` runs Node/TypeScript behavior tests, curriculum integrity and Python
mutation tests, strict type checking and the production build. The curriculum
checks require Python 3.10+; the selected Cloud environment already supplies it.
Run them alone with `npm run test:content`. JSON module attributes and explicit
TypeScript-extension imports are supported by the shared no-emit configuration.
Preview binds loopback on 4174. No new CI, hosting, security configuration
or deployment is installed by this foundation.

## Browser verification

Use the selected environment's supplied Playwright and Chromium tooling. The
helper follows the retained onboarding launch approach with writable temporary
profile paths. It never disables TLS validation. Set `CHROMIUM_EXECUTABLE_PATH`
only if the environment supplies Chromium elsewhere; no browser installation is
performed. With dev and/or preview already running:

```sh
npm run test:browser -- 5174 4174
node scripts/smoke-practice.cjs 5174 4174
```

The helper checks 320x640, 390x844, 844x390 and 1024x768 viewport rendering,
all routes, back navigation, reload, preference persistence, independent difficulty,
owned-key reset, horizontal reflow and absence of external requests. This is
desktop Chromium with emulated viewport sizes, not physical mobile/voice evidence.
`SCREENSHOT_PATH=/tmp/lang-lessons-foundation.png` optionally captures one view.
The practice helper exercises all three actual root/feature/controller flows
using explicit mock outcomes. It checks independent oral/written evidence,
typing debounce and IME, help without autofill, uncertainty, questions/drafts,
modal stop/restart, complete quiet advancement, route cancellation and staged
sentence completion. Verb timing uses a controlled browser clock. It is not a
linguistic assessment. Owned UI and feature fixtures can be run independently with
`UX_BROWSER=1 node --import tsx --test tests/ux-browser.test.ts` and
`SENTENCES_BROWSER=1 node --import tsx --test tests/sentences-browser.test.ts`, and
`VERBS_BROWSER=1 node --import tsx --test tests/verbs-browser.test.ts`.

## Contracts, ownership and privacy

- [Architecture](docs/architecture.md): defaults, evidence, interruption, staged
  coaching, persistence, provider candidate and open validation limits.
- [Parallel handoff](docs/parallel-handoff.md): exact ownership and entry points.
- [Typed contracts](src/contracts/index.ts): shared implementation authority.
- [Atlas intake](docs/atlas-intake-en-wp-01.md): coordinator-owned knowledge update.

Only help, untimed-help, difficulty and preferred-mode settings persist under
`lang-lessons.settings.v1`. No transcript, audio, score, token, provider mode,
analytics identifier or learning history is stored. Clearing preferences removes
only that key. Blocked/malformed storage falls back to in-memory defaults.

Continuous voice uses one provider-neutral session and a same-origin SDP broker
with permanent credentials only on the server. Run the disabled-by-default local
broker with `npm run dev:voice`. See [voice integration](docs/voice-integration.md)
for adapter/controller APIs, setup, privacy and limits. Real calls require
separately scoped credentials, budget and authorization; no real pronunciation,
latency, retention or cost validation has occurred in this task.
