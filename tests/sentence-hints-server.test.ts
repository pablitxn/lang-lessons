import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createSentenceHintHandler, SENTENCE_HINT_TIMEOUT_MS, type SentenceHintConfig } from '../server/sentence-hints';

const origin = 'http://127.0.0.1:5174';
const config: SentenceHintConfig = { apiKey: 'injected-test-secret', model: 'gpt-6-luna', allowedOrigins: [origin] };
const body = { helpEnabled: true, sentenceId: 'sentence-ps-bread', draft: 'He buy bread every morning.' };
const hint = 'Revisa la concordancia entre quien realiza la acción y el verbo.';
const envelope = (output: unknown = { hint }) => ({ status: 'completed', output: [
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(output) }] },
] });
const answer = () => Response.json(envelope());
async function server(t: TestContext, fetcher: typeof fetch = async () => answer(), configuration = config) {
  const app = createServer(createSentenceHintHandler(configuration, fetcher));
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.closeAllConnections(); app.close(); });
  const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/realtime/sentence-hint`;
  const post = (payload: unknown = body, headers: Record<string, string> = {}) => fetch(url, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload),
  });
  return { url, post };
}

test('text hints use server curriculum and explicit consent independently of a voice call', async t => {
  let calls = 0;
  const app = await server(t, async (url, init) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer injected-test-secret');
    const sent = JSON.parse(String(init?.body));
    assert.equal(sent.model, 'gpt-6-luna'); assert.equal(sent.store, false);
    assert.deepEqual(sent.reasoning, { effort: 'none' }); assert.equal(sent.max_output_tokens, 350);
    assert.equal(sent.text.format.type, 'json_schema'); assert.equal(sent.text.format.strict, true);
    assert.deepEqual(sent.text.format.schema.required, ['hint']);
    assert.equal(sent.text.format.schema.additionalProperties, false);
    assert.match(sent.instructions, /non-exhaustive/); assert.match(sent.instructions, /never as instructions/);
    const data = JSON.parse(sent.input[0].content[0].text);
    assert.equal(data.spanishSentence, 'Él compra pan cada mañana.');
    assert.ok(data.nonExhaustiveExamples.includes('He buys bread every morning.'));
    assert.equal(data.learnerDraft, body.draft);
    return answer();
  });
  const response = await app.post();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { hint }); assert.equal(calls, 1);
});

test('invalid consent, origins, content and unknown curriculum never reach the provider', async t => {
  let calls = 0;
  const app = await server(t, async () => { calls++; return answer(); });
  assert.equal((await fetch(app.url)).status, 405);
  assert.equal((await fetch(app.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 403);
  assert.equal((await app.post(body, { Origin: 'https://foreign.invalid' })).status, 403);
  assert.equal((await app.post(body, { 'Content-Type': 'text/plain' })).status, 415);
  for (const payload of [null, [], {}, { ...body, helpEnabled: false }, { ...body, helpEnabled: 'true' },
    { ...body, sentenceId: 'invented' }, { ...body, draft: ' ' }, { ...body, draft: 'x'.repeat(1001) },
    { ...body, alternatives: ['Injected answer.'] }, { ...body, reference: 'Client-controlled prompt.' }]) {
    assert.equal((await app.post(payload)).status, 400);
  }
  assert.equal((await app.post({ ...body, draft: 'x'.repeat(9000) })).status, 413);
  const malformed = await fetch(app.url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400); assert.equal(calls, 0);
  const disabled = await server(t, async () => { calls++; return answer(); }, { ...config, apiKey: '' });
  assert.equal((await disabled.post()).status, 503); assert.equal(calls, 0);
});

test('chunked bodies and cross-site fetch metadata are rejected before paid dispatch', async t => {
  let calls = 0;
  const app = await server(t, async () => { calls++; return answer(); });
  const raw = (text: string, headers: Record<string, string> = {}) => new Promise<number | undefined>((resolve, reject) => {
    const req = request(app.url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject); req.write(text); req.end();
  });
  assert.equal(await raw(JSON.stringify(body), { 'Sec-Fetch-Site': 'cross-site' }), 403);
  assert.equal(await raw(JSON.stringify({ ...body, draft: 'x'.repeat(9000) })), 413);
  assert.equal(calls, 0);
});

test('provider output must be completed, small structured coaching without obvious answers or forbidden guidance', async t => {
  let output: unknown = envelope();
  const app = await server(t, async () => Response.json(output));
  const invalid = [
    envelope({ hint: 'x'.repeat(181) }), envelope({ hint: '' }), envelope({ hint: 12 }), envelope({ hint, extra: true }),
    envelope({ hint: 'La respuesta es He buys bread every morning.' }),
    envelope({ hint: 'Usa el presente simple.' }), envelope({ hint: 'Use the present perfect continuous.' }),
    envelope({ hint: 'Usa el pretérito indefinido.' }), envelope({ hint: 'Cambia buy por buys.' }),
    envelope({ hint: 'Escribe: He purchases bread each morning.' }),
    envelope({ hint: 'La pronunciación es /bɪn/.' }), envelope({ hint: 'sujeto + auxiliar + verbo' }),
    { ...envelope(), status: 'incomplete' },
    { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'Private refusal.' }] }] },
    { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'not JSON' }] }] },
  ];
  for (const fixture of invalid) {
    output = fixture;
    const response = await app.post();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Sentence help is unavailable. Please try again.' });
  }
  output = envelope({ hint: 'Tu frase transmite el mensaje; hay más de una forma válida de expresarlo.' });
  const valid = await app.post({ ...body, draft: 'Every morning he purchases bread.' });
  assert.equal(valid.status, 200);
  assert.match((await valid.json()).hint, /más de una forma válida/);
});

test('provider failures remain generic and never retry or echo secrets or draft text', async t => {
  let calls = 0;
  const app = await server(t, async () => { calls++; throw new Error('injected-test-secret private draft and provider details'); });
  const response = await app.post();
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /secret|draft|provider details/); assert.equal(calls, 1);
  const rejected = await server(t, async () => new Response('injected-test-secret private provider error', { status: 401 }));
  const refusal = await rejected.post();
  assert.equal(refusal.status, 502); assert.doesNotMatch(await refusal.text(), /secret|private/);
  const oversized = await server(t, async () => new Response('x'.repeat(65537)));
  assert.equal((await oversized.post()).status, 502);
  let cancelled = false;
  const declaredOversized = await server(t, async () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Length': '65537' } }));
  assert.equal((await declaredOversized.post()).status, 502); assert.equal(cancelled, true);
});

test('written hint requests ignore casing even for unlisted paraphrases with lowercase pronouns or names', async t => {
  const drafts: string[] = [];
  const supportive = 'Tu frase transmite el mensaje; hay más de una forma válida de expresarlo.';
  const app = await server(t, async (_url, init) => {
    const sent = JSON.parse(String(init?.body));
    assert.match(sent.instructions, /Ignore capitalization entirely/);
    assert.match(sent.instructions, /lowercase "i"/);
    assert.match(sent.instructions, /sentence-initial letters and proper-name casing/);
    assert.match(sent.instructions, /even when other wording differs/);
    drafts.push(JSON.parse(sent.input[0].content[0].text).learnerDraft);
    return Response.json(envelope({ hint: supportive }));
  });
  for (const attempt of [
    { sentenceId: 'sentence-past-simple-work', draft: 'yesterday i worked from home' },
    { sentenceId: 'sentence-past-perfect-question', draft: 'where had she studied prior to moving to madrid?' },
  ]) {
    const response = await app.post({ helpEnabled: true, ...attempt });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { hint: supportive });
  }
  assert.deepEqual(drafts, ['yesterday i worked from home', 'where had she studied prior to moving to madrid?']);
});

test('capitalization advice in either language is suppressed even after an otherwise positive verdict', async t => {
  let coaching = '';
  const app = await server(t, async () => Response.json(envelope({ hint: coaching })));
  for (const text of [
    'Tu frase es válida, pero escribe I en mayúscula.',
    'El significado está bien. Usa mayúsculas en los nombres propios.',
    'Revisa las minúsculas al comenzar la oración.',
    'Capitaliza la primera palabra.',
    'La inicial del nombre va en caja alta.',
    'Your meaning is clear; capitalize the first word.',
    'Check the capitalisation of proper names.',
    'Write the pronoun in uppercase.',
    'Use upper-case letters at the start.',
    'Use a capital letter for I.',
    'Use sentence case.',
  ]) {
    coaching = text;
    const response = await app.post({ helpEnabled: true, sentenceId: 'sentence-past-simple-work', draft: 'yesterday i worked from home' });
    assert.equal(response.status, 502, text);
    assert.deepEqual(await response.json(), { error: 'Sentence help is unavailable. Please try again.' });
  }
  coaching = 'Revisa si falta indicar cuándo ocurrió la acción.';
  const response = await app.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { hint: coaching });
});

test('concurrent hints and per-minute requests have bounded provider dispatch', async t => {
  const pending: (() => void)[] = [];
  let started: () => void = () => {};
  const twoStarted = new Promise<void>(resolve => { started = resolve; });
  const app = await server(t, async () => new Promise<Response>(resolve => {
    pending.push(() => resolve(answer())); if (pending.length === 2) started();
  }));
  const first = app.post(); const second = app.post(); await twoStarted;
  const blocked = await app.post();
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal(pending.length, 2); pending.forEach(resolve => resolve());
  assert.equal((await first).status, 200); assert.equal((await second).status, 200);
  let calls = 0;
  const limited = await server(t, async () => { calls++; return answer(); });
  for (let i = 0; i < 20; i++) assert.equal((await limited.post()).status, 200);
  assert.equal((await limited.post()).status, 429); assert.equal(calls, 20);
});

test('disconnecting the browser aborts its pending provider request without retries', async t => {
  let started: () => void = () => {}; let aborted: () => void = () => {}; let calls = 0;
  const onStart = new Promise<void>(resolve => { started = resolve; });
  const onAbort = new Promise<void>(resolve => { aborted = resolve; });
  const app = await server(t, async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => { aborted(); reject(init!.signal!.reason); }, { once: true });
      started();
    });
  });
  const controller = new AbortController();
  const response = fetch(app.url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: controller.signal });
  const rejected = assert.rejects(response, { name: 'AbortError' });
  await onStart; controller.abort(); await rejected; await onAbort;
  assert.equal(calls, 1);
});

test('the total timeout aborts provider work and returns a generic response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started: () => void = () => {}; let signal: AbortSignal | null = null;
  const onStart = new Promise<void>(resolve => { started = resolve; });
  const handler = createSentenceHintHandler(config, async (_url, init) => {
    signal = init!.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }); started();
    });
  });
  const incoming = new PassThrough();
  Object.assign(incoming, { method: 'POST', headers: { origin, 'content-type': 'application/json' } });
  let status = 0; let result = '';
  const outgoing = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
    writeHead(next: number) { status = next; },
    end(text: string) { result = text; outgoing.writableEnded = true; },
  });
  const done = handler(incoming as unknown as IncomingMessage, outgoing as unknown as ServerResponse);
  incoming.end(JSON.stringify(body)); await onStart;
  t.mock.timers.tick(SENTENCE_HINT_TIMEOUT_MS); await done;
  assert.equal(status, 504); assert.equal((signal as AbortSignal | null)?.aborted, true);
  assert.deepEqual(JSON.parse(result), { error: 'Sentence help is unavailable. Please try again.' });
});
