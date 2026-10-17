# Phoenix model-call observability

The optional server exporter sends content-free OpenInference spans over OTLP
HTTP/protobuf. A session trace contains `realtime.session.create`, followed by
`realtime.assessment`, `realtime.hint`, `realtime.question`, `realtime.speak` and
`realtime.transcription` spans as those operations occur. Each trace and session
identifier is newly generated in memory; no learner identifier is exported.

## Configure the server

Tracing is disabled without an explicit collector endpoint. Set server process
variables, or add them to your existing ignored env file while preserving other
configuration. Never use `VITE_*` for telemetry configuration or credentials.

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=https://collector.example \
PHOENIX_PROJECT_NAME=lang-lessons npm run dev:voice
```

For an env file, Node can load it explicitly:

```sh
node --env-file=.env.local --import tsx server/index.ts
```

This command starts only the local broker. It does not enable paid voice unless
`ALLOW_PAID_VOICE=1` and the existing provider key are separately configured.
Starting the broker or exporting traces does not itself call a model.

| Variable | Meaning |
| --- | --- |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Exact trace ingestion URL; highest priority |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP gateway base URL; `/v1/traces` is appended |
| `PHOENIX_COLLECTOR_ENDPOINT` | Direct Phoenix base URL or `/v1/traces`; used when no OTLP gateway override exists |
| `PHOENIX_PROJECT_NAME` | Phoenix project; defaults to `lang-lessons` |
| `PHOENIX_API_KEY` | Optional Phoenix bearer credential, used only when the selected collector requires it |
| `OTEL_SDK_DISABLED=true` | Disable tracing even when an endpoint is configured |

Use the existing infrastructure's application OTLP gateway when it authenticates
and forwards to Phoenix. Its owning infrastructure repository controls routing,
credentials and retention. Direct Phoenix ingestion may require a Phoenix key;
`OPENAI_API_KEY` is never used for trace export. Endpoint URLs must use HTTPS,
or HTTP on loopback for local testing, without URL credentials, query or fragment.
The exporter uses the system certificate trust store. There is no TLS bypass.

## Recorded data and trust

Session setup latency and upstream HTTP status are observed by the server.
Responses carry an operation, completion/failure/cancellation/timeout outcome,
duration, first output latency when observed, and reported usage. Token fields
include input, output, total, text, audio, cached input and cached text/audio
breakdowns when present. Missing usage stays unknown; it is never replaced with
zero, derived from text, or converted into an invented monetary charge.

WebRTC provider responses arrive in the browser. A separate observer extracts
only numeric counters and fixed enums, and relays them to the same-origin broker.
The broker validates the entire report and correlates it with an opaque receipt
issued for that session. Client reports are marked `app.evidence.source =
browser-reported`; setup spans are `server-observed`. These measurements are
useful for debugging and are not authoritative billing or learning evidence.
No provider sideband connection or additional model request is opened.

Prompts, instructions, learner questions, transcripts, response content, audio,
SDP, provider IDs, exception messages, request headers and credentials are not
exported. There is no global HTTP or provider SDK auto-instrumentation. The server
creates attributes from an explicit allowlist; clients cannot supply arbitrary
attributes, models, timestamps, trace IDs or project names. Learning assessment
and its stale-attempt checks remain independent of telemetry.

## Failure and lifecycle behavior

The browser bounds pending operations to 16, completed operation identities to
512, and queued reports to 64 per session. It sends reports in order without
retrying model calls. Response IDs and transcription items are deduplicated.
Stopping a session finalizes unfinished operations as `incomplete`. A lost
browser leaves a session trace incomplete after the voice cap plus a 20-second
reporting grace period; stale receipts cannot write to a replacement session.
Late usage after cleanup cannot be recovered through this observer.

The server batches at most 128 queued spans, exports batches of 32, and bounds
collector requests to two seconds. Telemetry can be dropped during congestion,
page/process termination or network failure. Export failure cannot fail voice,
reconnect it, retry inference, release the paid-session lease or create learning
acceptance. SIGINT/SIGTERM closes the broker and flushes remaining server spans.
Disable export by removing the endpoint or setting `OTEL_SDK_DISABLED=true`.
There is no infrastructure or retention-setting change in this integration.

## Verification without paid inference

```sh
npm ci
npm run check
node --import tsx --test tests/voice-telemetry.test.ts
OTEL_EXPORTER_OTLP_ENDPOINT=https://collector.example npm run telemetry:smoke
```

The smoke exports exactly three synthetic spans in the configured project, with
`app.telemetry.synthetic=true` on every span and fixture token counts. It needs
no OpenAI key, audio, microphone, live session or paid request. Its output reports
collector acceptance separately from Phoenix readback. In Phoenix, select the
configured project and filter on `app.telemetry.synthetic`. Inspect a trace with
one session root, one setup child and one assessment child. Synthetic token
counts must be excluded from real consumption analysis.

Tests cover schema/privacy boundaries, stale receipts, duplicate and mismatched
responses, unknown usage, interrupted requests, exporter failure, a real loopback
OTLP protobuf exporter and the actual adapter with mocked WebRTC. The supplied
Chromium helpers verify actual UI rendering and mock practice separately.
Neither category validates acoustic pronunciation, a physical device, provider
usage completeness, actual charges or Phoenix retention.

Implementation references:
[Phoenix tracing setup](https://arize.com/docs/phoenix/tracing/how-to-tracing/setup-tracing/setup-using-phoenix-otel),
[Phoenix trace ingestion](https://github.com/Arize-ai/phoenix/blob/main/src/phoenix/server/api/routers/v1/traces.py)
and [OpenAI server-side controls](https://developers.openai.com/api/docs/guides/voice-server-controls).
