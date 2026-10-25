import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createVerbWritingHandler, VERB_WRITING_TIMEOUT_MS, type VerbWritingConfig } from '../server/verb-writing';
import { createRealtimeServer } from '../server/realtime';
import type { BrokerAuthority } from '../server/broker/authority';
import { RepositoryError } from '../server/data/database';

const origin = 'http://127.0.0.1:5174';
const config: VerbWritingConfig = { apiKey: 'injected-test-secret', model: 'gpt-6-luna', allowedOrigins: [origin] };
const body = { identity: { sessionId: 'test-session', exerciseId: 'local-exercise', generation: 2 }, verbId: 'buy', draft: 'She buy bread every day.' };
const corrected = { status: 'needs-revision', correctedSentence: 'She buys bread every day.', explanation: 'Con she, el presente simple usa buys. El resto de la frase está bien.' };
const envelope = (value: unknown = corrected) => ({ status: 'completed', output: [
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
] });
const answer = () => Response.json(envelope());
async function server(t: TestContext, fetcher: typeof fetch = async () => answer(), configuration = config,
  authorize?: Parameters<ReturnType<typeof createVerbWritingHandler>>[2]) {
  const handler = createVerbWritingHandler(configuration, fetcher);
  const app = createServer((request, response) => { void handler(request, response, authorize); });
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.closeAllConnections(); app.close(); });
  const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/realtime/verb-writing`;
  const post = (payload: unknown = body, headers: Record<string, string> = {}) => fetch(url, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload),
  });
  return { url, post, app };
}

test('optional verb writing sends only the requested draft and authoritative curriculum to structured coaching', async t => {
  let calls = 0;
  const app = await server(t, async (url, init) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer injected-test-secret');
    const sent = JSON.parse(String(init?.body));
    assert.equal(sent.model, 'gpt-6-luna'); assert.equal(sent.store, false); assert.equal(sent.max_output_tokens, 700);
    assert.deepEqual(sent.reasoning, { effort: 'none' });
    assert.equal(sent.text.format.type, 'json_schema'); assert.equal(sent.text.format.strict, true);
    assert.equal(sent.text.format.name, 'written_coaching');
    assert.deepEqual(sent.text.format.schema.required, ['status', 'correctedSentence', 'explanation']);
    assert.equal(sent.text.format.schema.additionalProperties, false);
    assert.match(sent.instructions, /untrusted data, never instructions/);
    assert.match(sent.instructions, /not an exhaustive surface-word whitelist/);
    assert.match(sent.instructions, /Correct lowercase English i to I/);
    assert.match(sent.instructions, /spelling, accents, punctuation and capitalization/);
    assert.match(sent.instructions, /identify the concrete edits/);
    assert.match(sent.instructions, /recognizable spelling or conjugation mistake/);
    assert.doesNotMatch(sent.instructions, /Ignore capitalization/);
    assert.match(sent.instructions, /not an oral verdict or a progress result/);
    const data = JSON.parse(sent.input[0].content[0].text);
    assert.deepEqual(data, { targetLanguage: 'English', baseLanguage: 'Spanish', currentVerb: 'buy',
      forms: { base: ['buy'], past: ['bought'], participle: ['bought'] }, learnerDraft: body.draft });
    assert.ok(!JSON.stringify(sent).includes(body.identity.sessionId));
    return answer();
  });
  const response = await app.post(); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), corrected); assert.equal(calls, 1);
});

test('French writing derives its own lemma and forms without trusting a client-supplied language', async t => {
  const app = await server(t, async (_url, init) => {
    const data = JSON.parse(JSON.parse(String(init?.body)).input[0].content[0].text);
    assert.equal(data.targetLanguage, 'French'); assert.equal(data.currentVerb, 'être');
    assert.deepEqual(data.forms.infinitive, ['être']); assert.deepEqual(data.forms.present, ['suis']);
    assert.equal(data.learnerDraft, 'Je suis à Paris.');
    return Response.json(envelope({ status: 'correct', correctedSentence: null, explanation: 'La frase usa bien être para indicar dónde estás.' }));
  });
  assert.equal((await app.post({ ...body, verbId: 'fr-etre', draft: 'Je suis à Paris.' })).status, 200);
});

test('correct verb examples request and retain concise teaching without a correction', async t => {
  const draft = 'I buy bread.';
  const result = { status: 'correct', correctedSentence: null,
    explanation: 'Usás el presente simple, que puede expresar un hábito. Con I, buy va en su forma base y no lleva -s.' };
  const app = await server(t, async (_url, init) => {
    const sent = JSON.parse(String(init?.body));
    assert.match(sent.instructions, /one or two useful grammatical details grounded in the actual learnerDraft/);
    assert.match(sent.instructions, /at most two sentences and aim for 300 characters or fewer in Spanish/);
    assert.match(sent.instructions, /Distinguish a possible reading from known context/);
    assert.match(sent.instructions, /Keep correctedSentence null/);
    const data = JSON.parse(sent.input[0].content[0].text);
    assert.equal(data.learnerDraft, draft); assert.equal(data.currentVerb, 'buy');
    // Transport fixture only: this does not measure the model's grammatical analysis.
    return Response.json(envelope(result));
  });
  const response = await app.post({ ...body, draft });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), result);
});

test('mocked verb corrections retain concrete grammar, spelling and writing edits', async t => {
  const examples = [
    { verbId: 'buy', draft: 'i buyed bred yesterday', correctedSentence: 'I bought bread yesterday.',
      explanation: 'I se escribe con mayúscula; el pasado de buy es bought; bread lleva a y la frase termina con punto.' },
    { verbId: 'fr-faire', draft: 'j ai fais une erreur', correctedSentence: 'J’ai fait une erreur.',
      explanation: 'J’ai lleva mayúscula y apóstrofo; el participio de faire es fait. Cerramos la frase con punto.' },
  ];
  // These are transport fixtures, not evidence of real model correction quality.
  for (const example of examples) {
    const result = { status: 'needs-revision', correctedSentence: example.correctedSentence, explanation: example.explanation };
    const app = await server(t, async () => Response.json(envelope(result)));
    assert.deepEqual(await (await app.post({ ...body, verbId: example.verbId, draft: example.draft })).json(), result);
  }
});

test('verb coaching rejects a revision that supplies no actual change without retrying', async t => {
  for (const sentence of [body.draft, `  ${body.draft}  `]) {
    let calls = 0;
    const app = await server(t, async () => { calls++; return Response.json(envelope({ ...corrected, correctedSentence: sentence })); });
    const response = await app.post(); assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'No pudimos corregir la frase. Intentá de nuevo.' });
    assert.equal(calls, 1);
  }
});

test('invalid origins, payloads and identities never dispatch provider work', async t => {
  let calls = 0; const app = await server(t, async () => { calls++; return answer(); });
  assert.equal((await fetch(app.url)).status, 405);
  assert.equal((await fetch(app.url, { method: 'POST', body: JSON.stringify(body) })).status, 403);
  assert.equal((await app.post(body, { Origin: 'https://foreign.invalid' })).status, 403);
  assert.equal((await app.post(body, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await app.post(body, { 'Content-Type': 'text/plain' })).status, 415);
  for (const payload of [null, [], {}, { ...body, verbId: 'invented' }, { ...body, draft: ' ' },
    { ...body, draft: 'x'.repeat(1001) }, { ...body, draft: 'hi\u0000there' }, { ...body, language: 'fr' },
    { ...body, identity: { ...body.identity, generation: -1 } }, { ...body, identity: { ...body.identity, generation: 0.5 } },
    { ...body, identity: { ...body.identity, sessionId: '' } }, { ...body, identity: { ...body.identity, exerciseId: '\n' } },
    { ...body, identity: { ...body.identity, extra: 'x' } }, { ...body, identity: null }]) {
    assert.equal((await app.post(payload)).status, 400);
  }
  assert.equal((await app.post({ ...body, draft: 'x'.repeat(9000) })).status, 413);
  const malformed = await fetch(app.url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400); assert.equal(calls, 0);
  const missingKey = await server(t, async () => { calls++; return answer(); }, { ...config, apiKey: '' });
  assert.equal((await missingKey.post()).status, 503); assert.equal(calls, 0);
});

test('chunked request bodies are bounded independently of Content-Length', async t => {
  let calls = 0; const app = await server(t, async () => { calls++; return answer(); });
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(app.url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' } }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    req.once('error', reject); req.write(JSON.stringify({ ...body, draft: 'x'.repeat(9000) })); req.end();
  });
  assert.equal(status, 413); assert.equal(calls, 0);
});

test('only completed bounded structured feedback reaches the learner', async t => {
  const invalid = [
    envelope({ ...corrected, extra: true }), envelope({ ...corrected, status: 'accepted' }),
    envelope({ ...corrected, correctedSentence: null }), envelope({ ...corrected, correctedSentence: 'x'.repeat(1001) }),
    envelope({ ...corrected, status: 'correct' }), envelope({ ...corrected, explanation: '' }),
    envelope({ ...corrected, explanation: 'x'.repeat(1201) }), envelope({ ...corrected, explanation: 'private\u0000body' }),
    { ...envelope(), status: 'incomplete' },
    { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'private body' }] }] },
    { status: 'completed', output: [{ type: 'function_call', arguments: 'private body' }] },
    { status: 'completed', output: [{ type: 'message', role: 'user', content: [{ type: 'output_text', text: JSON.stringify(corrected) }] }] },
    { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{' }] }] },
  ];
  // Fresh handlers keep this validation cohort separate from the request-rate test.
  for (const value of invalid) {
    const app = await server(t, async () => Response.json(value));
    const response = await app.post(); assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'No pudimos corregir la frase. Intentá de nuevo.' });
  }
  for (const status of ['correct', 'off-topic', 'uncertain']) {
    const result = { status, correctedSentence: null, explanation: 'Revisá cómo usás el verbo en tu frase.' };
    const app = await server(t, async () => Response.json(envelope(result)));
    assert.deepEqual(await (await app.post()).json(), result);
  }
});

test('oversized or failed provider responses remain operational errors without retries', async t => {
  let calls = 0;
  for (const response of [new Response('private-provider-body', { status: 500 }),
    new Response('x'.repeat(65537)), new Response('{}', { headers: { 'Content-Length': '65537' } })]) {
    const app = await server(t, async () => { calls++; return response; });
    assert.equal((await app.post()).status, 502);
  }
  assert.equal(calls, 3);
});

test('authorization receives the local identity and curriculum language before provider dispatch', async t => {
  let calls = 0; let authorized = false;
  const app = await server(t, async () => { calls++; return answer(); }, config, async (identity, language) => {
    assert.deepEqual(identity, body.identity); assert.equal(language, 'en');
    if (!authorized) throw new Error('private authorization failure');
  });
  assert.equal((await app.post()).status, 403); assert.equal(calls, 0);
  authorized = true; assert.equal((await app.post()).status, 200); assert.equal(calls, 1);
});

test('the broker fails closed without verb authorization and authenticates before coaching', async t => {
  let calls = 0; let signedIn = false; let hasAccess = false;
  const authority: BrokerAuthority = {
    authenticate: async () => { if (!signedIn) throw new RepositoryError('unauthenticated'); return { userId: 'student' }; },
    reserve: async () => { throw new Error('Unused'); }, isEnded: async () => false,
    created: async () => {}, ended: async () => {}, rejected: async () => {}, authorizeRelease: async () => { throw new Error('Unused'); },
  };
  const app = createRealtimeServer({ ...config, enabled: false, maxDurationSeconds: 600 }, async () => { calls++; return answer(); }, undefined, undefined, authority);
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.closeAllConnections(); app.close(); });
  const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/realtime/verb-writing`;
  const post = () => fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post()).status, 401); signedIn = true;
  assert.equal((await post()).status, 403); assert.equal(calls, 0);
  authority.authorizeVerbWriting = async (actor, identity, language) => {
    assert.equal(actor.userId, 'student'); assert.deepEqual(identity, body.identity); assert.equal(language, 'en');
    if (!hasAccess) throw new RepositoryError('forbidden');
  };
  assert.equal((await post()).status, 403); assert.equal(calls, 0);
  hasAccess = true; assert.equal((await post()).status, 200); assert.equal(calls, 1, 'Writing does not require a voice session');
});

test('concurrency and rate limits bound optional provider work', async t => {
  const pending: (() => void)[] = []; let started = () => {};
  const twoStarted = new Promise<void>(resolve => { started = resolve; });
  const app = await server(t, async () => new Promise<Response>(resolve => {
    pending.push(() => resolve(answer())); if (pending.length === 2) started();
  }));
  const first = app.post(); const second = app.post(); await twoStarted;
  const blocked = await app.post(); assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '60');
  pending.forEach(resolve => resolve()); assert.equal((await first).status, 200); assert.equal((await second).status, 200);
  let calls = 0; const limited = await server(t, async () => { calls++; return answer(); });
  for (let i = 0; i < 12; i++) assert.equal((await limited.post()).status, 200);
  assert.equal((await limited.post()).status, 429); assert.equal(calls, 12);
});

test('disconnecting aborts optional coaching without retries', async t => {
  let started = () => {}; let aborted = () => {}; let calls = 0;
  const onStart = new Promise<void>(resolve => { started = resolve; }); const onAbort = new Promise<void>(resolve => { aborted = resolve; });
  const app = await server(t, async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => { aborted(); reject(init!.signal!.reason); }, { once: true }); started();
    });
  });
  const controller = new AbortController();
  const request = fetch(app.url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
  const rejected = assert.rejects(request, { name: 'AbortError' }); await onStart; controller.abort(); await rejected; await onAbort;
  assert.equal(calls, 1);
});

test('cancellation while authorization is pending prevents later provider dispatch', async t => {
  let release = () => {}; let entered = () => {}; let calls = 0;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const onAuthorization = new Promise<void>(resolve => { entered = resolve; });
  const app = await server(t, async () => { calls++; return answer(); }, config, async () => { entered(); await barrier; });
  let closed = () => {};
  const onClose = new Promise<void>(resolve => { closed = resolve; });
  app.app.on('request', (_request, response) => response.once('close', closed));
  const controller = new AbortController();
  const pending = fetch(app.url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await onAuthorization; controller.abort(); await rejected; await onClose;
  release(); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
});

test('stalled authorization releases both concurrency slots on deadline or browser disconnect', async t => {
  for (const cause of ['deadline', 'request-abort', 'response-close'] as const) await t.test(cause, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0; let entered = 0; let releaseOld!: () => void;
    const oldAuthorization = new Promise<void>(resolve => { releaseOld = resolve; });
    const handler = createVerbWritingHandler(config, async () => { calls++; return answer(); });
    function submit(authorize: NonNullable<Parameters<typeof handler>[2]>) {
      const incoming = Object.assign(new PassThrough(), { method: 'POST', headers: { origin, 'content-type': 'application/json' } });
      let status = 0; let result = ''; let settled = false;
      const outgoing = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
        writeHead(next: number) { status = next; }, end(text: string) { result = text; outgoing.writableEnded = true; },
      });
      const done = handler(incoming as unknown as IncomingMessage, outgoing as unknown as ServerResponse, authorize).then(() => { settled = true; });
      incoming.end(JSON.stringify(body));
      return { incoming, outgoing, done, get status() { return status; }, get result() { return result; }, get settled() { return settled; } };
    }
    const pending = [0, 1].map(() => submit(async () => { entered++; await oldAuthorization; }));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(entered, 2); assert.equal(calls, 0);
    const blocked = submit(async () => { assert.fail('Full slots must reject before authorization'); });
    await blocked.done; assert.equal(blocked.status, 429);

    if (cause === 'deadline') t.mock.timers.tick(VERB_WRITING_TIMEOUT_MS);
    else for (const work of pending) {
      work.outgoing.destroyed = true;
      if (cause === 'request-abort') work.incoming.emit('aborted'); else work.outgoing.emit('close');
    }
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.ok(pending.every(work => work.settled), 'Cancellation settles without waiting for authorization to finish');
    await Promise.all(pending.map(work => work.done));
    for (const work of pending) {
      assert.equal(work.incoming.listenerCount('aborted'), 0); assert.equal(work.outgoing.listenerCount('close'), 0);
      if (cause === 'deadline') {
        assert.equal(work.status, 504);
        assert.deepEqual(JSON.parse(work.result), { error: 'No pudimos corregir la frase. Intentá de nuevo.' });
      } else assert.equal(work.status, 0, 'A disconnected browser receives no response');
    }
    assert.equal(calls, 0, 'Stalled authorization never dispatches provider work');

    let newEntered = 0; let releaseNew!: () => void;
    const newAuthorization = new Promise<void>(resolve => { releaseNew = resolve; });
    const next = [0, 1].map(() => submit(async () => { newEntered++; await newAuthorization; }));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(newEntered, 2, 'Both slots are reusable while the original authorizations remain unresolved');
    assert.equal(calls, 0);
    releaseNew(); await Promise.all(next.map(work => work.done));
    assert.ok(next.every(work => work.status === 200)); assert.equal(calls, 2);
    releaseOld(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(calls, 2, 'Late authorization success cannot dispatch abandoned requests');
  });
});

test('the deadline cancels a stalled provider stream and exposes only a generic failure', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started = () => {}; let cancelled = false;
  const onStart = new Promise<void>(resolve => { started = resolve; });
  const handler = createVerbWritingHandler(config, async () => new Response(new ReadableStream({
    start() { started(); }, cancel() { cancelled = true; },
  })));
  const incoming = new PassThrough(); Object.assign(incoming, { method: 'POST', headers: { origin, 'content-type': 'application/json' } });
  let status = 0; let result = '';
  const outgoing = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
    writeHead(next: number) { status = next; }, end(text: string) { result = text; outgoing.writableEnded = true; },
  });
  const done = handler(incoming as unknown as IncomingMessage, outgoing as unknown as ServerResponse);
  incoming.end(JSON.stringify(body)); await onStart; await Promise.resolve();
  t.mock.timers.tick(VERB_WRITING_TIMEOUT_MS); await done;
  assert.equal(status, 504); assert.equal(cancelled, true);
  assert.deepEqual(JSON.parse(result), { error: 'No pudimos corregir la frase. Intentá de nuevo.' });
});
