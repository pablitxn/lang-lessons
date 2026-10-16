import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import { createRealtimeServer, readBrokerConfig, type BrokerConfig } from '../server/realtime';

const origin = 'http://127.0.0.1:5174';
const config: BrokerConfig = { enabled: true, apiKey: 'injected-test-secret', model: 'fixture-model', allowedOrigins: [origin], maxDurationSeconds: 600 };
async function broker(t: TestContext, configuration = config, fetcher: typeof fetch = async () => new Response('v=0\r\nfixture-answer')) {
  const server = createRealtimeServer(configuration, fetcher);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown = { sdp: 'v=0\r\nfixture-offer' }, headers: Record<string, string> = {}) => fetch(`${url}/api/realtime/session`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { url, post };
}
test('broker stays disabled by default and status never exposes a secret', async t => {
  let calls = 0;
  const b = await broker(t, readBrokerConfig({ OPENAI_API_KEY: 'injected-test-secret' }), async () => { calls++; throw Error('unexpected'); });
  const status = await fetch(`${b.url}/api/realtime/status`);
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await status.json(), { enabled: false, maxDurationSeconds: 600 });
  assert.equal((await b.post()).status, 503);
  assert.equal(calls, 0);
});
test('broker rejects hostile origins, hosts and malformed offers before upstream', async t => {
  let calls = 0;
  const b = await broker(t, config, async () => { calls++; throw Error('unexpected'); });
  for (const headers of [{ Origin: 'https://foreign.invalid' }, { Host: 'foreign.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    // Native fetch rewrites Host/Sec-Fetch-*; exercise the actual HTTP boundary.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${b.url}/api/realtime/session`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      });
      req.on('error', reject); req.end(JSON.stringify({ sdp: 'v=0\r\nfixture-offer' }));
    });
    assert.equal(status, 403, JSON.stringify(headers));
  }
  assert.equal((await b.post({}, { 'Content-Type': 'text/plain' })).status, 415);
  for (const body of [{}, { sdp: 'invalid' }, { sdp: 'v=0\r\nvalid', key: 'extra' }]) assert.equal((await b.post(body)).status, 400);
  assert.equal((await b.post({ sdp: 'x'.repeat(70000) })).status, 413);
  assert.equal(calls, 0);
});
test('broker exchanges only server credentials and blocks a second active paid session', async t => {
  let calls = 0;
  const b = await broker(t, config, async (url, init) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer injected-test-secret');
    const session = JSON.parse(String((init?.body as FormData).get('session')));
    assert.equal(session.model, 'fixture-model');
    assert.equal(session.audio.input.turn_detection.create_response, false);
    return new Response('v=0\r\nfixture-answer');
  });
  const response = await b.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sdp: 'v=0\r\nfixture-answer', maxDurationSeconds: 600 });
  assert.equal((await b.post()).status, 429); assert.equal(calls, 1);
});
test('broker redacts upstream failures and leases a successful but invalid exchange', async t => {
  const failed = await broker(t, config, async () => new Response('injected-test-secret provider-detail', { status: 401 }));
  const response = await failed.post();
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /secret|provider-detail/);
  const invalid = await broker(t, config, async () => new Response('invalid SDP'));
  assert.equal((await invalid.post()).status, 502); assert.equal((await invalid.post()).status, 429);
});
