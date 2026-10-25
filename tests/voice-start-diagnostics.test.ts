import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceStartFailure } from '../src/contracts';
import { readBoundedJsonResponse } from '../src/platform/bounded-json';

test('startup diagnostics accept only known categories with matching provider statuses', () => {
  for (const failure of [
    { category: 'authentication', status: 401 }, { category: 'permission', status: 403 },
    { category: 'quota', status: 429 }, { category: 'credits-exhausted', status: 429 },
    { category: 'project-spend-limit', status: 429 }, { category: 'organization-spend-limit', status: 429 },
    { category: 'usage-limit', status: 429 }, { category: 'rate-limit', status: 429 },
    { category: 'configuration', status: 400 }, { category: 'configuration', status: 422 },
    { category: 'model-unavailable', status: 404 }, { category: 'unavailable', status: 503 },
    { category: 'rejected', status: 409 },
  ]) assert.deepEqual(parseVoiceStartFailure(failure), failure);
  for (const failure of [
    null, [], 'quota', { category: 'quota', status: 401 }, { category: 'permission', status: 500 },
    { category: 'authentication', status: '401' }, { category: 'configuration', status: 200 },
    { category: 'unavailable', status: 429 }, { category: 'model-unavailable', status: 400 },
    { category: 'PRIVATE_PROVIDER_TEXT', status: 429 }, { category: 'quota', status: 429, message: 'private' },
    { category: 'rejected', status: NaN }, { category: 'rejected', status: 599.5 },
  ]) assert.equal(parseVoiceStartFailure(failure), null);
});

test('diagnostic JSON reading is bounded by UTF-8 bytes and cancels oversized streams', async () => {
  assert.deepEqual(await readBoundedJsonResponse(Response.json({ error: { code: 'insufficient_quota' } })), { error: { code: 'insufficient_quota' } });
  assert.equal(await readBoundedJsonResponse(new Response('not JSON')), null);
  const locked = Response.json({ error: 'private' }); const lock = locked.body!.getReader();
  assert.equal(await readBoundedJsonResponse(locked), null); lock.releaseLock();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(JSON.stringify({ text: 'é'.repeat(2200) })));
  }, cancel() { cancelled = true; } });
  assert.equal(await readBoundedJsonResponse(new Response(body)), null);
  assert.equal(cancelled, true);
});

test('stalled diagnostic bodies time out without waiting for provider cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; return new Promise(() => {}); } });
  const pending = readBoundedJsonResponse(new Response(body));
  t.mock.timers.tick(1000);
  assert.equal(await pending, null);
  assert.equal(cancelled, true);
});
