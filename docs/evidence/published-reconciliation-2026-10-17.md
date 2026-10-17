# Published application reconciliation

Date: 2026-10-17. Task: documentation reconciliation for coordinator thread
`01a118ed-6bf7-7481-93e6-336de48270f7`. Environment: saved Cloud checkout;
Node 24.19.0, npm 11.9.0, Python 3.12.14, supplied desktop Chromium/Playwright.
No Mac operation, feature implementation, paid provider call or main merge.

## Published revisions and scope

After the coordinator's final push-completion confirmation, fetched main/default
was `b74af6712e4907637cdd844418c77b985ca44572`. Atlas main/default was
`48a8a65dcc9f3d284d8f10000ff3bff9a9f01949`, retaining PR17 merge
`48925c9935615ebaa372c37041ddd14e24aa27af` and later Klisteni work.
Earlier observations were interim and two requested pauses were honored.
The source checkout at `57db399d8ea5ee800b915390622a73f10a9cd8c2` was preserved;
all work occurs on isolated documentation branches. Main movement must be
rechecked before handoff; this receipt cannot guarantee future ref stability.

| Change since known integration | Published evidence |
| --- | --- |
| Optional Phoenix tracing | [PR7](https://github.com/pablitxn/lang-lessons/pull/7), head `0ce52b4bf8aec3efb3af0e8f194daa835822fb8e`, merged `2c2b88a3395dc569234f0724d80473f963ccdb16` |
| Voice-first catalog/preferences/setup | [PR8](https://github.com/pablitxn/lang-lessons/pull/8), tested head `173bd7eab10ee5fd2beac93f79934b0e152d70e1`, merged `b74af6712e4907637cdd844418c77b985ca44572` |

The PR8 head and published main have identical trees. The full known-main delta
is 61 files, 3,137 insertions and 796 deletions. No application source, manifest,
lockfile, test or runtime configuration is changed by this documentation patch.

## Behavior reconciled with owning sources

- `src/app/App.tsx`, `LessonSession.tsx` and `session-runtime.ts`: home lesson
  catalog, automatic live-adapter startup after context/readiness, no production
  mock selector, modal Preferences/progress and mute/pause/resume. Home does not
  start a call; a lesson URL can start it when the service is explicitly enabled.
- `src/app/Preferences.tsx`, settings store/contracts and UI components: sectioned
  preferences, validated theme, independent difficulty, scoped settings reset,
  modal focus/holds and microphone-check cleanup.
- `src/voice/realtime.ts` and `server/realtime.ts`: local spelling while offline
  or paused; audio still owns oral assessment; distinct readiness reasons;
  opaque release tokens and conservative previous-call cleanup before new calls.
- `server/telemetry.ts` and voice telemetry: optional server OTLP configuration,
  content allowlists, bounded reporting, browser-reported usage labels and failure
  isolation. Synthetic collector acceptance in the older receipt is reported
  evidence; authenticated Phoenix readback remains unavailable.
- `scripts/dev-local.mjs`: loopback launcher defaults paid voice off and requires
  explicit `--voice`; no launcher/env file or provider key is used by this audit.
- Curriculum remains exact25 and four present tenses (17 prompts, 69 authored
  oracle cases). Existing irregular past/participle forms are not implementation
  of past simple/continuous/perfect/perfect continuous sentence coverage.

## Current Cloud verification

All checks below ran on the executable tree of exact published main. This patch
only changes documentation afterward; their applicability is unchanged.

| Command | Result / boundary |
| --- | --- |
| `npm ci --cache /tmp/lang-lessons-npm-cache` | Pass; frozen dependencies installed, tracked manifest/lock unchanged |
| `npm run check` | Pass; 165 Node tests total, 162 pass, 0 fail, 3 optional browser-suite skips; 21 Python tests, content integrity, strict TypeScript/Vite build pass |
| `npm run test:browser -- 5186` | Pass; four actual Chromium viewports, disabled intercepted broker and mocked permission; no page errors/external requests |
| `node scripts/smoke-practice.cjs 5186` | Pass; 12 mode/viewport cases plus eight failure/cancellation/release checks with injected transport; no real microphone/provider |
| `UX_BROWSER=1 SENTENCES_BROWSER=1 VERBS_BROWSER=1 node --import tsx --test tests/ux-browser.test.ts tests/sentences-browser.test.ts tests/verbs-browser.test.ts` | Pass; all three suites, zero skips, 16 viewport/mode cases with explicit simulated verdicts |
| `git diff --check` | Pass |

Vite alone served loopback 5186. No real broker or synthetic infrastructure export
was started. Unit exporter transport uses its existing loopback test receiver.
Legacy status API returned no statuses and the workflow wrapper returned no
PR-triggered runs for current main; no hosted quality-CI pass is claimed.
PR8's final published metadata separately reports its pre-merge combined run;
its earlier untested-conflict warning was superseded. Physical device, actual
microphone, real-model pronunciation/latency, current account/budget/retention,
Phoenix persistence and deployed runtime were not verified.

## Maintenance assessment and documentation handoff

Observed evidence supports scoped English PR titles/five-section bodies, dated
receipts, reported shared-path integration ownership, preserved integration
ancestry and coordinator-owned Atlas intake. It cannot establish every historical
skill read, permission, independent review, actual agent routing or Mac state.
A missing artifact is a gap, not proof a step was skipped. Atlas current summaries
still claimed main absent/PR5 draft, and this patch corrects lingering default-mock
privacy and already-resolved verb dependency wording in app docs. Historical
receipts retain their original local/uncommitted status and timestamps.

Atlas's existing intake receives one source/entry amendment:
`src-20261017-english-learning-published-reconciliation` and
`2026-10-17-english-learning-published-reconciliation`. Existing EN-WP tasks/gates,
wiki, catalog and roadmap are reconciled; PR17 history is preserved. No duplicate
initial minutes, project, recovery task or external issue is created. Notion was
not inspected or changed. The documentation PR receipt supplies exact new heads.

Pablo's four-past-tense extension is recorded as EN-D15 / planned EN-WP-08 in the
existing backlog, alongside the four present tenses. Details and implementation
mandate remain pending after verified reconciliation. No feature work starts here.

## Evidence integrity

The following SHA-256 values cover original published receipts at the audited
main. Temporary check logs are retained under `/tmp` in this Cloud task, with
hashes below; they are not a durable archive or independently hosted artifacts.
The committed report is the durable summarized result. Historical screenshots
and original private calls remain unretrieved.

| Evidence | Bytes | SHA-256 |
| --- | ---: | --- |
| `docs/evidence/phoenix-tracing-2026-10-17.md` | 4772 | `43a556ddc273438b5c030c25b38e5e2df2f6f4f728b2cc4a69d6c0210b8c29e2` |
| `docs/evidence/local-development-2026-10-17.md` | 5404 | `05f1d42a32997077c8606854c101dca9142ce753eb1c1f909da1f3d043ae086d` |
| `docs/evidence/lesson-call-flow-2026-10-17.md` | 4671 | `8b7dddd5f854bb399bdeaa528ab711e3ef0452a3a4775e28b39f38116e4d4300` |
| `docs/evidence/preferences-voice-diagnostics-2026-10-17.md` | 3258 | `3bbad86d28c3c0dbd509bac5c68a0b673a2ad4416023e9238434c01d3edb376b` |
| `/tmp/lang-reconcile-check.log` | 18747 | `401ced235bf62d4c8c9600ddc7288fb5243720b164b0896cbbdc89cb4755e028` |
| `/tmp/lang-reconcile-browser.log` | 2307 | `ed313ba844c0b61f4dc84d515d5eecfde9bc6992777bb7cbc0cb48d7d46a57eb` |
| `/tmp/lang-reconcile-practice.log` | 5395 | `386151d2ec8c4aa11015997642b0f65fa98a0895ab3d2c66e64d638ba38ba3b0` |
| `/tmp/lang-reconcile-fixtures.log` | 4851 | `429454bcffb29252d27d6711cfae05e51d64629ca081407c8a9b00ce5a2ee84c` |
