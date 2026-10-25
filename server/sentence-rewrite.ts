import type { IncomingMessage, ServerResponse } from 'node:http';
import { ALL_SENTENCES } from '../src/content';
import { MAX_WRITTEN_COACHING_LENGTH,
  type ExerciseIdentity, type LearningLanguage, type WrittenCoachingFeedback, type SentenceRewriteRequest } from '../src/contracts';
import { writtenCoachingInstructions, WRITTEN_COACHING_RESPONSE_FORMAT, parseWrittenCoachingResult } from './written-coaching-prompt';

export interface SentenceRewriteConfig { apiKey: string; model: string; allowedOrigins: readonly string[] }
export const SENTENCE_REWRITE_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 8192;
const MAX_PROVIDER_BYTES = 65536;
const MAX_CONCURRENT = 2;
const REQUESTS_PER_MINUTE = 12;
const sentences = new Map(ALL_SENTENCES.map(sentence => [sentence.id, sentence]));
const unavailable = 'No pudimos corregir la frase. Intentá de nuevo.';
const instructions = writtenCoachingInstructions('sentence-example');

class RequestFailure extends Error { constructor(readonly status: number) { super('Sentence rewriting request failed.'); } }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, names: readonly string[]) {
  return Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
function id(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);
}
function parseRequest(value: unknown): SentenceRewriteRequest | null {
  if (!record(value) || !keys(value, ['identity', 'sentenceId', 'draft']) || !record(value.identity)
    || !keys(value.identity, ['sessionId', 'exerciseId', 'generation']) || !id(value.identity.sessionId) || !id(value.identity.exerciseId)
    || !Number.isSafeInteger(value.identity.generation) || (value.identity.generation as number) < 0
    || !id(value.sentenceId) || !sentences.has(value.sentenceId) || typeof value.draft !== 'string' || !value.draft.trim()
    || value.draft.length > MAX_WRITTEN_COACHING_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value.draft)) return null;
  return { identity: { sessionId: value.identity.sessionId, exerciseId: value.identity.exerciseId, generation: value.identity.generation as number }, sentenceId: value.sentenceId, draft: value.draft };
}
function reply(response: ServerResponse, status: number, body: object) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '60' } : {}) });
  response.end(JSON.stringify(body));
}
function readBody(request: IncomingMessage, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    function cleanup() { request.off('data', data); request.off('end', end); request.off('error', error); signal.removeEventListener('abort', aborted); }
    function error() { cleanup(); reject(new RequestFailure(400)); }
    function aborted() { cleanup(); request.resume(); reject(signal.reason); }
    function data(chunk: Buffer) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { cleanup(); request.resume(); reject(new RequestFailure(413)); }
      else chunks.push(Buffer.from(chunk));
    }
    function end() {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown); }
      catch { reject(new RequestFailure(400)); }
    }
    if (signal.aborted) { aborted(); return; }
    request.on('data', data); request.once('end', end); request.once('error', error); signal.addEventListener('abort', aborted, { once: true });
  });
}
async function providerJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new RequestFailure(502);
  if (Number(response.headers.get('content-length') ?? 0) > MAX_PROVIDER_BYTES) { await response.body.cancel(); throw new RequestFailure(502); }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const aborted = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', aborted, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read(); signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_PROVIDER_BYTES) { await reader.cancel(); throw new RequestFailure(502); }
      chunks.push(next.value);
    }
  } finally { signal.removeEventListener('abort', aborted); reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new RequestFailure(502); }
}
function feedback(value: unknown, draft: string): WrittenCoachingFeedback {
  if (!record(value) || value.status !== 'completed' || !Array.isArray(value.output)) throw new RequestFailure(502);
  const texts: string[] = [];
  for (const item of value.output) {
    if (!record(item)) throw new RequestFailure(502);
    if (item.type === 'reasoning') continue;
    if (item.type !== 'message' || item.role !== 'assistant' || !Array.isArray(item.content)) throw new RequestFailure(502);
    for (const part of item.content) {
      if (!record(part) || part.type !== 'output_text' || typeof part.text !== 'string') throw new RequestFailure(502);
      texts.push(part.text);
    }
  }
  if (texts.length !== 1) throw new RequestFailure(502);
  let decoded: unknown;
  try { decoded = JSON.parse(texts[0]!) as unknown; } catch { throw new RequestFailure(502); }
  const checked = parseWrittenCoachingResult(decoded, draft, 'sentence-example');
  if (!checked) throw new RequestFailure(502);
  return checked;
}

/** Each explicit written submission is independent of voice calls and progress evidence. */
export function createSentenceRewriteHandler(config: SentenceRewriteConfig, fetcher: typeof fetch = fetch) {
  type Authorize = (identity: ExerciseIdentity, language: LearningLanguage) => Promise<void>;
  let active = 0;
  let recent: number[] = [];
  return async (request: IncomingMessage, response: ServerResponse, authorize?: Authorize): Promise<void> => {
    if (request.method !== 'POST') { reply(response, 405, { error: 'POST required.' }); return; }
    if (!request.headers.origin || !config.allowedOrigins.includes(request.headers.origin)
      || request.headers['sec-fetch-site'] === 'cross-site') { reply(response, 403, { error: 'Origin not allowed.' }); return; }
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') { reply(response, 415, { error: 'JSON required.' }); return; }
    if (Number(request.headers['content-length'] ?? 0) > MAX_BODY_BYTES) { reply(response, 413, { error: 'Request too large.' }); return; }
    if (!config.apiKey.trim() || !config.model.trim()) { reply(response, 503, { error: unavailable }); return; }
    recent = recent.filter(timestamp => timestamp > Date.now() - 60000);
    if (active >= MAX_CONCURRENT || recent.length >= REQUESTS_PER_MINUTE) { reply(response, 429, { error: 'Esperá un momento antes de corregir otra frase.' }); return; }
    active++;
    const controller = new AbortController(); let timedOut = false;
    const disconnect = () => { if (!response.writableEnded) controller.abort(); };
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, SENTENCE_REWRITE_TIMEOUT_MS); timeout.unref();
    request.once('aborted', disconnect); response.once('close', disconnect);
    try {
      const body = parseRequest(await readBody(request, controller.signal));
      if (!body) throw new RequestFailure(400);
      const sentence = sentences.get(body.sentenceId)!; const language = sentence.language ?? 'en';
      if (authorize) {
        controller.signal.throwIfAborted();
        let aborted = () => {};
        const cancellation = new Promise<never>((_resolve, reject) => {
          aborted = () => reject(controller.signal.reason);
          controller.signal.addEventListener('abort', aborted, { once: true });
        });
        try { await Promise.race([authorize(body.identity, language), cancellation]); }
        catch { throw new RequestFailure(403); }
        finally { controller.signal.removeEventListener('abort', aborted); }
      }
      controller.signal.throwIfAborted();
      recent = recent.filter(timestamp => timestamp > Date.now() - 60000);
      if (recent.length >= REQUESTS_PER_MINUTE) throw new RequestFailure(429);
      recent.push(Date.now());
      const upstream = await fetcher('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ model: config.model, reasoning: { effort: 'none' }, store: false, max_output_tokens: 700, instructions,
          input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify({
            targetLanguage: language === 'fr' ? 'French' : 'English', baseLanguage: 'Spanish',
            optionalInspiration: sentence.spanish,
            learnerDraft: body.draft,
          }) }] }],
          text: { format: WRITTEN_COACHING_RESPONSE_FORMAT },
        }),
      });
      if (!upstream.ok) { await upstream.body?.cancel(); throw new RequestFailure(502); }
      const result = feedback(await providerJson(upstream, controller.signal), body.draft); controller.signal.throwIfAborted();
      reply(response, 200, result);
    } catch (error) {
      const status = timedOut ? 504 : error instanceof RequestFailure ? error.status : 502;
      reply(response, status, { error: status === 400 ? 'La frase o el ejercicio no son válidos.' : status === 413 ? 'La frase es demasiado larga.' : unavailable });
    } finally {
      active--; clearTimeout(timeout); request.off('aborted', disconnect); response.off('close', disconnect);
    }
  };
}
