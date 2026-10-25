import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ALL_SENTENCES } from '../src/content';
import type { DictionaryEntry, DictionarySense, DictionarySource, ExerciseIdentity, LearningLanguage,
  SourcedDictionaryText, WordDictionaryRequest, WordDictionaryResponse } from '../src/contracts';

export interface WordDictionaryConfig { allowedOrigins: readonly string[] }
export const WORD_DICTIONARY_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 4096;
const MAX_PROVIDER_BYTES = 262144;
const MAX_CONCURRENT = 4;
const REQUESTS_PER_MINUTE = 60;
const CACHE_SIZE = 256;
const sentences = new Map(ALL_SENTENCES.map(sentence => [sentence.id, sentence]));
const unavailable = 'El diccionario no está disponible en este momento. Podés volver a intentarlo.';
const userAgent = 'LangLessons/0.1 (https://github.com/pablitxn/lang-lessons)';

class DictionaryFailure extends Error { constructor(readonly status: number) { super('Dictionary lookup failed.'); } }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, names: readonly string[]) { return Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)); }
function validId(value: unknown): value is string { return typeof value === 'string' && !!value.trim() && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value); }
function parseRequest(value: unknown): WordDictionaryRequest | null {
  if (!record(value) || !keys(value, ['identity', 'sentenceId', 'word']) || !record(value.identity)
    || !keys(value.identity, ['sessionId', 'exerciseId', 'generation']) || !validId(value.identity.sessionId) || !validId(value.identity.exerciseId)
    || !Number.isSafeInteger(value.identity.generation) || (value.identity.generation as number) < 0
    || !validId(value.sentenceId) || !sentences.has(value.sentenceId) || typeof value.word !== 'string'
    || value.word.length > 80 || !/^\p{L}[\p{L}\p{M}'’\-]*$/u.test(value.word)) return null;
  return { identity: { sessionId: value.identity.sessionId, exerciseId: value.identity.exerciseId, generation: value.identity.generation as number },
    sentenceId: value.sentenceId, word: value.word.normalize('NFC').replaceAll('’', "'") };
}
function reply(response: ServerResponse, status: number, body: object) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...(status === 429 ? { 'Retry-After': '60' } : {}) });
  response.end(JSON.stringify(body));
}
function readBody(request: IncomingMessage, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    function cleanup() { request.off('data', data); request.off('end', end); request.off('error', error); signal.removeEventListener('abort', aborted); }
    function error() { cleanup(); reject(new DictionaryFailure(400)); }
    function aborted() { cleanup(); request.resume(); reject(signal.reason); }
    function data(chunk: Buffer) { size += chunk.length; if (size > MAX_BODY_BYTES) { cleanup(); request.resume(); reject(new DictionaryFailure(413)); } else chunks.push(Buffer.from(chunk)); }
    function end() { cleanup(); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown); } catch { reject(new DictionaryFailure(400)); } }
    if (signal.aborted) { aborted(); return; }
    request.on('data', data); request.once('end', end); request.once('error', error); signal.addEventListener('abort', aborted, { once: true });
  });
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<{ data: unknown; hash: string }> {
  if (!response.body) throw new DictionaryFailure(502);
  if (Number(response.headers.get('content-length') ?? 0) > MAX_PROVIDER_BYTES) { await response.body.cancel(); throw new DictionaryFailure(502); }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const aborted = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', aborted, { once: true });
  try {
    while (true) {
      signal.throwIfAborted(); const part = await reader.read(); signal.throwIfAborted();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_PROVIDER_BYTES) { await reader.cancel(); throw new DictionaryFailure(502); }
      chunks.push(part.value);
    }
  } finally { signal.removeEventListener('abort', aborted); reader.releaseLock(); }
  const raw = Buffer.concat(chunks);
  try { return { data: JSON.parse(raw.toString('utf8')) as unknown, hash: createHash('sha256').update(raw).digest('hex') }; }
  catch { throw new DictionaryFailure(502); }
}
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Provider markup is converted to inert plain text; it is never rendered or fetched. */
function plainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.length > 32768) return null;
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
    hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â',
    ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ugrave: 'ù', ucirc: 'û', uuml: 'ü', oelig: 'œ' };
  const text = value.replace(/<!--[^]*?-->/gu, '').replace(/<(script|style|svg|math|iframe|template)\b[^>]*>[^]*?<\/\1\s*>/giu, '')
    // Keep lexical glossary links, but omit explicit editorial navigation sentences.
    .replace(/\b(?:see(?:\s+also)?|cf\.)\s+<a\b[^>]*href=["'](?:\.\/|\/wiki\/)(?:Appendix|Wiktionary|Help|Category)(?::|%3a)[^"']*["'][^>]*>[^]*?<\/a>\s*[.;]?/giu, '')
    .replace(/<\/?(?:br|p|li|ol|ul)\b[^>]*>/giu, ' ').replace(/<[^>]*>/gu, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (all, name: string) => {
      if (!name.startsWith('#')) return entities[name] ?? all;
      const number = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
    }).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/gu, ' ').replace(/\s+/gu, ' ')
    .replace(/\b(?:see(?:\s+also)?|cf\.)\s+(?:Appendix|Wiktionary|Help|Category):[^\s.;!?]+[.;!?]?/giu, '').replace(/\s+/gu, ' ').trim();
  return text && text.length <= maxLength ? text : null;
}

/** Wiktionary may repeat an embedded list item as the following standalone sense. */
function nestedDefinitions(value: unknown): string[] {
  if (typeof value !== 'string' || value.length > 32768 || !/<(?:ol|ul)\b/iu.test(value)) return [];
  return [...value.matchAll(/<li\b[^>]*>([^]*?)(?=<\/li\s*>|<li\b|<\/(?:ol|ul)\s*>|$)/giu)]
    .map(match => plainText(match[1], 1200)).filter((text): text is string => text !== null);
}

function entryFrom(data: unknown, word: string, language: LearningLanguage, hash: string): DictionaryEntry | null {
  if (!record(data)) throw new DictionaryFailure(502);
  const groups = data[language];
  if (groups === undefined) return null;
  if (!Array.isArray(groups) || groups.length > 100) throw new DictionaryFailure(502);
  const languageName = language === 'fr' ? 'French' : 'English';
  const source: DictionarySource = { url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#${languageName}`,
    snapshotId: 'wiktionary-live-definition', retrievedOn: new Date().toISOString().slice(0, 10), contentHash: hash,
    license: 'CC BY-SA 4.0', attribution: `English Wiktionary contributors — ${word}` };
  const sourced = (text: string): SourcedDictionaryText => ({ text, source });
  // The API includes Translingual groups inside `en` for words such as my/I/it.
  // Keep only explicitly matching senses instead of rejecting the whole entry.
  const usable = groups.map(group => {
    if (!record(group) || typeof group.partOfSpeech !== 'string' || typeof group.language !== 'string' || !Array.isArray(group.definitions)) throw new DictionaryFailure(502);
    return group;
  }).filter(group => group.language === languageName)
    .sort((a, b) => Number(/^(?:Letter|Symbol|Numeral)$/iu.test(a.partOfSpeech as string)) - Number(/^(?:Letter|Symbol|Numeral)$/iu.test(b.partOfSpeech as string)));
  const senses: DictionarySense[] = [];
  const seenDefinitions = new Set<string>();
  const seenExamples = new Set<string>();
  for (const [groupIndex, group] of usable.slice(0, 3).entries()) {
    const partOfSpeech = plainText(group.partOfSpeech, 80);
    if (!partOfSpeech) continue;
    let included = 0;
    for (const [index, item] of (group.definitions as unknown[]).slice(0, 50).entries()) {
      if (!record(item)) throw new DictionaryFailure(502);
      const definition = plainText(item.definition, 1200);
      if (!definition) continue;
      const definitionKey = `${partOfSpeech}\u0000${definition.normalize('NFC')}`;
      if (seenDefinitions.has(definitionKey)) continue;
      const example = Array.isArray(item.examples) ? item.examples.slice(0, 20).map(value => plainText(value, 600))
        .find((value): value is string => !!value && !seenExamples.has(value.normalize('NFC'))) : undefined;
      senses.push({ id: `${language}:${word}:${groupIndex}:${index}`, definition: sourced(definition), partOfSpeech: sourced(partOfSpeech), examples: example ? [sourced(example)] : [] });
      seenDefinitions.add(definitionKey);
      for (const nested of nestedDefinitions(item.definition)) seenDefinitions.add(`${partOfSpeech}\u0000${nested.normalize('NFC')}`);
      if (example) seenExamples.add(example.normalize('NFC'));
      if (++included === 2) break;
    }
  }
  return senses.length ? { lemma: word, senses, pronunciations: [] } : null;
}

/** Read-only public dictionary access, independently of models, voice and progress. */
export function createWordDictionaryHandler(config: WordDictionaryConfig, fetcher: typeof fetch = fetch) {
  type Authorize = (identity: ExerciseIdentity, language: LearningLanguage) => Promise<void>;
  let active = 0; let recent: number[] = [];
  const cache = new Map<string, { entry: DictionaryEntry | null; expires: number }>();
  async function lookup(word: string, language: LearningLanguage, signal: AbortSignal): Promise<DictionaryEntry | null> {
    const alternatives = [...new Set([word, word.toLocaleLowerCase(language)])];
    for (const alternative of alternatives) {
      const upstream = await fetcher(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(alternative)}`, {
        headers: { Accept: 'application/json', 'User-Agent': userAgent }, signal, redirect: 'error',
      });
      if (upstream.status === 404) { await upstream.body?.cancel(); continue; }
      if (!upstream.ok) { await upstream.body?.cancel(); throw new DictionaryFailure(502); }
      const { data, hash } = await boundedJson(upstream, signal);
      const entry = entryFrom(data, alternative, language, hash);
      if (entry) return entry;
    }
    return null;
  }
  return async (request: IncomingMessage, response: ServerResponse, authorize?: Authorize): Promise<void> => {
    if (request.method !== 'POST') { reply(response, 405, { error: 'POST required.' }); return; }
    if (!request.headers.origin || !config.allowedOrigins.includes(request.headers.origin) || request.headers['sec-fetch-site'] === 'cross-site') { reply(response, 403, { error: 'Origin not allowed.' }); return; }
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') { reply(response, 415, { error: 'JSON required.' }); return; }
    if (Number(request.headers['content-length'] ?? 0) > MAX_BODY_BYTES) { reply(response, 413, { error: 'Request too large.' }); return; }
    if (active >= MAX_CONCURRENT) { reply(response, 429, { error: 'Esperá un momento antes de buscar otra palabra.' }); return; }
    active++;
    const controller = new AbortController(); let timedOut = false;
    const disconnect = () => { if (!response.writableEnded) controller.abort(); };
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, WORD_DICTIONARY_TIMEOUT_MS); timeout.unref();
    request.once('aborted', disconnect); response.once('close', disconnect);
    try {
      const body = parseRequest(await readBody(request, controller.signal));
      if (!body) throw new DictionaryFailure(400);
      const language = sentences.get(body.sentenceId)!.language ?? 'en';
      if (authorize) { try { await untilAborted(authorize(body.identity, language), controller.signal); } catch { throw new DictionaryFailure(403); } }
      controller.signal.throwIfAborted();
      const key = `${language}:${body.word}`;
      const cached = cache.get(key);
      let entry = cached && cached.expires > Date.now() ? cached.entry : undefined;
      if (entry === undefined) {
        recent = recent.filter(time => time > Date.now() - 60000);
        if (recent.length >= REQUESTS_PER_MINUTE) throw new DictionaryFailure(429);
        recent.push(Date.now());
        entry = await lookup(body.word, language, controller.signal);
        controller.signal.throwIfAborted();
        cache.delete(key); cache.set(key, { entry, expires: Date.now() + (entry ? 86400000 : 300000) });
        if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
      }
      const result: WordDictionaryResponse = { status: entry ? 'found' : 'not-found', word: body.word, language, entry, definitionLanguage: 'en' };
      reply(response, 200, result);
    } catch (error) {
      const status = timedOut ? 504 : error instanceof DictionaryFailure ? error.status : 502;
      reply(response, status, { error: status === 400 ? 'La palabra o el ejercicio no son válidos.' : status === 413 ? 'La solicitud es demasiado larga.' : unavailable });
    } finally { active--; clearTimeout(timeout); request.off('aborted', disconnect); response.off('close', disconnect); }
  };
}
