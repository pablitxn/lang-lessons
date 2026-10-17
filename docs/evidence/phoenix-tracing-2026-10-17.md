# Phoenix tracing validation and Atlas intake

Date: 2026-10-17. Task: Phoenix observability integration, EN-WP-01 integration role.
Repository: `pablitxn/lang-lessons`. Candidate branch: `codex/phoenix-tracing`.
Base: `57db399d8ea5ee800b915390622a73f10a9cd8c2`.
Validated implementation: `50b526979366043e88712f87b9cb34254374850d`.
The follow-up documentation commit adds this receipt and clarifies the original
architecture's default-mode privacy wording; runtime sources remain unchanged.

## Delivered implementation

Optional content-free OpenTelemetry/OpenInference traces cover broker setup,
assessment, hints, questions, spoken coaching and input transcription. Sessions
and operations are correlated without exporting provider or learner identifiers.
Server setup observations and browser-reported measurements are explicitly
labelled. Usage includes available token, text/audio and cached-input counters;
absent values stay unknown. No permanent credential reaches the browser.

Telemetry failures do not reconnect voice, create another provider request or
change learning evidence. Bounded queues, duplicate suppression, opaque session
receipts, expiry and incomplete finalization limit stale or repeated reporting.
The existing local paid-session lease is preserved.

## Validation

- Clean installation: `npm ci --cache /tmp/lang-lessons-npm-cache` passed with
  42 installed packages and no reported audit vulnerabilities. Initial npm
  installation did not update the lockfile under the local npm configuration;
  explicitly synchronizing the lockfile resolved that setup failure before the
  successful clean install.
- `npm run check`: passed. Node tests: 139 total, 136 passed, zero failed, three
  explicitly skipped optional browser-fixture suites. This includes 13 new
  telemetry tests. Curriculum integrity: 25 verbs, 17 prompts, 69 authored oracle
  cases; Python mutation tests: 21 passed. TypeScript and Vite build passed.
- Supplied `npm run test:browser -- 5185`: passed on actual desktop Chrome at
  320x640, 390x844, 844x390 and 1024x768. No page errors or external requests.
- Supplied `node scripts/smoke-practice.cjs 5185`: passed for image verbs, visible
  verbs and sentences at all four viewport sizes, with explicit mock outcomes.
- Actual OTLP protobuf exporter: loopback receiver verified transport, fixture
  bearer authentication and credential exclusion from span payloads.
- Synthetic infrastructure smoke: the existing application OTLP gateway accepted
  three synthetic spans for `lang-lessons`, using its existing Phoenix forwarding
  path. No OpenAI credential or request was needed. `providerCalls=0`,
  `collectorAccepted=true`, `phoenixReadbackVerified=false`.
- Direct Phoenix API access returned 401; the browser presented its login form.
  Authenticated readback was unavailable. Gateway acceptance does not prove that
  Phoenix has persisted or displayed the spans. No credentials were retrieved,
  created or changed to bypass this boundary.
- `git diff --check`: passed. Commit identity verified through the Atlas guard.

Synthetic spans are explicitly labelled and their fixture token counts are not
real consumption. Unit fixtures, mocked WebRTC/provider transport, actual browser
rendering and live collector acceptance are separate evidence categories. No
physical microphone/device, real-provider audio, pronunciation, billing or
provider-retention validation occurred. No merge, deployment, security-setting
change or shared-infrastructure mutation occurred. CI is reported in the draft
PR separately from these local checks.

## Integration and coordinator handoff

The managed worktree isolates the patch from ongoing local setup and UI edits in
the original checkout. Those edits were neither copied nor committed here. The
EN-WP-01 integration role is the sole manifest/lockfile writer for this candidate;
no shared contract, route or global-style changes are included.

Atlas was resolved through the accessible neighboring `sysadmin-workspace` Git
root and its navigation skill. Panopticon's `docs/otel-topology.md` defines the
application gateway as the ingestion edge and Phoenix as a downstream consumer;
that existing route was reused without changing it. Current runtime evidence is
limited to the dated checks above. The coordinator may reconcile this intake
with Atlas; this application task does not edit Atlas canonical documents.

Applicable standards:
[engineering language and commits](https://github.com/pablitxn/sysadmin-workspace/blob/main/atlas/ops/standards/engineering-language-and-commits.md),
[parallel integration](https://github.com/pablitxn/sysadmin-workspace/blob/main/atlas/ops/standards/pull-request-and-parallel-integration.md)
and [implementation guide](../observability.md).
