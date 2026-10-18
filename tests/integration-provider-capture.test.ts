import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { BasicTracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { createProviderCapture, projectProviderEvidence, providerSidebandConnector } from '../server/provider-capture';
import { createPhoenixDebugSink } from '../server/debug-evidence';
import type { BrokerBinding } from '../server/broker/authority';
const binding = { identity: { userId: 'user', role: 'student' }, segment: { sessionId: 'session', segmentId: 'segment', connectionEpoch: 1 }, tokenDigest: 'never-export' } as BrokerBinding;
const policy = { version: 'fixture-approved', route: 'phoenix', evidence: 'authorized-transcripts', maxTextCharacters: 16000 } as const;
const learner = { type: 'conversation.item.input_audio_transcription.completed', event_id: 'ev1', item_id: 'item1', content_index: 0, transcript: 'I bought bread. password=fixture-secret' };
class Socket extends EventEmitter { terminated = false; terminate() { this.terminated = true; this.emit('close'); } receive(value: unknown) { this.emit('message', Buffer.from(JSON.stringify(value))); } }
function fixture(sink?: { record(value: any): Promise<void> }) {
  const sockets: Socket[] = []; const records: any[] = []; let gaps = 0;
  const capture = createProviderCapture({ policy, synthetic: true, sink: sink ?? { async record(value) { records.push(value); } },
    connect() { const socket = new Socket(); sockets.push(socket); return socket; }, gap() { gaps++; } });
  return { capture, sockets, records, gaps: () => gaps };
}
test('provider completed text and interactions reach only in-memory Phoenix with canonical source and no audio', async () => {
  const exporter = new InMemorySpanExporter(); const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const f = fixture(createPhoenixDebugSink(provider.getTracer('synthetic'))); const handle = f.capture.start(binding, 'rtc_fixture');
  f.sockets[0]!.receive({ ...learner, audio: 'SHOULD_NOT_EXPORT', segment: { sessionId: 'spoofed' } });
  f.sockets[0]!.receive({ type: 'response.output_audio_transcript.done', event_id: 'ev2', item_id: 'i2', response_id: 'r2', content_index: 0, transcript: 'Well done.' });
  f.sockets[0]!.receive({ type: 'input_audio_buffer.speech_started', event_id: 'ev3', item_id: 'i3', audio_start_ms: 20 });
  await handle.stop(); await provider.forceFlush(); const spans = exporter.getFinishedSpans(); assert.equal(spans.length, 3);
  for (const span of spans) { assert.equal(span.attributes['app.evidence.source'], 'provider-observed'); assert.equal(span.attributes['app.telemetry.synthetic'], true); assert.equal(span.attributes['app.telemetry.audio_capture'], false); assert.equal(span.attributes['app.exercise_session.id'], 'session'); }
  assert.doesNotMatch(JSON.stringify(spans.map(s => s.attributes)), /fixture-secret|SHOULD_NOT_EXPORT|spoofed|never-export/);
  await provider.shutdown();
});
test('audio, deltas, arbitrary provider bodies and invented connection events are not projected', () => {
  for (const type of ['response.output_audio.delta', 'response.output_audio_transcript.delta', 'session.created', 'connection.connected', 'error', '__proto__']) assert.equal(projectProviderEvidence({ ...learner, type }), null);
  assert.equal(projectProviderEvidence({ ...learner, content_index: -1 }), null);
  assert.equal(projectProviderEvidence({ ...learner, transcript: 'x'.repeat(16001) }), null);
  assert.throws(() => providerSidebandConnector('unused')('../escape'));
});
test('duplicate, conflicting and oversized synthetic events are bounded without raw diagnostics', async () => {
  const f = fixture(); const h = f.capture.start(binding, 'rtc_fixture'); const socket = f.sockets[0]!;
  socket.receive(learner); socket.receive(learner); socket.receive({ ...learner, transcript: 'conflicting' });
  socket.emit('message', Buffer.alloc(65537)); socket.emit('message', '{');
  await h.stop(); assert.equal(f.records.length, 1); assert.equal(f.gaps(), 3);
  socket.receive({ ...learner, event_id: 'late' }); assert.equal(f.records.length, 1);
});
test('observer loss terminates capture without claiming learner disconnect and allows explicit reattachment', async () => {
  const f = fixture(); f.capture.start(binding, 'rtc_fixture'); f.sockets[0]!.emit('error');
  assert.equal(f.gaps(), 1); assert.equal(f.sockets[0]!.terminated, true);
  const h = f.capture.start(binding, 'rtc_fixture'); f.sockets[1]!.receive(learner); await h.stop();
  assert.equal(f.records.length, 1); assert.deepEqual(Object.keys(f.records[0]).sort(), ['event','policyVersion','segment','source','synthetic']);
  await f.capture.shutdown(); assert.throws(() => f.capture.start(binding, 'rtc_fixture'));
});
test('a newer epoch suppresses queued old-epoch text and stale socket messages', async () => {
  const f = fixture(); f.capture.start(binding, 'rtc_fixture'); f.sockets[0]!.receive(learner);
  const h = f.capture.start({ ...binding, segment: { ...binding.segment, connectionEpoch: 2 } }, 'rtc_next');
  f.sockets[0]!.receive({ ...learner, event_id: 'late' }); f.sockets[1]!.receive({ ...learner, event_id: 'fresh' });
  await h.stop(); assert.equal(f.records.length, 1); assert.equal(f.records[0].segment.connectionEpoch, 2);
});
test('held sink cannot create an unbounded queue; failure is contained and shutdown drains accepted synthetic work', async () => {
  let release!: () => void; let calls = 0; const held = new Promise<void>(resolve => { release = resolve; });
  const f = fixture({ async record() { calls++; await held; } }); const h = f.capture.start(binding, 'rtc_fixture');
  for (let i = 0; i < 70; i++) f.sockets[0]!.receive({ ...learner, event_id: `e${i}` });
  assert.equal(f.gaps(), 6); release(); await h.stop(); assert.equal(calls, 64);
  const failed = fixture({ async record() { throw new Error('private provider text'); } });
  const hf = failed.capture.start(binding, 'rtc_fixture'); failed.sockets[0]!.receive(learner); await hf.stop(); assert.equal(failed.gaps(), 1);
});

test('reattachment to the same segment retains replay protection without another provider call', async () => {
  const f = fixture(); const first = f.capture.start(binding, 'rtc_fixture'); f.sockets[0]!.receive(learner); await first.stop();
  const next = f.capture.start(binding, 'rtc_fixture'); f.sockets[1]!.receive(learner); await next.stop();
  assert.equal(f.records.length, 1);
});

test('real broker starts capture after durable receipt and stops it only after confirmed provider cleanup', async () => {
  const { once } = await import('node:events'); const { createRealtimeServer } = await import('../server/realtime');
  const order: string[] = []; let cleanup = false;
  const authority: import('../server/broker/authority').BrokerAuthority = {
    authenticate: async () => binding.identity, reserve: async () => binding,
    created: async () => { order.push('receipt'); }, rejected: async () => {}, isEnded: async () => false,
    ended: async () => { order.push('ended'); }, authorizeRelease: async () => ({ binding, state: 'created', providerCallId: 'rtc_fixture' }),
  };
  const transport: typeof fetch = async url => String(url).endsWith('/hangup') ? new Response(null, { status: cleanup ? 200 : 503 })
    : new Response('v=0\r\n', { status: 201, headers: { location: '/v1/realtime/calls/rtc_fixture' } });
  const origin = 'http://127.0.0.1:5200';
  const server = createRealtimeServer({ enabled: true, apiKey: 'synthetic-unused', model: 'fixture', allowedOrigins: [origin], maxDurationSeconds: 600 }, transport, undefined, undefined, authority,
    { start(actual, callId) { assert.deepEqual(actual, binding); assert.equal(callId, 'rtc_fixture'); order.push('capture'); return { async stop() { order.push('stop'); } }; }, async shutdown() {} });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/realtime/session`; const headers = { origin, 'content-type': 'application/json' };
  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sdp: 'v=0\r\n', segment: binding.segment }) });
    assert.equal(response.status, 200); const payload = await response.json() as { releaseToken: string }; assert.deepEqual(order, ['receipt','capture']);
    await fetch(`${url}/end`, { method: 'POST', headers, body: JSON.stringify({ releaseToken: payload.releaseToken }) }); assert.deepEqual(order, ['receipt','capture']);
    cleanup = true; const ended = await fetch(`${url}/end`, { method: 'POST', headers, body: JSON.stringify({ releaseToken: payload.releaseToken }) });
    assert.equal(ended.status, 200); assert.deepEqual(order, ['receipt','capture','ended','stop']);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
