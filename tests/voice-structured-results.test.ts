import assert from 'node:assert/strict';
import test from 'node:test';
import type { AttemptRef, HintRequest, VoiceEvent } from '../src/contracts';
import { createRealtimeProtocol } from '../src/voice/protocol';
import { FakeClock, verbContext } from './helpers/assessment-fixtures';

const resultFunction = 'report_lesson_result';
const context = verbContext();
const pronunciation: AttemptRef = { ...context, obligation: 'pronunciation:base', attemptId: 'structured-audio', revision: 1 };

function object(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}
function fixture() {
  const sent: Record<string, unknown>[] = [];
  const events: VoiceEvent[] = [];
  const protocol = createRealtimeProtocol({ sessionId: context.sessionId, clock: new FakeClock(),
    send: message => sent.push(object(message)), emit: event => events.push(event), setAudioAllowed() {} });
  protocol.setContext(context);
  const receive = (event: object) => protocol.receive(JSON.stringify(event));
  const requests = () => sent.filter(event => event.type === 'response.create').map(event => object(event.response));
  const latest = () => {
    const value = requests().at(-1);
    assert.ok(value);
    return value;
  };
  const requestId = () => {
    const value = object(latest().metadata).request_id;
    assert.equal(typeof value, 'string');
    return value as string;
  };
  const finish = (id: string, output: unknown[]) => receive({ type: 'response.done', response: {
    id: `provider-${id}`, metadata: { request_id: id }, status: 'completed', output,
  } });
  const assess = (refs: readonly AttemptRef[] = [pronunciation]) => {
    receive({ type: 'input_audio_buffer.speech_started', item_id: 'structured-audio' });
    protocol.submit({ ...context, inputId: 'structured-input', kind: 'utterance', text: 'buy',
      utteranceId: 'structured-audio', attempts: refs });
    return requestId();
  };
  return { protocol, events, requests, latest, requestId, receive, finish, assess };
}
function assessment(id: string, audioClear = true, ref = pronunciation) {
  return { requestId: id, results: [{ obligation: ref.obligation, status: 'accepted', audioClear, feedback: 'Clear response.' }], intent: 'practice' };
}
function tool(payload: unknown, name = resultFunction): Record<string, unknown> {
  return { type: 'function_call', call_id: 'fixture-result-call', name, arguments: JSON.stringify(payload) };
}
function assessments(events: readonly VoiceEvent[]) {
  return events.filter(event => event.type === 'assessment');
}

test('assessment requests force a bounded result function with actual schema enums', () => {
  const f = fixture();
  try {
    const meaning: AttemptRef = { ...pronunciation, obligation: 'meaning' };
    const id = f.assess([pronunciation, meaning]);
    const request = f.latest();
    assert.equal(request.conversation, 'none');
    assert.deepEqual(request.output_modalities, ['text']);
    assert.deepEqual(request.tool_choice, { type: 'function', name: resultFunction });
    const tools = array(request.tools);
    assert.equal(tools.length, 1);
    const definition = object(tools[0]);
    assert.equal(definition.type, 'function');
    assert.equal(definition.name, resultFunction);
    const schema = object(definition.parameters);
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    for (const property of ['requestId', 'results', 'intent']) assert.ok(array(schema.required).includes(property));
    const properties = object(schema.properties);
    assert.deepEqual(object(properties.requestId).enum, [id]);
    const results = object(properties.results);
    assert.equal(results.type, 'array');
    assert.equal(results.minItems, 2);
    assert.equal(results.maxItems, 2);
    const result = object(results.items);
    assert.equal(result.additionalProperties, false);
    const fields = object(result.properties);
    assert.deepEqual(new Set(array(object(fields.obligation).enum)), new Set(['pronunciation:base', 'meaning']));
    assert.deepEqual(new Set(array(object(fields.status).enum)), new Set(['accepted', 'incorrect', 'uncertain']));
    assert.equal(object(fields.audioClear).type, 'boolean');
    assert.equal(object(fields.feedback).maxLength, 600);
    assert.deepEqual(new Set(array(object(properties.intent).enum)), new Set(['practice', 'question', 'pause', 'stop', 'change-mode']));
  } finally { f.protocol.dispose(); }
});

for (const kind of ['question', 'hint'] as const) test(`${kind} requests force the bounded coaching result function`, () => {
  const f = fixture();
  try {
    if (kind === 'question') f.protocol.askQuestion({ ...context, requestId: 'question-fixture', text: 'Can you guide me?' });
    else {
      const hint: HintRequest = { ...context, requestId: 'hint-fixture', revision: 1, level: 1,
        target: 'meaning', stage: 'verb', policy: 'guide-without-answer' };
      f.protocol.requestHint(hint);
    }
    const request = f.latest();
    assert.deepEqual(request.tool_choice, { type: 'function', name: resultFunction });
    const tools = array(request.tools);
    assert.equal(tools.length, 1);
    const properties = object(object(object(tools[0]).parameters).properties);
    assert.deepEqual(object(properties.requestId).enum, [f.requestId()]);
    assert.equal(object(properties.text).type, 'string');
    assert.equal(object(properties.text).maxLength, 600);
  } finally { f.protocol.dispose(); }
});

test('a correlated result function preserves audio evidence and ignores duplicate completion', () => {
  const f = fixture();
  try {
    const id = f.assess();
    f.finish(id, [tool(assessment(id))]);
    f.finish(id, [tool(assessment(id))]);
    assert.equal(assessments(f.events).length, 1);
    const result = assessments(f.events)[0]!.batch.results[0]!;
    assert.equal(result.status, 'accepted');
    assert.deepEqual(result.ref, pronunciation);
    assert.deepEqual(result.source, { kind: 'audio', utteranceId: 'structured-audio', audioAvailable: true });
    assert.equal(f.events.some(event => event.type === 'error'), false);
  } finally { f.protocol.dispose(); }
});

for (const position of ['before', 'after'] as const) test(`an inert assistant preamble ${position} the result is never trusted as feedback`, () => {
  const f = fixture();
  try {
    const id = f.assess();
    const preamble = { type: 'message', role: 'assistant', content: [
      { type: 'text', text: 'PRIVATE_UNVALIDATED_PREAMBLE: The answer is bought.' },
    ] };
    const result = tool(assessment(id));
    f.finish(id, position === 'before' ? [preamble, result] : [result, preamble]);
    assert.equal(assessments(f.events).length, 1);
    assert.equal(assessments(f.events)[0]!.batch.results[0]!.status, 'accepted');
    assert.equal(f.events.some(event => event.type === 'error' || event.type === 'feedback'), false);
    assert.doesNotMatch(JSON.stringify(f.events), /PRIVATE_UNVALIDATED_PREAMBLE/);
    assert.equal(f.requests().length, 1, 'An unvalidated preamble must not schedule speech');
  } finally { f.protocol.dispose(); }
});

const invalidOutputs: readonly [string, (id: string) => unknown[]][] = [
  ['an unexpected function name', id => [tool(assessment(id), 'unrequested_function')]],
  ['duplicate result calls', id => [tool(assessment(id)), tool(assessment(id))]],
  ['an extra unrelated function call', id => [tool(assessment(id)), tool(assessment(id), 'unrequested_function')]],
  ['the former plain-text JSON framing', id => [{ type: 'message', role: 'assistant', content: [{ type: 'text', text: JSON.stringify(assessment(id)) }] }]],
  ['a preamble without an assistant role', id => [tool(assessment(id)), { type: 'message', content: [{ type: 'text', text: 'Untrusted output.' }] }]],
  ['a user-role message', id => [tool(assessment(id)), { type: 'message', role: 'user', content: [{ type: 'text', text: 'Untrusted output.' }] }]],
  ['an unknown output type', id => [tool(assessment(id)), { type: 'unknown-output', content: [] }]],
  ['an audio message', id => [tool(assessment(id)), { type: 'message', role: 'assistant', content: [{ type: 'audio', audio: 'fixture-audio' }] }]],
  ['an unknown message content type', id => [tool(assessment(id)), { type: 'message', role: 'assistant', content: [{ type: 'unknown-content', text: 'Untrusted output.' }] }]],
  ['a malformed message content array', id => [tool(assessment(id)), { type: 'message', role: 'assistant', content: ['Untrusted output.'] }]],
  ['a nonstring preamble text', id => [tool(assessment(id)), { type: 'message', role: 'assistant', content: [{ type: 'text', text: 42 }] }]],
  ['nonstring arguments', id => [{ ...tool(assessment(id)), arguments: assessment(id) }]],
  ['malformed JSON arguments', id => [{ ...tool(assessment(id)), arguments: '{unfinished' }]],
  ['an array payload', id => [tool([assessment(id)])]],
  ['a mismatched payload request ID', () => [tool(assessment('another-request'))]],
  ['oversized arguments below the event size limit', id => [tool({ ...assessment(id), padding: 'x'.repeat(100_000) })]],
];
for (const [description, output] of invalidOutputs) test(`structured results reject ${description} without certifying an attempt`, () => {
  const f = fixture();
  try {
    const id = f.assess();
    f.finish(id, output(id));
    assert.equal(assessments(f.events).some(event => event.batch.results.some(result => result.status === 'accepted')), false);
    assert.equal(assessments(f.events).at(-1)?.batch.results[0]?.status, 'uncertain');
    assert.equal(f.events.some(event => event.type === 'error'), true);
  } finally { f.protocol.dispose(); }
});

test('a result function without clear captured audio cannot certify pronunciation', () => {
  const f = fixture();
  try {
    const id = f.assess();
    f.finish(id, [tool(assessment(id, false))]);
    assert.equal(assessments(f.events).at(-1)?.batch.results[0]?.status, 'uncertain');
    assert.equal(f.events.some(event => event.type === 'error'), false);
  } finally { f.protocol.dispose(); }
});

test('a matching result payload cannot bypass provider metadata correlation', () => {
  const f = fixture();
  try {
    const id = f.assess();
    f.finish('unrequested-envelope', [tool(assessment(id))]);
    assert.equal(assessments(f.events).length, 0);
    f.finish(id, [tool(assessment(id))]);
    assert.equal(assessments(f.events).length, 1);
    assert.equal(assessments(f.events)[0]!.batch.results[0]!.status, 'accepted');
  } finally { f.protocol.dispose(); }
});

test('structured results retain exercise and latest-attempt correlation', () => {
  const f = fixture();
  try {
    const oldId = f.assess();
    const fresh: AttemptRef = { ...pronunciation, attemptId: 'fresh-audio', revision: 2 };
    f.protocol.submit({ ...context, inputId: 'fresh-input', kind: 'utterance', text: 'buy', utteranceId: 'structured-audio', attempts: [fresh] });
    const freshId = f.requestId();
    f.finish(oldId, [tool(assessment(oldId))]);
    assert.equal(assessments(f.events).length, 0);
    f.finish(freshId, [tool(assessment(freshId, true, fresh))]);
    assert.equal(assessments(f.events).length, 1);
    assert.equal(assessments(f.events)[0]!.batch.results[0]!.ref.attemptId, 'fresh-audio');
    const retiredId = f.assess();
    f.protocol.setContext({ ...context, exerciseId: 'next-exercise', generation: 2 });
    f.finish(retiredId, [tool(assessment(retiredId))]);
    assert.equal(assessments(f.events).length, 1);
  } finally { f.protocol.dispose(); }
});

test('validated coaching schedules tool-free audio rather than another structured function', () => {
  const f = fixture();
  try {
    f.protocol.askQuestion({ ...context, requestId: 'question-fixture', text: 'Can you guide me?' });
    const id = f.requestId();
    f.finish(id, [tool({ requestId: id, text: 'Think about a situation you know.' })]);
    assert.equal(f.events.some(event => event.type === 'feedback'), true);
    const speech = f.latest();
    assert.deepEqual(speech.output_modalities, ['audio']);
    assert.deepEqual(speech.tools, []);
    assert.equal(speech.tool_choice, 'none');
  } finally { f.protocol.dispose(); }
});
