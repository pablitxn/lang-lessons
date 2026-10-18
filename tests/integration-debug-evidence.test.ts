import test from 'node:test';
import assert from 'node:assert/strict';
import { BasicTracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { createDebugEvidenceRecorder, createPhoenixDebugSink } from '../server/debug-evidence';
const segment = { sessionId: 'session', segmentId: 'segment', connectionEpoch: 1 };
const event = { eventId: 'event', kind: 'transcript', speaker: 'learner', text: 'I bought bread.' };
const policy = { version: 'fixture-v1', maxTextCharacters: 10000, route: 'phoenix', evidence: 'synthetic-only' } as const;
test('Phoenix debug path is explicit, synthetic-only and rejects audio or arbitrary payload fields', async () => {
  const records: unknown[] = []; const sink = { async record(value: unknown) { records.push(value); } };
  assert.equal(await createDebugEvidenceRecorder(null, sink).record(segment, event, true), 'blocked');
  const recorder = createDebugEvidenceRecorder(policy, sink);
  assert.equal(await recorder.record(segment, event, false), 'blocked');
  assert.equal(await recorder.record(segment, { ...event, audio: 'bytes' }, true), 'invalid');
  assert.equal(await recorder.record(segment, { ...event, text: 'data:audio/wav;base64,AAAA' }, true), 'invalid');
  assert.equal(await recorder.record(segment, { ...event, text: 'A'.repeat(1000) }, true), 'invalid');
  assert.equal(await recorder.record(segment, event, true), 'recorded');
  assert.equal(records.length, 1); assert.deepEqual((records[0] as any).segment, segment);
});
test('debug text redacts secrets, correlates sessions/segments and deduplicates concurrent replay', async () => {
  const records: any[] = []; let finish!: () => void;
  const recorder = createDebugEvidenceRecorder(policy, { record: async value => { records.push(value); await new Promise<void>(resolve => { finish = resolve; }); } });
  const sensitive = { ...event, text: 'Bearer abc.def password=hidden sk-test123456789 eyJabc.def.ghi' };
  const first = recorder.record(segment, sensitive, true); await Promise.resolve();
  const duplicate = recorder.record(segment, sensitive, true);
  assert.equal(await recorder.record(segment, { ...event, text: 'different' }, true), 'conflict');
  finish(); assert.equal(await first, 'recorded'); assert.equal(await duplicate, 'duplicate');
  assert.equal(records.length, 1); assert.doesNotMatch(records[0].event.text, /abc\.def|hidden|sk-test|eyJabc/);
  assert.equal(records[0].policyVersion, 'fixture-v1'); assert.equal(records[0].synthetic, true);
});

test('Phoenix debug sink keeps canonical correlation and parent trace using only an in-memory exporter', async () => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const tracer = provider.getTracer('fixture'); const parent = tracer.startSpan('exercise-session');
  const sink = createPhoenixDebugSink(tracer, () => trace.setSpan(ROOT_CONTEXT, parent));
  const recorder = createDebugEvidenceRecorder(policy, sink);
  await recorder.record(segment, event, true); parent.end(); await provider.forceFlush();
  const child = exporter.getFinishedSpans().find(span => span.name === 'learning.debug.transcript')!;
  assert.equal(child.spanContext().traceId, parent.spanContext().traceId);
  assert.equal(child.attributes['input.value'], event.text);
  assert.equal(child.attributes['app.exercise_session.id'], segment.sessionId);
  assert.equal(child.attributes['app.call_segment.id'], segment.segmentId);
  assert.equal(child.attributes['app.telemetry.audio_capture'], false);
  await provider.shutdown();
});
