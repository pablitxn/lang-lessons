# Lang Lessons

A voice-first English-learning app with three lesson types: picture-based
irregular verbs, visible-base irregular verbs, and Spanish-to-English sentences.
Authenticated students see lesson cards. Selecting a lesson opens written practice
without starting audio. The tutor starts only after an explicit Start action. The lesson keeps compact
mute and pause/resume controls; failures collapse into a red header badge that
opens the message and controls. Your avatar opens Preferences.
Progress and Reference open modal dialogs from the fixed icon footer; next
controls show an arrow with a descriptive accessible label.
Preferences use a fixed-size dialog with a sidebar for Profile, Appearance, Voice
and Learning, with compact icon navigation on small screens and sign-out at the
bottom. Only the content panel scrolls. They include system/light/dark
appearance, microphone permission and independent learning settings. Test adapters and simulated evidence are confined
to internal fixtures, never offered as an application mode.

## Local development

Requires Node >=22.12, npm and Python 3.10+. From this repository's root, install
exact dependencies and start the frontend plus the local voice broker:

```sh
npm ci --cache /tmp/lang-lessons-npm-cache
node scripts/dev-local.mjs
```

Open `http://127.0.0.1:5174/`. Opening `http://localhost:5174/` in a browser
automatically redirects to that same local origin so sign-in and session cookies
work consistently. Choose Picture, Verb or Sentence to open a
lesson. The phone icon starts the tutor, changes to hang up during a call,
and stays disabled while voice is unavailable. Checking availability does not
start media or create a call. Written verb spelling is checked locally even while voice is
disabled or paused; oral requirements still need a voice call. Sentence translation
also has an always-available writing field beside the next arrow. Write during
the same call or without a call. Local comparison runs after a 700 ms typing
pause, Enter, blur or Check, highlighting differences from the closest authored
example without rejecting other valid wording. A matched translation opens a
compact verb-tense selector, checked locally against the construction actually
written. Changing the draft resets that selection. Both steps remain available
during the same voice call. Written checks do not complete
the separate oral requirements. For verbs, write the requested forms and speak the meaning,
pronunciations and original sentences. Progress opens the current lesson's
requirements; Preferences and reference dialogs preserve the current exercise.
Sentence practice accepts translation before explanation and waits for **Next
exercise**. The hang-up button releases the microphone and connection; starting
another call keeps the same exercise. **All lessons** ends the call and returns home.

Open the avatar to edit your profile name and photo or sign out. Profile edits
are saved to your account without replacing an active exercise. The backend
validates browser timezone context for daily grouping, retaining historical
timezone boundaries. Picture, Verb and Sentence open directly in their saved
written exercise, including drafts and the selected photo. Reloading or returning
to a lesson reuses its saved practice automatically. The account has one current
practice; switching lessons preserves the other lesson's written work without
displaying a session list. Text-only navigation saves without a close dialog.
Only a currently connected tutor call requires confirmation before leaving;
historical calls do not turn written practice into a recovery workflow.

Learning and appearance preferences save automatically to an account-scoped device
cache and the authenticated account in PostgreSQL. Pending changes survive offline
reloads and retry when the app becomes visible or goes online. Revision checks
merge only the fields changed locally when another device has also saved settings.
The explicit database migration includes account preferences, the single current
practice pointer and per-mode reentry tracking for legacy saved sessions.

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
required for voice conversations and optional model-generated written hints.

With **Offer help after written corrections** enabled in Learning preferences,
a differing written translation requests one short Spanish hint based on the
current attempt, ignoring capitalization. Hover or focus the red differences to
read the hint, or tap them on mobile; Escape and an outside tap dismiss it.
The separate voice-coach hint button is available only during an active call.
Editing, changing the sentence or disabling help cancels the
request and hides stale feedback. The existing server-only `OPENAI_API_KEY` is
used with Responses API model `gpt-6-luna` (override with `OPENAI_HINT_MODEL`).
Text hints can incur usage even when voice is disabled; browsing and local
comparison with help off make no model requests. The broker limits hint requests
to two concurrent and twenty per minute, with a 15-second timeout and no automatic
retries. Written drafts persist locally in account/session-scoped IndexedDB; hints are not persisted; up to twenty successful hints are
cached only in the mounted lesson's memory. Provider failure leaves the writing
field usable and never counts as a learner error.

`check` runs Node/TypeScript behavior tests, curriculum integrity and Python
mutation tests, strict type checking and the production build. The curriculum
checks require Python 3.10+.
Run them alone with `npm run test:content`. JSON module attributes and explicit
TypeScript-extension imports are supported by the shared no-emit configuration.
Preview binds loopback on 4174. No new CI, hosting, security configuration
or deployment is installed by this foundation.

## Credentials and live voice

Practice requires a configured account service and login. For optional voice, use a dedicated
OpenAI project and server API key. Store the key as `OPENAI_API_KEY` in the ignored
`.env.local` file, using [.env.example](.env.example) for the variable names. If
the file already exists, preserve it; do not overwrite an existing credential.
The broker does not automatically load env files with `npm run dev:voice` alone.
Never prefix a credential with `VITE_`; Vite exposes those variables to browsers.

Stop the default local launcher before enabling live voice:

```sh
node scripts/dev-local.mjs --voice
```

Select a lesson, then explicitly start the tutor and allow the browser microphone prompt.
Opening a lesson or restoring a written draft never starts a call automatically. Starting the processes or browsing the home
screen alone makes no paid provider request. Check the
project's model access, credit balance and enforced monthly spend limit first.
An alert alone does not cap spending, and even enforced limits can allow a small
overrun while enforcement propagates. See the [official spend-limit guide](https://developers.openai.com/api/docs/guides/spend-limits).
`OPENAI_REALTIME_MODEL` is an optional server override; the current broker default
is `gpt-realtime-2.1`. Key creation and a green local check do not prove that the
account can use that model or that real speech assessment works.

Authenticated practice requires PostgreSQL and an administrator-provisioned account.
Docker is optional; no OAuth redirect or public tunnel is provisioned by the app.
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
node scripts/smoke-past-tenses.cjs 5174
node scripts/smoke-written-sentences.cjs 5174
node scripts/smoke-preferences-layout.cjs 5174
node scripts/smoke-session-continuity.cjs 5174
```

The helpers check 320x640, 390x844, 844x390 and 1024x768 viewport rendering,
home cards, direct lesson URLs, back navigation, preference dialogs, theme and
independent difficulty persistence, progress dialogs, reflow and
absence of external requests. Browser transport fixtures intercept the local
broker and inject media/peer objects to check explicit startup, cancellation,
mute, pause/resume and connection failures without a provider call. These are
actual Chromium renders with simulated transport, not real audio evidence.
The preferences layout helper also covers 705x924, fixed footer clearance, stable
dialog bounds, internal scrolling, sidebar sign-out and native select keyboard
behavior. Screenshots are saved to `/tmp/lang-lessons-preferences-layout`.
The continuity helper checks direct entry, reload and return for all three
exercises, including draft/identity/photo preservation and no written-only
resume/finalize controls or audio requests.
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

Preferences persist under `lang-lessons.settings.v1`. IndexedDB separately stores
account/session-scoped pending structured progress, written activity and written
drafts for reload recovery. The database stores accounts, canonical sessions,
structured outcomes, usage observations and tutor-comment status. Clearing
preferences does not delete learning records. Audio is never recorded; raw
transcripts do not enter application progress/comment tables.

Continuous voice uses one provider-neutral session and a same-origin SDP broker
with permanent credentials only on the server. Run the disabled-by-default local
broker with `npm run dev:voice`. See [voice integration](docs/voice-integration.md)
for adapter/controller APIs, setup, privacy and limits. Real calls require
separately scoped credentials, budget and authorization; no real pronunciation,
latency, retention or cost validation has occurred in this task.

## Model-call observability

Optional server-side [Phoenix tracing](docs/observability.md) records model-call
latency, outcomes and available token usage. Separately approved transcript and
interaction capture requires the explicit server flag `PHOENIX_CAPTURE_TRANSCRIPTS=true`
and a configured Phoenix collector. Capture excludes audio and professor-facing
raw traces; see [capture limits](docs/oct18-transcript-capture.md). Trace export does not need an OpenAI key or make paid model calls.

## Published reconciliation

The [October 17 reconciliation](docs/evidence/published-reconciliation-2026-10-17.md)
pins the pre-feature published code, PRs, checks and Atlas handoff. Earlier dated
receipts describe their original local revisions.

## Eight-tense practice

Sentence practice includes present and past simple, continuous, perfect and
perfect continuous. In **Preferences → Learning → Sentence tenses**, choose all
eight or one tense. Grammar and vocabulary stay independent. Changed settings
apply to the next prompt and preserve current progress; unsupported combinations
show a message instead of silently changing difficulty. Older saved preferences
adopt all eight tenses. Both verb modes retain their three spelling/form families
and use the expanded context and reference guide for original oral sentences.

See [curriculum](docs/curriculum.md) for tense/family distinctions and evidence
limits. The integrated EN-WP-08 curriculum uses the same compact lesson controls;
the dated reconciliation above remains its historical prerequisite receipt.

## Exercise photographs

Picture practice uses locally served real photographs, with one or more photos
per irregular verb. See the [image policy and free-bank comparison](content/en-wp-03/ASSETS.md)
and [photo replacement receipt](docs/evidence/real-photos-2026-10-18/README.md).
Future imagery must follow the same real-photo, source/license and visual-review
rules. Generated exercise images are prohibited.

## Account service and deployment prerequisites

Serve the frontend and authenticated API at the same configured origin. The broker
still binds loopback; the deployment operator owns hosting/reverse-proxy/TLS setup.
This change does not deploy or change network settings.

Configure server-only `LEARNING_DATABASE_URL`, `LEARNING_AUTH_SECRET` (at least 32
characters), and `LEARNING_APPLICATION_CONFIG` pointing to a JSON file. Never put
these values in Vite variables. The JSON contains `origin`, `login` and
`requestLimit`; an example without secrets is below:

```json
{
  "origin": "http://127.0.0.1:5174",
  "login": {
    "sessionExpiresIn": 86400, "sessionUpdateAge": 3600, "sessionFreshAge": 3600,
    "minPasswordLength": 12, "maxPasswordLength": 128,
    "allowRememberMe": false, "refreshSessions": false,
    "rateLimitWindow": 60, "rateLimitMax": 10
  },
  "requestLimit": { "windowMs": 60000, "maximum": 120 }
}
```

Run `npm ci`, `npm run db:migrate` with that configuration, then `npm run build`.
Migration is explicit and checksum-checked; startup does not migrate automatically.
Bootstrap the first administrator with the operator-only command
`node --import tsx scripts/bootstrap-admin.ts --confirm-initial-administrator`.
Supply a JSON object containing `email` and `password` on standard input from a
protected input source; do not put secrets in command arguments or shell history.
The command refuses an existing administrator, hashes the password, and prints no
credential. This command was tested only with synthetic disposable accounts.
After login, administrators see **People & access**, with account email addresses,
readable account types, active status and password readiness. Technical IDs remain
inside expandable details. Create accounts with **Create account** (Student is the
default), then use **Create setup link**; use **Create password reset link** for an
existing password. Deliver the displayed link
privately yourself: no email is sent. Links expire after 30 minutes, are single-use,
and issuing a replacement revokes the previous link. Successful redemption signs
out existing sessions; users then log in normally. Configure hosting to serve
`index.html` for `/account/credentials`, preserve the fragment until the app clears
it, and keep request bodies out of proxy/analytics logs. No public signup exists. Login and password redemption share a per-process cap of
eight concurrent requests; excess work receives HTTP 429 rather than opening
unbounded database lock connections. Configure the database connection budget for
the number of application processes.
Students explicitly select their own IANA timezone before daily grouping is available.
Do not substitute the professor's or server's timezone.

Students sign in with their email and password to open the lesson catalog; there
is no separate student sign-in URL. The administrator account manages access and
does not double as a student account. **Sign out** is available for every role.
Inside a lesson, it follows the existing exit confirmation, progress flush and
call cleanup before revoking the login session. Canceling keeps the lesson open.
Pending logout blocks new lesson navigation and account changes; a failed request
shows an error instead of claiming success.

For local account acceptance, supply an ignored JSON fixture containing
`administrator` and `student` objects with `email` and `password`, then run the
existing supplied Chromium tooling with:

```sh
ACCOUNT_SMOKE_CREDENTIALS=/path/to/private/local-accounts.json node scripts/smoke-accounts.cjs
```

The smoke is restricted to loopback. It uses the real local account/database API,
checks entry through `localhost` (including credential-link fragments), both roles
and logout after written practice, and blocks provider requests. API origin
validation remains active; only development document navigation redirects.
Keep its credentials out of Git and shell arguments. Mocked race checks are
separate from this real local acceptance.

Tutor time is an orientative browser measurement, not server-verified connection
time. Missing observations display unavailable. Combined time counts interval
overlap once. Confirmed close cleans up known provider calls; unknown historical
interaction may yield explicit insufficient-evidence feedback instead of a fabricated
comment. An unresolved in-flight provider creation/failed cleanup remains blocked
until reconciliation; the server never assumes an unknown call has ended.

Written-only use needs no provider key. Optional tutor calls require the existing
explicit voice opt-in; optional text hints may incur usage independently. Phoenix
content capture stays disabled unless explicitly configured. Real voice, physical
device and live Phoenix acceptance were not performed by synthetic tests. Set and
verify operational retention/deletion/access policies before real learner use.
Historical GitGuardian findings on fabricated test credentials remain disclosed;
a NEUTRAL scanner check is not a clean result.


The picture dictionary uses a reviewed, locally served Wiktionary snapshot for all
25 current verbs. Definitions, POS and IPA retain exact revision attribution and
CC BY-SA 4.0 notices; 24 entries include sourced usage examples. Preferences > Credits
contains the source revision links, reuse notice and downloadable attributed snapshot.
The exercise separates the lemma, pronunciation, definition and examples without
repeating source links. Missing fields remain unavailable.
See [dictionary source/reuse notice](src/features/verbs/dictionary/NOTICE.md).
