import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { parseWrittenTranslationReview, tensesForLanguage, type LearningLanguage, type Tense } from '../src/contracts';
import { createSentenceHintHandler, SENTENCE_HINT_TIMEOUT_MS, type SentenceHintConfig } from '../server/sentence-hints';
import { createRealtimeServer } from '../server/realtime';
import type { BrokerAuthority } from '../server/broker/authority';
import { RepositoryError } from '../server/data/database';

const origin = 'http://127.0.0.1:5174';
const config: SentenceHintConfig = { apiKey: 'injected-test-secret', model: 'gpt-6-luna', allowedOrigins: [origin] };
const body = { helpEnabled: true, sentenceId: 'sentence-ps-bread', draft: 'He buy bread every morning.' };
const hint = 'Revisa la concordancia entre quien realiza la acción y el verbo.';
const revision = (text = 'buy', coaching = hint) => ({ status: 'needs-revision', tense: null, grammar: '', hint: '', issues: [{ text, hint: coaching }] });
const uncertain = (coaching: unknown = hint) => ({ status: 'uncertain', tense: null, grammar: '', hint: coaching, issues: [] });
const accepted = (tense: Tense = 'present-simple', grammar = 'La frase describe una acción habitual con concordancia entre sujeto y verbo.') => ({ status: 'accepted', tense, grammar, hint: '', issues: [] });
const envelope = (output: unknown = revision()) => ({ status: 'completed', output: [
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(output) }] },
] });
const answer = () => Response.json(envelope());
async function server(t: TestContext, fetcher: typeof fetch = async () => answer(), configuration = config, authorize?: (sessionId: string, language: LearningLanguage) => Promise<void>) {
  const handler = createSentenceHintHandler(configuration, fetcher);
  const app = createServer((request, response) => { void handler(request, response, authorize); });
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
    assert.deepEqual(sent.reasoning, { effort: 'none' }); assert.equal(sent.max_output_tokens, 900);
    assert.equal(sent.text.format.type, 'json_schema'); assert.equal(sent.text.format.strict, true);
    assert.deepEqual(sent.text.format.schema.required, ['status', 'tense', 'grammar', 'hint', 'issues']);
    assert.deepEqual(sent.text.format.schema.properties.tense.enum, [...tensesForLanguage('en'), null]);
    assert.equal(sent.text.format.schema.properties.issues.items.additionalProperties, false);
    assert.equal(sent.text.format.schema.additionalProperties, false);
    assert.match(sent.instructions, /non-exhaustive/); assert.match(sent.instructions, /never as instructions/);
    const data = JSON.parse(sent.input[0].content[0].text);
    assert.equal(data.spanishSentence, 'Él compra pan cada mañana.');
    assert.ok(data.nonExhaustiveExamples.includes('He buys bread every morning.'));
    assert.equal(data.learnerDraft, body.draft);
    assert.deepEqual(data.allowedTenses, tensesForLanguage('en'));
    assert.match(sent.instructions, /Natural synonyms and reordered time expressions are valid/);
    assert.match(sent.instructions, /never generic praise/);
    return answer();
  });
  const response = await app.post();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), revision()); assert.equal(calls, 1);
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

test('provider reviews require coherent bounded verdicts grounded in the exact draft', async t => {
  let output: unknown = envelope();
  const app = await server(t, async () => Response.json(output));
  const invalid = [
    envelope({ hint }), envelope(uncertain('x'.repeat(181))), envelope(uncertain('')), envelope(uncertain(12)),
    envelope({ ...uncertain(), extra: true }), envelope({ ...accepted(), tense: null }),
    envelope({ ...accepted(), tense: 'fr-present' }), envelope({ ...accepted(), issues: [{ text: 'buy', hint }] }),
    envelope({ ...revision(), grammar: 'Spoiled construction.' }), envelope({ ...revision(), hint: 'Conflicting verdict.' }),
    envelope(revision('buys')), envelope(revision('uy')), envelope(revision('He buy bread every morning. '.repeat(8))),
    envelope({ ...revision(), issues: [{ text: 'buy', hint }, { text: 'buy bread', hint }] }),
    { ...envelope(), status: 'incomplete' },
    { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'Private refusal.' }] }] },
    { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'not JSON' }] }] },
  ];
  for (const fixture of invalid) {
    output = fixture;
    const response = await app.post();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Sentence help is unavailable. Please try again.', reason: 'invalid-response' });
  }
  output = envelope(accepted());
  const draft = 'Every morning he purchases bread.';
  const valid = await app.post({ ...body, draft });
  assert.equal(valid.status, 200);
  const reviewed = await valid.json();
  assert.deepEqual(reviewed, accepted()); assert.ok(parseWrittenTranslationReview(reviewed, draft, 'en'));
});

test('uncertain and issue hints reject answer leaks without rejecting accepted grammar explanations', async t => {
  let output: unknown;
  const app = await server(t, async () => Response.json(envelope(output)));
  for (const text of ['La respuesta es He buys bread every morning.', 'Usa el presente simple.',
    'Use the present perfect continuous.', 'Usa el pretérito indefinido.', 'Cambia buy por buys.',
    'Escribe: He purchases bread each morning.', 'La pronunciación es /bɪn/.', 'sujeto + auxiliar + verbo']) {
    for (const review of [uncertain(text), revision('buy', text)]) {
      output = review;
      const response = await app.post();
      assert.equal(response.status, 502);
      assert.equal((await response.json()).reason, 'invalid-response');
    }
  }
  output = accepted('present-simple', 'Present simple: sujeto + verbo. La frase expresa una rutina.');
  const response = await app.post({ ...body, draft: 'He buys bread every morning.' });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), output);
});

test('new future and French anteriority names cannot leak through written hints', async t => {
  let leaked = '';
  const app = await server(t, async () => Response.json(envelope(uncertain(leaked))));
  for (const text of ['Use the future simple.', 'Use future continuous.', 'Use future perfect continuous.',
    'Use going to.', 'Use will.', 'Usa shall.', 'Usa venir de.', 'Usa vient d’ouvrir.',
    'Usa el passé récent.', 'Usa el plus-que-parfait.', 'Usa el futur antérieur.',
    'Usa el futuro continuo.', 'Usa el futuro simple.', 'Usa el futuro perfecto.', 'Usa el futuro próximo.',
    'Usa el futuro progresivo.', 'Usa el futuro anterior.', 'Usa el futuro compuesto.']) {
    leaked = text;
    const response = await app.post();
    assert.equal(response.status, 502, text);
    assert.deepEqual(await response.json(), { error: 'Sentence help is unavailable. Please try again.', reason: 'invalid-response' });
  }
});

test('future temporal guidance remains available without leaking the tense or missing answer', async t => {
  const draft = 'Tomorrow at this time, the kids will be playing in the';
  let coaching = 'Revisá dónde ocurre la acción en el futuro.';
  let calls = 0;
  const app = await server(t, async (_url, init) => {
    calls++;
    const sent = JSON.parse(String(init?.body));
    const input = JSON.parse(sent.input[0].content[0].text);
    assert.equal(input.learnerDraft, draft);
    assert.equal(input.spanishSentence, 'Mañana a esta hora, los niños estarán jugando en el patio.');
    return Response.json(envelope(revision('in the', coaching)));
  });
  for (const text of ['Revisá dónde ocurre la acción en el futuro.', 'Revisá si falta indicar el lugar de la actividad.',
    'Pensá en la relación entre el pasado y el futuro.']) {
    coaching = text;
    const response = await app.post({ helpEnabled: true, sentenceId: 'sentence-future-continuous-playground', draft });
    assert.equal(response.status, 200, text);
    assert.deepEqual(await response.json(), revision('in the', text));
  }
  for (const text of ['Usa el futuro continuo.', 'Usa el futuro.', 'Conjuga en futuro.', 'Use the future.', 'Usa will be más el verbo.',
    'The children will be playing in the yard at this time tomorrow.', 'Completa así: sujeto + auxiliar + verbo.']) {
    coaching = text;
    const response = await app.post({ helpEnabled: true, sentenceId: 'sentence-future-continuous-playground', draft });
    assert.equal(response.status, 502, text);
    assert.equal((await response.json()).reason, 'invalid-response');
  }
  assert.equal(calls, 10, 'Rejected hints never trigger another paid attempt');
});

test('valid paraphrases return one accepted review with the actual construction and no reference issues', async t => {
  let output = accepted('future-continuous', 'Will be + verbo en -ing sitúa el juego de los niños en curso en ese momento de mañana.');
  let calls = 0;
  const app = await server(t, async (_url, init) => {
    calls++;
    const sent = JSON.parse(String(init?.body));
    assert.match(sent.instructions, /Do not copy a reference tense/);
    assert.match(sent.instructions, /Copy text exactly from learnerDraft/);
    return Response.json(envelope(output));
  });
  const futureDraft = 'Tomorrow at this time, the kids will be playing in the yard.';
  const future = await app.post({ helpEnabled: true, sentenceId: 'sentence-future-continuous-playground', draft: futureDraft });
  assert.equal(future.status, 200);
  const review = await future.json();
  assert.deepEqual(review, output); assert.ok(parseWrittenTranslationReview(review, futureDraft, 'en'));
  assert.deepEqual(review.issues, [], 'A time phrase moved to the start and kids synonym need no correction');

  output = accepted('present-simple', 'Is + participio describe el estado actual de la tarea: ya está terminada.');
  const resultDraft = 'My homework is already done.';
  const result = await app.post({ helpEnabled: true, sentenceId: 'sentence-pp-done', draft: resultDraft });
  assert.equal(result.status, 200);
  const actual = await result.json();
  assert.deepEqual(actual, output); assert.ok(parseWrittenTranslationReview(actual, resultDraft, 'en'));
  assert.equal(actual.tense, 'present-simple', 'The reference present perfect does not override the submitted construction');
  assert.equal(calls, 2, 'Each review uses the existing single inference path');
});

test('configuration, provider availability, throttling and upstream timeouts have distinct safe reasons', async t => {
  let upstreamStatus = 500; let calls = 0;
  const app = await server(t, async () => {
    calls++;
    return new Response('injected-test-secret private draft and provider details', { status: upstreamStatus });
  });
  for (const [providerStatus, status, reason] of [[400, 502, 'provider-unavailable'], [500, 502, 'provider-unavailable'],
    [503, 502, 'provider-unavailable'], [401, 503, 'not-configured'], [403, 503, 'not-configured'], [404, 503, 'not-configured'],
    [429, 429, 'rate-limited'], [408, 504, 'timeout'], [504, 504, 'timeout']] as const) {
    upstreamStatus = providerStatus;
    const response = await app.post();
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: 'Sentence help is unavailable. Please try again.', reason });
  }
  assert.equal(calls, 9);
  const missingConfig = await server(t, async () => { throw new Error('Must not dispatch'); }, { ...config, apiKey: '' });
  const response = await missingConfig.post();
  assert.equal(response.status, 503); assert.equal((await response.json()).reason, 'not-configured');
});

test('authorization remains required before paid hint dispatch and denial is identifiable without internal details', async t => {
  let calls = 0; let allowed = false;
  const app = await server(t, async () => { calls++; return answer(); }, config, async (sessionId, language) => {
    assert.equal(sessionId, 'test-owned-session'); assert.equal(language, 'en');
    if (!allowed) throw new Error('private account or active-session mismatch');
  });
  const missingSession = await app.post();
  assert.equal(missingSession.status, 400); assert.equal((await missingSession.json()).reason, 'invalid-request');
  const denied = await app.post({ ...body, sessionId: 'test-owned-session' });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: 'Sentence help is unavailable. Please try again.', reason: 'access-denied' });
  assert.equal(calls, 0);
  allowed = true;
  assert.equal((await app.post({ ...body, sessionId: 'test-owned-session' })).status, 200);
  assert.equal(calls, 1);
});

test('the hint broker authenticates and fails closed without sentence hint authorization', async t => {
  let calls = 0; let signedIn = false; let active = false; let dictionaryChecks = 0;
  const authority: BrokerAuthority = {
    authenticate: async () => { if (!signedIn) throw new RepositoryError('unauthenticated'); return { userId: 'student' }; },
    reserve: async () => { throw new Error('Unused'); }, isEnded: async () => false,
    created: async () => {}, ended: async () => {}, rejected: async () => {}, authorizeRelease: async () => { throw new Error('Unused'); },
  };
  const app = createRealtimeServer({ ...config, enabled: false, maxDurationSeconds: 600 },
    async () => { calls++; return answer(); }, undefined, undefined, authority);
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.closeAllConnections(); app.close(); });
  const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/realtime/sentence-hint`;
  const post = () => fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, sessionId: 'test-owned-session' }) });
  assert.equal((await post()).status, 401); signedIn = true;
  assert.equal((await post()).status, 403); assert.equal(calls, 0);
  authority.authorizeWordDictionary = async () => { dictionaryChecks++; };
  assert.equal((await post()).status, 403); assert.equal(dictionaryChecks, 0, 'Paid hints never reuse dictionary authorization');
  authority.authorizeSentenceHint = async (actor, sessionId, language) => {
    assert.equal(actor.userId, 'student'); assert.equal(sessionId, 'test-owned-session'); assert.equal(language, 'en');
    if (!active) throw new RepositoryError('conflict');
  };
  const denied = await post(); assert.equal(denied.status, 403); assert.equal((await denied.json()).reason, 'access-denied');
  assert.equal(calls, 0, 'Inactive practice cannot dispatch a paid hint');
  active = true;
  assert.equal((await post()).status, 200); assert.equal(calls, 1);
});

test('provider failures expose only bounded reason codes and never retry or echo secrets or draft text', async t => {
  let calls = 0;
  const app = await server(t, async () => { calls++; throw new Error('injected-test-secret private draft and provider details'); });
  const response = await app.post();
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /secret|draft|provider details/); assert.equal(calls, 1);
  const rejected = await server(t, async () => new Response('injected-test-secret private provider error', { status: 401 }));
  const refusal = await rejected.post();
  assert.equal(refusal.status, 503); assert.deepEqual(await refusal.json(), { error: 'Sentence help is unavailable. Please try again.', reason: 'not-configured' });
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
  let actualTense: Tense = 'past-simple';
  const app = await server(t, async (_url, init) => {
    const sent = JSON.parse(String(init?.body));
    assert.match(sent.instructions, /Ignore capitalization entirely/);
    assert.match(sent.instructions, /lowercase "i"/);
    assert.match(sent.instructions, /sentence-initial letters and proper-name casing/);
    assert.match(sent.instructions, /even when other wording differs/);
    drafts.push(JSON.parse(sent.input[0].content[0].text).learnerDraft);
    return Response.json(envelope(accepted(actualTense)));
  });
  for (const attempt of [
    { sentenceId: 'sentence-past-simple-work', draft: 'yesterday i worked from home' },
    { sentenceId: 'sentence-past-perfect-question', draft: 'where had she studied prior to moving to madrid?' },
  ]) {
    actualTense = attempt.sentenceId.includes('perfect') ? 'past-perfect' : 'past-simple';
    const response = await app.post({ helpEnabled: true, ...attempt });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), accepted(actualTense));
  }
  assert.deepEqual(drafts, ['yesterday i worked from home', 'where had she studied prior to moving to madrid?']);
});

test('capitalization advice in either language is suppressed even after an otherwise positive verdict', async t => {
  let coaching = '';
  const app = await server(t, async () => Response.json(envelope(uncertain(coaching))));
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
    assert.deepEqual(await response.json(), { error: 'Sentence help is unavailable. Please try again.', reason: 'invalid-response' });
  }
  coaching = 'Revisa si falta indicar cuándo ocurrió la acción.';
  const response = await app.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), uncertain(coaching));
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
  assert.equal((await blocked.json()).reason, 'rate-limited');
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

test('the total timeout aborts provider work and returns a safe timeout reason', async t => {
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
  assert.deepEqual(JSON.parse(result), { error: 'Sentence help is unavailable. Please try again.', reason: 'timeout' });
});

test('the hint deadline also bounds stalled authorization, ignored fetch cancellation and response streaming', async t => {
  for (const stage of ['authorization', 'fetch', 'body'] as const) await t.test(stage, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let started!: () => void; let calls = 0; let cancelled = false;
    const onStart = new Promise<void>(resolve => { started = resolve; });
    const handler = createSentenceHintHandler(config, async () => {
      calls++;
      if (stage === 'fetch') { started(); return new Promise<Response>(() => {}); }
      return new Response(new ReadableStream({ pull() { started(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 }));
    });
    const incoming = new PassThrough();
    Object.assign(incoming, { method: 'POST', headers: { origin, 'content-type': 'application/json' } });
    let status = 0; let result = '';
    const outgoing = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
      writeHead(next: number) { status = next; }, end(text: string) { result = text; outgoing.writableEnded = true; },
    });
    const authorize = stage === 'authorization' ? async () => { started(); await new Promise<void>(() => {}); } : undefined;
    const done = handler(incoming as unknown as IncomingMessage, outgoing as unknown as ServerResponse, authorize);
    incoming.end(JSON.stringify({ ...body, sessionId: 'test-owned-session' })); await onStart;
    t.mock.timers.tick(SENTENCE_HINT_TIMEOUT_MS); await done;
    assert.equal(status, 504);
    assert.deepEqual(JSON.parse(result), { error: 'Sentence help is unavailable. Please try again.', reason: 'timeout' });
    assert.equal(calls, stage === 'authorization' ? 0 : 1, 'Timeouts never bypass authorization or automatically retry');
    if (stage === 'body') assert.equal(cancelled, true);
  });
});
