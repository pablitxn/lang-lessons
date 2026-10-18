import { createPhoenixDebugSink, type DebugEvidenceSink } from './debug-evidence';
import type { FeedbackTelemetry } from './feedback/telemetry';
import { randomBytes, randomUUID } from 'node:crypto';
import { ROOT_CONTEXT, SpanKind, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BasicTracerProvider, BatchSpanProcessor, type SpanExporter } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { parseTelemetryReport, type Outcome, type TokenUsage } from '../src/voice/telemetry-schema';

export interface PhoenixConfig { endpoint: string; project: string; apiKey?: string }
export function readPhoenixConfig(env: NodeJS.ProcessEnv): PhoenixConfig | null {
  const configuredEndpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT || env.PHOENIX_COLLECTOR_ENDPOINT;
  if (env.OTEL_SDK_DISABLED === 'true' || !configuredEndpoint) return null;
  let endpoint: URL;
  try { endpoint = new URL(configuredEndpoint); } catch { throw new Error('Invalid Phoenix collector configuration.'); }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || !(endpoint.protocol === 'https:' || endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) {
    throw new Error('Phoenix requires HTTPS or loopback HTTP, without URL credentials, query or fragment.');
  }
  if (!env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
    const path = endpoint.pathname.replace(/\/+$/, '');
    endpoint.pathname = path.endsWith('/v1/traces') ? path : `${path}/v1/traces`;
  }
  const project = env.PHOENIX_PROJECT_NAME || 'lang-lessons';
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(project)) throw new Error('Invalid Phoenix project name.');
  return { endpoint: endpoint.href, project, ...(env.PHOENIX_API_KEY ? { apiKey: env.PHOENIX_API_KEY } : {}) };
}
const TOKEN_ATTRIBUTES: Record<keyof TokenUsage, string> = {
  inputTokens: 'llm.token_count.prompt', outputTokens: 'llm.token_count.completion', totalTokens: 'llm.token_count.total',
  cachedInputTokens: 'llm.token_count.prompt_details.cache_read', inputAudioTokens: 'llm.token_count.prompt_details.audio',
  inputTextTokens: 'llm.token_count.prompt_details.text', outputAudioTokens: 'llm.token_count.completion_details.audio',
  outputTextTokens: 'llm.token_count.completion_details.text', cachedInputAudioTokens: 'app.tokens.cached_input_audio',
  cachedInputTextTokens: 'app.tokens.cached_input_text',
};
interface Session {
  root: Span; receipt: string; id: string; model: string; startedAt: number; expiresAt: number; seen: Set<number>;
  timer: ReturnType<typeof setTimeout>; synthetic: boolean;
}
export interface SessionTrace { receipt: string; setup(outcome: 'completed' | 'failed', status?: number): void; end(outcome: Outcome): void }
/** Server-only, content-free manual instrumentation; no global HTTP/SDK auto-instrumentation. */
export class PhoenixTelemetry {
  private provider: BasicTracerProvider | undefined;
  private sessions = new Map<string, Session>();
  readonly enabled: boolean;
  readonly counters = { exported: 0, failed: 0, dropped: 0 };
  constructor(config: PhoenixConfig | null, exporter?: SpanExporter) {
    this.enabled = config !== null;
    if (!config) return;
    const transport = exporter ?? new OTLPTraceExporter({ url: config.endpoint, timeoutMillis: 2000,
      headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {} });
    const safeExporter: SpanExporter = {
      export: (spans, done) => {
        try {
          transport.export(spans, result => {
            if (result.code === 0) this.counters.exported += spans.length; else this.counters.failed += spans.length;
            // Keep exceptions, URLs, credentials and collector bodies out of diagnostics.
            done({ code: result.code });
          });
        } catch { this.counters.failed += spans.length; done({ code: 1 }); }
      },
      shutdown: async () => { try { await transport.shutdown(); } catch { /* Best effort. */ } },
    };
    this.provider = new BasicTracerProvider({ resource: resourceFromAttributes({
      'service.name': 'lang-lessons-voice', 'openinference.project.name': config.project,
    }), spanProcessors: [new BatchSpanProcessor(safeExporter, { maxQueueSize: 128, maxExportBatchSize: 32,
      scheduledDelayMillis: 1000, exportTimeoutMillis: 2500 })] });
  }
  captureGap(segment: import('../src/contracts/session').CallSegmentRef): void {
    if (!this.provider) return;
    const span = this.provider.getTracer('lang-lessons.debug', '1.0.0').startSpan('learning.debug.capture-gap', { attributes: {
      'app.exercise_session.id': segment.sessionId, 'app.call_segment.id': segment.segmentId,
      'app.connection.epoch': segment.connectionEpoch, 'app.telemetry.content_capture': false,
      'app.telemetry.audio_capture': false,
    } });
    span.end();
  }
  /** Content capture requires an additional explicit server opt-in at composition. */
  debugSink(): DebugEvidenceSink | undefined {
    return this.provider ? createPhoenixDebugSink(this.provider.getTracer('lang-lessons.debug', '1.0.0')) : undefined;
  }
  /** Reuse the configured collector for canonical, metadata-only feedback outcomes. */
  feedback(synthetic = false): FeedbackTelemetry | undefined {
    if (!this.provider) return undefined;
    const tracer = this.provider.getTracer('lang-lessons.feedback', '1.0.0');
    return { route: 'phoenix', publish: async (route, event) => {
      const validId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
      if (route !== 'phoenix' || event.operation !== 'session-feedback' || !validId(event.jobId)
        || event.sessionId !== undefined && !validId(event.sessionId)
        || !['blocked','not-claimed','stored','failed','insufficient-evidence','stale','repository-error'].includes(event.outcome)
        || Object.keys(event).some(key => !['operation','jobId','sessionId','outcome'].includes(key))) return;
      const span = tracer.startSpan('learning.feedback', { attributes: {
        'openinference.span.kind': 'CHAIN', 'app.feedback.job_id': event.jobId,
        ...(event.sessionId ? { 'app.exercise_session.id': event.sessionId } : {}),
        'app.feedback.outcome': event.outcome, 'app.telemetry.synthetic': synthetic,
        'app.telemetry.content_capture': false, 'app.telemetry.audio_capture': false,
      } }, ROOT_CONTEXT);
      span.end();
    } };
  }
  open(model: string, maxDurationSeconds: number, synthetic = false): SessionTrace | undefined {
    if (!this.provider) return undefined;
    if (this.sessions.size >= 4) { this.counters.dropped++; return undefined; }
    const tracer = this.provider.getTracer('lang-lessons.voice', '1.0.0');
    const id = randomUUID();
    const root = tracer.startSpan('realtime.session', { attributes: {
      'openinference.span.kind': 'CHAIN', 'session.id': id, 'app.telemetry.synthetic': synthetic,
      'app.telemetry.content_capture': false,
    } }, ROOT_CONTEXT);
    const setup = tracer.startSpan('realtime.session.create', { kind: SpanKind.CLIENT, attributes: {
      'openinference.span.kind': 'TOOL', 'app.evidence.source': 'server-observed',
      'session.id': id, 'app.telemetry.synthetic': synthetic,
    } }, trace.setSpan(ROOT_CONTEXT, root));
    const receipt = randomBytes(32).toString('hex');
    const session: Session = { root, receipt, id, expiresAt: Date.now() + maxDurationSeconds * 1000 + 20_000, model: /^[a-zA-Z0-9_.-]{1,100}$/.test(model) ? model : 'unknown',
      startedAt: Date.now(), seen: new Set(), synthetic,
      timer: setTimeout(() => this.end(receipt, 'incomplete'), maxDurationSeconds * 1000 + 20_000) };
    session.timer.unref(); this.sessions.set(receipt, session);
    let setupEnded = false;
    return { receipt, setup: (outcome, status) => {
      if (setupEnded) return; setupEnded = true;
      if (status !== undefined) setup.setAttribute('http.response.status_code', status);
      this.finish(setup, outcome);
    }, end: outcome => this.end(receipt, outcome) };
  }
  accept(receipt: string, value: unknown): 'accepted' | 'invalid' | 'expired' | 'duplicate' {
    const report = parseTelemetryReport(value); if (!report) return 'invalid';
    const session = this.sessions.get(receipt); if (!session) return 'expired';
    if (Date.now() >= session.expiresAt) { this.end(receipt, 'incomplete'); return 'expired'; }
    if (report.kind === 'session') { this.end(receipt, report.outcome); return 'accepted'; }
    if (session.seen.has(report.sequence)) return 'duplicate';
    session.seen.add(report.sequence);
    const end = Date.now();
    const span = this.provider!.getTracer('lang-lessons.voice', '1.0.0').startSpan(`realtime.${report.operation}`, {
      kind: SpanKind.CLIENT, startTime: new Date(Math.max(session.startedAt, end - report.durationMs)), attributes: {
        'openinference.span.kind': 'LLM', 'llm.provider': 'openai', 'llm.system': 'openai',
        'llm.model_name': report.operation === 'transcription' ? 'gpt-4o-mini-transcribe' : session.model,
        'app.evidence.source': 'browser-reported', 'app.telemetry.synthetic': session.synthetic, 'session.id': session.id,
        'app.response.sequence': report.sequence, 'app.response.duration_ms': report.durationMs,
        'app.usage.reported': report.usage !== undefined,
      },
    }, trace.setSpan(ROOT_CONTEXT, session.root));
    if (report.firstOutputMs !== undefined) span.setAttribute('app.response.first_output_ms', report.firstOutputMs);
    for (const [key, val] of Object.entries(report.usage ?? {})) span.setAttribute(TOKEN_ATTRIBUTES[key as keyof TokenUsage], val);
    this.finish(span, report.outcome, end);
    return 'accepted';
  }
  private finish(span: Span, outcome: Outcome, end?: number) {
    span.setAttribute('app.outcome', outcome);
    span.setStatus({ code: outcome === 'completed' ? SpanStatusCode.OK : outcome === 'failed' || outcome === 'timeout' ? SpanStatusCode.ERROR : SpanStatusCode.UNSET });
    span.end(end === undefined ? undefined : new Date(end));
  }
  private end(receipt: string, outcome: Outcome) {
    const session = this.sessions.get(receipt); if (!session) return;
    clearTimeout(session.timer); this.sessions.delete(receipt); this.finish(session.root, outcome);
  }
  async flush() { try { await this.provider?.forceFlush(); } catch { /* Voice must not depend on export. */ } }
  async shutdown() {
    for (const receipt of this.sessions.keys()) this.end(receipt, 'incomplete');
    try { await this.provider?.shutdown(); } catch { /* Best effort, no sensitive diagnostics. */ }
  }
}
export function configurePhoenix(env: NodeJS.ProcessEnv): PhoenixTelemetry {
  try { return new PhoenixTelemetry(readPhoenixConfig(env)); }
  catch { console.warn('Phoenix tracing disabled: invalid collector configuration.'); return new PhoenixTelemetry(null); }
}
