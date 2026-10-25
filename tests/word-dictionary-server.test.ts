import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ALL_SENTENCES } from '../src/content';
import { parseWordDictionaryResponse } from '../src/contracts';
import { createWordDictionaryHandler, WORD_DICTIONARY_TIMEOUT_MS } from '../server/word-dictionary';
import { createRealtimeServer } from '../server/realtime';
import type { BrokerAuthority } from '../server/broker/authority';
import { RepositoryError } from '../server/data/database';

const origin = 'http://127.0.0.1:5174';
const config = { allowedOrigins: [origin] };
const body = { identity: { sessionId: 'test-session', exerciseId: 'local-exercise', generation: 2 },
  sentenceId: ALL_SENTENCES.find(sentence => !sentence.language || sentence.language === 'en')!.id, word: 'homework' };
const definition = { en: [{ partOfSpeech: 'Noun', language: 'English', definitions: [
  { definition: '' }, { definition: 'Work assigned by a <a href="/wiki/teacher">teacher</a>.', examples: ['Do your <b>homework</b>.'] },
] }] };
async function checked(response: Response) {
  assert.equal(response.status, 200);
  const value = parseWordDictionaryResponse(await response.json()); assert.ok(value);
  return value;
}
async function server(t: TestContext, fetcher: typeof fetch = async () => Response.json(definition),
  authorize?: Parameters<ReturnType<typeof createWordDictionaryHandler>>[2]) {
  const handler = createWordDictionaryHandler(config, fetcher);
  const app = createServer((request, response) => { void handler(request, response, authorize); });
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.closeAllConnections(); app.close(); });
  const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/realtime/word-dictionary`;
  const post = (payload: unknown = body, headers: Record<string, string> = {}) => fetch(url, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload),
  });
  return { app, url, post };
}

test('word lookup sends only the word to Wiktionary and returns attributed inert dictionary text', async t => {
  let calls = 0;
  const app = await server(t, async (url, init) => {
    calls++; assert.equal(url, 'https://en.wiktionary.org/api/rest_v1/page/definition/homework');
    assert.equal(init?.redirect, 'error'); assert.equal(new Headers(init?.headers).get('Authorization'), null);
    assert.match(new Headers(init?.headers).get('User-Agent')!, /LangLessons/); assert.equal(init?.body, undefined);
    return Response.json(definition);
  });
  const response = await app.post(); assert.equal(response.status, 200);
  const result = parseWordDictionaryResponse(await response.json()); assert.ok(result); assert.equal(result.status, 'found');
  assert.equal(result.entry?.senses[0]?.definition.text, 'Work assigned by a teacher.');
  assert.equal(result.entry?.senses[0]?.examples[0]?.text, 'Do your homework.');
  assert.equal(result.entry?.senses[0]?.definition.source.url, 'https://en.wiktionary.org/wiki/homework#English');
  assert.equal(result.entry?.senses[0]?.definition.source.license, 'CC BY-SA 4.0');
  assert.match(result.entry!.senses[0]!.definition.source.contentHash, /^[a-f0-9]{64}$/u);
  assert.deepEqual(result.entry?.pronunciations, []); assert.equal(calls, 1);
});

test('word lookup selects curriculum language and handles contractions without inventing pronunciation', async t => {
  const frenchId = ALL_SENTENCES.find(sentence => sentence.language === 'fr')!.id;
  let authorized: unknown;
  const app = await server(t, async url => {
    assert.equal(url, "https://en.wiktionary.org/api/rest_v1/page/definition/j'ai");
    return Response.json({ en: definition.en, fr: [{ partOfSpeech: 'Phrase', language: 'French', definitions: [{ definition: 'Contraction of <i>je</i> + <i>ai</i>.' }] }] });
  }, async (identity, language) => { authorized = [identity, language]; });
  const response = await app.post({ ...body, sentenceId: frenchId, word: 'j’ai' });
  const result = await checked(response); assert.equal(result.language, 'fr');
  assert.equal(result.entry!.senses[0]!.definition.text, 'Contraction of je + ai.');
  assert.equal(result.entry!.senses[0]!.definition.source.url, "https://en.wiktionary.org/wiki/j'ai#French");
  assert.deepEqual(authorized, [body.identity, 'fr']);
});

test('word lookup distinguishes missing entries and languages from unavailable dictionaries', async t => {
  let calls = 0;
  const app = await server(t, async url => {
    calls++;
    if (String(url).endsWith('/Homework')) return new Response(null, { status: 404 });
    return Response.json(definition);
  });
  const capitalized = await checked(await app.post({ ...body, word: 'Homework' }));
  assert.equal(capitalized.status, 'found'); assert.equal(capitalized.entry!.lemma, 'homework'); assert.equal(calls, 2);
  const missingLanguage = await checked(await app.post({ ...body, sentenceId: ALL_SENTENCES.find(sentence => sentence.language === 'fr')!.id }));
  assert.equal(missingLanguage.status, 'not-found'); assert.equal(missingLanguage.entry, null);
  const missing = await server(t, async () => new Response(null, { status: 404 }));
  assert.equal((await checked(await missing.post())).status, 'not-found');
  let failures = 0;
  const failed = await server(t, async () => { failures++; return new Response(null, { status: 503 }); });
  assert.equal((await failed.post({ ...body, word: 'Homework' })).status, 502); assert.equal(failures, 1, 'Operational failures never retry');
});

test('dictionary caches are bounded to public entries and never bypass per-request authorization', async t => {
  let calls = 0; let authorizations = 0;
  const app = await server(t, async () => { calls++; return Response.json(definition); }, async () => { if (++authorizations === 3) throw new Error('Denied'); });
  await checked(await app.post()); await checked(await app.post());
  assert.equal(calls, 1); assert.equal((await app.post()).status, 403); assert.equal(authorizations, 3); assert.equal(calls, 1);
});

test('word lookup rejects arbitrary URLs, malformed identities and foreign origins before dispatch', async t => {
  let calls = 0; const app = await server(t, async () => { calls++; return Response.json(definition); });
  assert.equal((await fetch(app.url)).status, 405);
  assert.equal((await app.post(body, { Origin: 'https://foreign.invalid' })).status, 403);
  assert.equal((await app.post(body, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await app.post(body, { 'Content-Type': 'text/plain' })).status, 415);
  for (const payload of [null, [], {}, { ...body, sentenceId: 'unknown' }, { ...body, language: 'fr' },
    { ...body, identity: { ...body.identity, generation: -1 } }, { ...body, identity: { ...body.identity, extra: true } },
    ...['', 'two words', '../secret', 'https://example.com', 'a?b', 'x'.repeat(81), '<script>', 'word\u0000'].map(word => ({ ...body, word }))]) {
    assert.equal((await app.post(payload)).status, 400);
  }
  assert.equal((await app.post({ ...body, word: 'x'.repeat(5000) })).status, 413); assert.equal(calls, 0);
});

test('dictionary markup remains inert and ordinary lexical senses precede symbols', async t => {
  const app = await server(t, async () => Response.json({ en: [
    { partOfSpeech: 'Symbol', language: 'English', definitions: [{ definition: 'Electric current.' }] },
    { partOfSpeech: 'Pronoun', language: 'English', definitions: [{ definition: 'The speaker &amp; writer.<script>steal()</script><img src="https://other.invalid/x">', examples: ['I&#39;m here.&nbsp;'] }] },
  ] }));
  const result = await checked(await app.post({ ...body, word: 'I' }));
  assert.equal(result.entry!.senses[0]!.partOfSpeech.text, 'Pronoun');
  assert.equal(result.entry!.senses[0]!.definition.text, 'The speaker & writer.');
  assert.equal(result.entry!.senses[0]!.examples[0]!.text, "I'm here.");
});

test('mixed Wiktionary language groups retain the English possessive meaning of my', async t => {
  // Reduced from the public /page/definition/my response observed on 2026-10-25.
  // English Wiktionary contributors, CC BY-SA 4.0; markup reduced for this fixture.
  const app = await server(t, async () => Response.json({ en: [
    { partOfSpeech: 'Symbol', language: 'Translingual', definitions: [{ definition: 'ISO 639-1 language code for <b>Burmese</b>.' }] },
    { partOfSpeech: 'Determiner', language: 'English', definitions: [{ definition: '<i>Belonging to <a href="/wiki/me">me</a>.</i>', examples: ["I can't find <b>my</b> book."] }] },
  ] }));
  const result = await checked(await app.post({ ...body, word: 'my' }));
  assert.equal(result.status, 'found'); assert.equal(result.entry!.senses.length, 1);
  assert.equal(result.entry!.senses[0]!.partOfSpeech.text, 'Determiner');
  assert.equal(result.entry!.senses[0]!.definition.text, 'Belonging to me.');
  assert.equal(result.entry!.senses[0]!.examples[0]!.text, "I can't find my book.");
  assert.doesNotMatch(JSON.stringify(result), /Burmese|Translingual/);
});

test('nonmatching dictionary language groups never become target-language definitions', async t => {
  const app = await server(t, async () => Response.json({ en: [
    { partOfSpeech: 'Symbol', language: 'Translingual', definitions: [{ definition: 'A language-neutral symbol.' }] },
    { partOfSpeech: 'Noun', language: 'French', definitions: [{ definition: 'An entry from another language.' }] },
  ] }));
  const result = await checked(await app.post());
  assert.equal(result.status, 'not-found'); assert.equal(result.entry, null);
});

test('dictionary excerpts remove editorial appendix navigation and repeated nested meanings', async t => {
  // Reduced from /page/definition/my on 2026-10-25: the first item includes
  // an unclosed nested list, and the next item repeats that list's first meaning.
  // English Wiktionary contributors, CC BY-SA 4.0; markup reduced for this fixture.
  const app = await server(t, async () => Response.json({ en: [{ partOfSpeech: 'Determiner', language: 'English', definitions: [
    { definition: '<i>First-person singular possessive determiner.</i> See <a href="/wiki/Appendix:Possessive#English">Appendix:Possessive#English</a>.\n<ol><li><i>Belonging to <a href="/wiki/me">me</a>.</i>', examples: ["I can't find <b>my</b> book."] },
    { definition: '<i>Belonging to <a href="/wiki/me">me</a>.</i>', examples: ["I can't find <b>my</b> book."] },
    { definition: '<i>Associated with me.</i>', examples: ["I can't find <b>my</b> book.", 'My seat was uncomfortable.'] },
  ] }] }));
  const result = await checked(await app.post({ ...body, word: 'my' }));
  assert.deepEqual(result.entry!.senses.map(sense => sense.definition.text), [
    'First-person singular possessive determiner. Belonging to me.', 'Associated with me.',
  ]);
  assert.deepEqual(result.entry!.senses.flatMap(sense => sense.examples.map(example => example.text)), [
    "I can't find my book.", 'My seat was uncomfortable.',
  ]);
  assert.doesNotMatch(JSON.stringify(result), /See Appendix|Possessive#English/);
});

test('editorial cleanup preserves lexical grammar links and distinct meanings', async t => {
  const app = await server(t, async () => Response.json({ en: [{ partOfSpeech: 'Pronoun', language: 'English', definitions: [
    { definition: 'A <a href="/wiki/Appendix:Glossary#pronoun">pronoun</a>. See also <a href="./Appendix:English_pronouns">this appendix</a>. <ol><li>Belonging to me.</li></ol>', examples: ['A shared example.'] },
    { definition: 'Not belonging to me. See Appendix:Possessive#English.', examples: ['A shared example.'] },
  ] }, { partOfSpeech: 'Determiner', language: 'English', definitions: [
    { definition: 'Belonging to me.', examples: ['A shared example.'] },
  ] }] }));
  const result = await checked(await app.post({ ...body, word: 'my' }));
  assert.deepEqual(result.entry!.senses.map(sense => sense.definition.text), [
    'A pronoun. Belonging to me.', 'Not belonging to me.', 'Belonging to me.',
  ]);
  assert.equal(result.entry!.senses.flatMap(sense => sense.examples).length, 1, 'Repeated examples do not hide distinct definitions or grammatical categories');
});

test('invalid and oversized dictionary responses never reach the learner as valid entries', async t => {
  for (const value of [[], null, { en: 'invalid' }, { en: [{ partOfSpeech: 'Noun', language: ['English'], definitions: [] }] }]) {
    const app = await server(t, async () => Response.json(value));
    assert.equal((await app.post()).status, 502);
  }
  let cancelled = false;
  const oversized = await server(t, async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(262145)); }, cancel() { cancelled = true; } })));
  assert.equal((await oversized.post()).status, 502); assert.equal(cancelled, true);
});

test('dictionary cancellation during authorization prevents remote lookup', async t => {
  let release = () => {}; let entered = () => {}; let calls = 0;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const app = await server(t, async () => { calls++; return Response.json(definition); }, async () => { entered(); await barrier; });
  let closed = () => {}; const onClose = new Promise<void>(resolve => { closed = resolve; });
  app.app.on('request', (_request, response) => response.once('close', closed));
  const controller = new AbortController();
  const pending = fetch(app.url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await started; controller.abort(); await rejected; await onClose; release();
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(calls, 0);
});

test('dictionary total deadline cancels a stalled provider stream', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started = () => {}; let cancelled = false;
  const onStart = new Promise<void>(resolve => { started = resolve; });
  const handler = createWordDictionaryHandler(config, async () => new Response(new ReadableStream({ start() { started(); }, cancel() { cancelled = true; } })));
  const incoming = new PassThrough(); Object.assign(incoming, { method: 'POST', headers: { origin, 'content-type': 'application/json' } });
  let status = 0;
  const outgoing = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
    writeHead(next: number) { status = next; }, end() { outgoing.writableEnded = true; },
  });
  const done = handler(incoming as unknown as IncomingMessage, outgoing as unknown as ServerResponse);
  incoming.end(JSON.stringify(body)); await onStart; await Promise.resolve();
  t.mock.timers.tick(WORD_DICTIONARY_TIMEOUT_MS); await done;
  assert.equal(status, 504); assert.equal(cancelled, true);
});

test('dictionary total deadline releases a stalled authorization without a remote lookup', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started = () => {}; let calls = 0;
  const onStart = new Promise<void>(resolve => { started = resolve; });
  const handler = createWordDictionaryHandler(config, async () => { calls++; return Response.json(definition); });
  const incoming = new PassThrough(); Object.assign(incoming, { method: 'POST', headers: { origin, 'content-type': 'application/json' } });
  let status = 0;
  const outgoing = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
    writeHead(next: number) { status = next; }, end() { outgoing.writableEnded = true; },
  });
  const done = handler(incoming as unknown as IncomingMessage, outgoing as unknown as ServerResponse,
    async () => { started(); await new Promise(() => {}); });
  incoming.end(JSON.stringify(body)); await onStart;
  t.mock.timers.tick(WORD_DICTIONARY_TIMEOUT_MS); await done;
  assert.equal(status, 504); assert.equal(calls, 0);
});

test('the dictionary broker authenticates and fails closed without owned sentence authorization', async t => {
  let calls = 0; let signedIn = false; let allowed = false; let rewriteChecks = 0;
  const authority: BrokerAuthority = {
    authenticate: async () => { if (!signedIn) throw new RepositoryError('unauthenticated'); return { userId: 'student' }; },
    reserve: async () => { throw new Error('Unused'); }, isEnded: async () => false,
    created: async () => {}, ended: async () => {}, rejected: async () => {}, authorizeRelease: async () => { throw new Error('Unused'); },
  };
  const app = createRealtimeServer({ ...config, apiKey: '', model: '', enabled: false, maxDurationSeconds: 600 },
    async () => { calls++; return Response.json(definition); }, undefined, undefined, authority);
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.closeAllConnections(); app.close(); });
  const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/realtime/word-dictionary`;
  const post = () => fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post()).status, 401); signedIn = true;
  assert.equal((await post()).status, 403); assert.equal(calls, 0);
  authority.authorizeSentenceRewrite = async () => { rewriteChecks++; throw new RepositoryError('conflict'); };
  assert.equal((await post()).status, 403); assert.equal(rewriteChecks, 0, 'Dictionary access never falls back to paid rewriting authority');
  authority.authorizeWordDictionary = async (actor, identity, language) => {
    assert.equal(actor.userId, 'student'); assert.deepEqual(identity, body.identity); assert.equal(language, 'en');
    if (!allowed) throw new RepositoryError('forbidden');
  };
  assert.equal((await post()).status, 403); assert.equal(calls, 0);
  allowed = true; await checked(await post()); assert.equal(calls, 1, 'Dictionary access needs no model credential or voice call');
  assert.equal(rewriteChecks, 0);
});
