import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { PhoenixTelemetry, readPhoenixConfig } from '../server/telemetry';
import { createRealtimeServer, readBrokerConfig } from '../server/realtime';
import { createRealtimeVoiceAdapter } from '../src/voice/realtime';
import { verbContext } from './helpers/assessment-fixtures';
import { createRealtimeTelemetry } from '../src/voice/telemetry';
import { parseTelemetryReport, type TelemetryReport } from '../src/voice/telemetry-schema';

const collector = { endpoint: 'http://127.0.0.1:6006/v1/traces', project: 'lang-lessons-test' };
const report = { kind: 'response', sequence: 1, operation: 'assessment', outcome: 'completed', durationMs: 40,
  usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14, inputAudioTokens: 6, cachedInputTokens: 2 } } as const;
test('Phoenix is independent of OpenAI credentials and accepts only safe server collector configuration', () => {
  assert.equal(readPhoenixConfig({ OPENAI_API_KEY: 'never-needed-for-phoenix' }), null);
  assert.equal(readPhoenixConfig({ OTEL_SDK_DISABLED: 'true', PHOENIX_COLLECTOR_ENDPOINT: 'invalid' }), null);
  assert.deepEqual(readPhoenixConfig({ PHOENIX_COLLECTOR_ENDPOINT: 'https://collector.example/base/' }), {
    endpoint: 'https://collector.example/base/v1/traces', project: 'lang-lessons',
  });
  assert.deepEqual(readPhoenixConfig({ PHOENIX_COLLECTOR_ENDPOINT: collector.endpoint }), {
    endpoint: collector.endpoint, project: 'lang-lessons',
  });
  assert.equal(readPhoenixConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://gateway.example' })?.endpoint, 'https://gateway.example/v1/traces');
  assert.equal(readPhoenixConfig({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://gateway.example/custom', PHOENIX_COLLECTOR_ENDPOINT: 'https://ignored.example' })?.endpoint, 'https://gateway.example/custom');
  for (const endpoint of ['not-a-url', 'http://remote.example', 'https://user:secret@collector.example', 'https://collector.example/?key=secret', 'https://collector.example/#secret']) {
    assert.throws(() => readPhoenixConfig({ PHOENIX_COLLECTOR_ENDPOINT: endpoint }), error => error instanceof Error && !error.message.includes('secret'));
  }
});
test('the relay rejects content, unknown fields, invalid timings and invented token values', () => {
  assert.ok(parseTelemetryReport(report));
  for (const invalid of [
    { ...report, transcript: 'private' }, { ...report, model: 'private' }, { ...report, operation: 'prompt text' },
    { ...report, durationMs: Infinity }, { ...report, sequence: 513 }, { ...report, firstOutputMs: 100 },
    { ...report, usage: { inputTokens: -1 } }, { ...report, usage: { inputTokens: '10' } },
    { ...report, usage: { prompt: 'private' } }, { ...report, usage: {} },
    { kind: 'session', outcome: 'completed', text: 'private' },
  ]) assert.equal(parseTelemetryReport(invalid), null);
});
test('session creation and browser metrics form one trace without duplicating usage or capturing content', async t => {
  const exporter = new InMemorySpanExporter(); const telemetry = new PhoenixTelemetry(collector, exporter);
  t.after(() => telemetry.shutdown());
  const session = telemetry.open('fixture-model', 600)!; session.setup('completed', 201);
  assert.equal(telemetry.accept(session.receipt, report), 'accepted');
  assert.equal(telemetry.accept(session.receipt, report), 'duplicate');
  assert.equal(telemetry.accept('0'.repeat(64), report), 'expired');
  assert.equal(telemetry.accept(session.receipt, { ...report, sequence: 2, usage: undefined }), 'invalid');
  assert.equal(telemetry.accept(session.receipt, { kind: 'response', sequence: 2, operation: 'hint', outcome: 'cancelled', durationMs: 20 }), 'accepted');
  assert.equal(telemetry.accept(session.receipt, { kind: 'session', outcome: 'completed' }), 'accepted');
  assert.equal(telemetry.accept(session.receipt, { ...report, sequence: 3 }), 'expired');
  await telemetry.flush(); const spans = exporter.getFinishedSpans(); assert.equal(spans.length, 4);
  const root = spans.find(span => span.name === 'realtime.session')!;
  assert.equal(root.resource.attributes['openinference.project.name'], collector.project);
  for (const span of spans.filter(span => span !== root)) {
    assert.equal(span.spanContext().traceId, root.spanContext().traceId);
    assert.equal(span.parentSpanContext?.spanId, root.spanContext().spanId);
  }
  const assessment = spans.find(span => span.name === 'realtime.assessment')!;
  assert.equal(assessment.attributes['llm.token_count.total'], 14);
  assert.equal(assessment.attributes['llm.token_count.prompt_details.audio'], 6);
  assert.equal(assessment.attributes['app.evidence.source'], 'browser-reported');
  assert.equal(spans.find(span => span.name === 'realtime.session.create')!.attributes['app.evidence.source'], 'server-observed');
  const hint = spans.find(span => span.name === 'realtime.hint')!;
  assert.equal(hint.attributes['app.usage.reported'], false); assert.equal(hint.attributes['llm.token_count.total'], undefined);
  assert.doesNotMatch(JSON.stringify(spans.map(span => span.attributes)), new RegExp(session.receipt));
});
test('browser observation correlates out-of-order responses, redacts payloads and finalizes interrupted work once', async () => {
  let now = 100; const reports: TelemetryReport[] = [];
  const telemetry = createRealtimeTelemetry({ endpoint: 'http://127.0.0.1/api/realtime/telemetry', receipt: 'a'.repeat(64), now: () => now,
    fetch: async (_url, init) => { reports.push(JSON.parse(String(init?.body)).report); return Response.json({}); } });
  telemetry.start('request-1', 'assessment'); telemetry.start('request-2', 'hint');
  telemetry.receive(JSON.stringify({ type: 'response.created', response: { id: 'response-1', metadata: { request_id: 'request-1' } } }));
  now = 110; telemetry.receive(JSON.stringify({ type: 'response.output_text.delta', response_id: 'response-1', delta: 'SECRET_OUTPUT' }));
  now = 140;
  const done = { type: 'response.done', response: { id: 'response-1', status: 'completed', metadata: { request_id: 'request-1' },
    output: ['SECRET_OUTPUT'], usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15,
      input_token_details: { audio_tokens: 8, cached_tokens: 2, cached_tokens_details: { audio_tokens: 2 } }, secret: 'SECRET_USAGE' } } };
  telemetry.receive(JSON.stringify({ ...done, response: { ...done.response, id: 'wrong-response' } }));
  telemetry.receive(JSON.stringify(done)); telemetry.receive(JSON.stringify(done));
  telemetry.receive(JSON.stringify({ ...done, response: { ...done.response, metadata: { request_id: 'old-session' } } }));
  telemetry.close('completed'); telemetry.close('failed'); await telemetry.flush();
  assert.equal(reports.length, 3);
  assert.deepEqual(reports[0], { kind: 'response', sequence: 1, operation: 'assessment', outcome: 'completed', durationMs: 40,
    firstOutputMs: 10, usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15, cachedInputTokens: 2, inputAudioTokens: 8, cachedInputAudioTokens: 2 } });
  assert.equal(reports[1]?.outcome, 'incomplete'); assert.equal(reports[2]?.kind, 'session');
  assert.doesNotMatch(JSON.stringify(reports), /SECRET|request-|response-/);
});
test('transcription metadata excludes transcripts and missing usage stays absent', async () => {
  const reports: TelemetryReport[] = [];
  const telemetry = createRealtimeTelemetry({ endpoint: 'http://127.0.0.1/telemetry', receipt: 'a'.repeat(64),
    fetch: async (_url, init) => { reports.push(JSON.parse(String(init?.body)).report); return Response.json({}); } });
  telemetry.receive(JSON.stringify({ type: 'input_audio_buffer.speech_started', item_id: 'audio' }));
  telemetry.receive(JSON.stringify({ type: 'input_audio_buffer.speech_stopped', item_id: 'audio' }));
  telemetry.receive(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'audio', transcript: 'PRIVATE_LEARNER_TEXT' }));
  telemetry.close('completed'); await telemetry.flush();
  assert.equal(reports.length, 2); assert.equal(reports[0]?.kind, 'response');
  assert.doesNotMatch(JSON.stringify(reports), /PRIVATE|usage/);
});
test('voice remains usable when telemetry delivery fails and queues stay bounded', async () => {
  let calls = 0;
  const telemetry = createRealtimeTelemetry({ endpoint: 'http://127.0.0.1/telemetry', receipt: 'a'.repeat(64),
    fetch: async () => { calls++; throw new Error('PRIVATE_TRANSPORT_FAILURE'); } });
  for (let i = 0; i < 100; i++) telemetry.start(`pending-${i}`, 'question');
  telemetry.close('failed'); await telemetry.flush(); assert.equal(calls, 17);
});
test('the actual OTLP protobuf exporter reaches a loopback collector without OpenAI credentials', async t => {
  let contentType: string | undefined; let authorization: string | undefined; const chunks: Buffer[] = [];
  const server = createServer(async (request, response) => {
    assert.equal(request.url, '/v1/traces'); contentType = request.headers['content-type']; authorization = request.headers.authorization;
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    response.writeHead(200, { 'Content-Type': 'application/x-protobuf' }); response.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const telemetry = new PhoenixTelemetry({ endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/traces`, project: 'fixture', apiKey: 'PHOENIX_ONLY_FIXTURE' });
  t.after(() => telemetry.shutdown());
  const session = telemetry.open('fixture-model', 600, true)!; session.setup('completed', 201);
  telemetry.accept(session.receipt, report); session.end('completed'); await telemetry.flush();
  assert.equal(contentType, 'application/x-protobuf'); assert.equal(authorization, 'Bearer PHOENIX_ONLY_FIXTURE');
  assert.ok(Buffer.concat(chunks).length > 100); assert.equal(telemetry.counters.exported, 3);
  assert.doesNotMatch(Buffer.concat(chunks).toString(), /PHOENIX_ONLY_FIXTURE/);
});
test('broker validates the telemetry origin, receipt and schema before export without another model call', async t => {
  const exporter = new InMemorySpanExporter(); const telemetry = new PhoenixTelemetry(collector, exporter);
  let calls = 0; const origin = 'http://127.0.0.1:5174';
  const config = { ...readBrokerConfig({}), enabled: true, apiKey: 'FAKE_PROVIDER_KEY' };
  const server = createRealtimeServer(config, async () => {
    calls++; return new Response('v=0\r\nfixture-answer', { headers: { Location: '/v1/realtime/calls/rtc_fixture' } });
  }, telemetry);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); server.close(); await telemetry.shutdown(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, value: unknown, requestOrigin = origin) => fetch(`${base}/api/realtime/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin }, body: JSON.stringify(value),
  });
  const session = await post('session', { sdp: 'v=0\r\nfixture-offer' }); assert.equal(session.status, 200);
  const payload = await session.json(); assert.match(payload.telemetryReceipt, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(payload), /FAKE_PROVIDER_KEY|collector/);
  const valid = { receipt: payload.telemetryReceipt, report };
  assert.equal((await post('telemetry', valid, 'https://hostile.invalid')).status, 403);
  assert.equal((await post('telemetry', { ...valid, receipt: '0'.repeat(64) })).status, 403);
  assert.equal((await post('telemetry', { ...valid, report: { ...report, text: 'PRIVATE' } })).status, 400);
  assert.equal((await post('telemetry', valid)).status, 202);
  assert.equal((await post('telemetry', valid)).status, 202);
  assert.equal((await post('telemetry', { ...valid, report: { kind: 'session', outcome: 'completed' } })).status, 202);
  assert.equal((await post('telemetry', valid)).status, 403);
  await telemetry.flush(); assert.equal(exporter.getFinishedSpans().length, 3); assert.equal(calls, 1);
});

test('expired session receipts cannot attach late metrics to a replacement session', async t => {
  const exporter = new InMemorySpanExporter(); const telemetry = new PhoenixTelemetry(collector, exporter);
  t.after(() => telemetry.shutdown());
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  const first = telemetry.open('fixture-model', 1)!; first.setup('completed');
  now += 21_001;
  const second = telemetry.open('fixture-model', 600)!; second.setup('completed');
  assert.equal(telemetry.accept(first.receipt, report), 'expired');
  assert.equal(telemetry.accept(second.receipt, report), 'accepted'); second.end('completed');
  await telemetry.flush();
  assert.equal(exporter.getFinishedSpans().filter(span => span.name === 'realtime.assessment').length, 1);
});
test('transcription duplicates cannot create another usage span and interrupted requests stay incomplete', async () => {
  const reports: TelemetryReport[] = [];
  const telemetry = createRealtimeTelemetry({ endpoint: 'http://127.0.0.1/telemetry', receipt: 'a'.repeat(64),
    fetch: async (_url, init) => { reports.push(JSON.parse(String(init?.body)).report); return Response.json({}); } });
  const start = JSON.stringify({ type: 'input_audio_buffer.speech_started', item_id: 'same-audio' });
  const done = JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'same-audio', transcript: 'PRIVATE' });
  telemetry.receive(start); telemetry.receive(done); telemetry.receive(start); telemetry.receive(done);
  telemetry.start('pending-request', 'speak'); telemetry.close('completed'); await telemetry.flush();
  assert.equal(reports.filter(report => report.kind === 'response' && report.operation === 'transcription').length, 1);
  assert.deepEqual(reports.at(-1), { kind: 'session', outcome: 'incomplete' });
});
test('exporter failures are counted without surfacing provider or collector error details', async () => {
  const telemetry = new PhoenixTelemetry(collector, { export: (_spans, done) => done({ code: 1, error: new Error('PRIVATE_COLLECTOR_DETAIL') }), shutdown: async () => {} });
  const session = telemetry.open('fixture-model', 600)!; session.setup('failed', 401); session.end('failed');
  await telemetry.flush(); assert.equal(telemetry.counters.failed, 2); await telemetry.shutdown();
});

test('the actual adapter observes question and speech calls through mocked WebRTC without relaying their content', async t => {
  const sent: string[] = []; const reports: TelemetryReport[] = [];
  const channel = { readyState: 'open', onopen: null as (() => void) | null, onclose: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    send(value: string) { sent.push(value); }, close() { this.onclose?.(); } };
  const track = { enabled: true, stop() {} };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const peer = { addTrack() {}, createDataChannel: () => channel,
    createOffer: async () => ({ type: 'offer', sdp: 'v=0\r\nfixture-offer' }), setLocalDescription: async () => {},
    setRemoteDescription: async () => { channel.onopen?.(); }, close() {} };
  const adapter = createRealtimeVoiceAdapter({ dependencies: {
    getUserMedia: async () => stream, createPeer: () => peer as unknown as RTCPeerConnection,
    createAudio: () => ({ muted: true, autoplay: false, pause() {}, play: async () => {} }) as unknown as HTMLAudioElement,
    origin: 'http://127.0.0.1:5174', fetch: async (url, init) => {
      assert.equal(new Headers(init?.headers).has('Authorization'), false);
      if (String(url).endsWith('/session/end')) return Response.json({ ended: true });
      if (String(url).endsWith('/session')) return Response.json({ sdp: 'v=0\r\nfixture-answer', maxDurationSeconds: 600,
        releaseToken: 'fixture-release-token-00000000000000', telemetryReceipt: 'f'.repeat(64) });
      assert.equal(url, 'http://127.0.0.1:5174/api/realtime/telemetry');
      reports.push(JSON.parse(String(init?.body)).report); return Response.json({ accepted: true }, { status: 202 });
    },
  } });
  t.after(() => adapter.disconnect());
  adapter.setContext(verbContext()); await adapter.connect({ sessionId: 's1', signal: new AbortController().signal });
  await adapter.askQuestion!({ ...verbContext(), requestId: 'question', text: 'PRIVATE_QUESTION' });
  const requestId = JSON.parse(sent.at(-1)!).response.metadata.request_id;
  channel.onmessage!({ data: JSON.stringify({ type: 'response.created', response: { id: 'response', metadata: { request_id: requestId } } }) });
  channel.onmessage!({ data: JSON.stringify({ type: 'response.done', response: { id: 'response', metadata: { request_id: requestId }, status: 'completed',
    output: [{ type: 'message', content: [{ type: 'text', text: JSON.stringify({ requestId, text: 'Please ask again.' }) }] }], usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } } }) });
  adapter.disconnect();
  for (let i = 0; i < 5 && reports.at(-1)?.kind !== 'session'; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(reports.map(report => report.kind === 'response' ? report.operation : report.kind), ['question', 'speak', 'session']);
  assert.equal(reports[1]?.outcome, 'incomplete'); assert.doesNotMatch(JSON.stringify(reports), /PRIVATE_QUESTION|Please ask again/);
});

test('missing terminal responses time out without inventing usage or completing the session', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const reports: TelemetryReport[] = []; let now = 0;
  const telemetry = createRealtimeTelemetry({ endpoint: 'http://127.0.0.1/telemetry', receipt: 'a'.repeat(64), now: () => now,
    fetch: async (_url, init) => { reports.push(JSON.parse(String(init?.body)).report); return Response.json({}); } });
  telemetry.start('unfinished', 'assessment'); now = 20_000; t.mock.timers.tick(20_000);
  telemetry.close('failed'); await telemetry.flush();
  assert.deepEqual(reports[0], { kind: 'response', sequence: 1, operation: 'assessment', outcome: 'timeout', durationMs: 20_000 });
  assert.deepEqual(reports[1], { kind: 'session', outcome: 'failed' });
});

test('feedback outcomes use the configured Phoenix sink with canonical metadata only', async t => {
  const exporter = new InMemorySpanExporter(); const telemetry = new PhoenixTelemetry(collector, exporter);
  t.after(() => telemetry.shutdown());
  const feedback = telemetry.feedback(true)!;
  await feedback.publish('phoenix', { operation: 'session-feedback', jobId: 'fixture-job', sessionId: 'fixture-session', outcome: 'stored' });
  await feedback.publish('phoenix', { operation: 'session-feedback', jobId: 'fixture-job', outcome: 'failed', transcript: 'private' } as any);
  await feedback.publish('unexpected-route', { operation: 'session-feedback', jobId: 'fixture-job', outcome: 'failed' });
  await telemetry.flush();
  const spans = exporter.getFinishedSpans(); assert.equal(spans.length, 1);
  assert.deepEqual(spans[0]!.attributes, {
    'openinference.span.kind': 'CHAIN', 'app.feedback.job_id': 'fixture-job', 'app.exercise_session.id': 'fixture-session',
    'app.feedback.outcome': 'stored', 'app.telemetry.synthetic': true,
    'app.telemetry.content_capture': false, 'app.telemetry.audio_capture': false,
  });
  assert.equal(new PhoenixTelemetry(null).feedback(), undefined);
});
