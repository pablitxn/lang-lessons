import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import { createRealtimeServer, readBrokerConfig, type BrokerConfig } from '../server/realtime';

const origin = 'http://127.0.0.1:5174';
const config: BrokerConfig = { enabled: true, apiKey: 'injected-test-secret', model: 'fixture-model', allowedOrigins: [origin], maxDurationSeconds: 600 };
const answer = () => new Response('v=0\r\nfixture-answer', { headers: { Location: '/v1/realtime/calls/rtc_fixture' } });
async function broker(t: TestContext, configuration = config, fetcher: typeof fetch = async () => answer()) {
  const server = createRealtimeServer(configuration, fetcher);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown = { sdp: 'v=0\r\nfixture-offer' }, headers: Record<string, string> = {}) => fetch(`${url}/api/realtime/session`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const end = (releaseToken: string, headers: Record<string, string> = {}) => fetch(`${url}/api/realtime/session/end`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ releaseToken }),
  });
  return { url, post, end, server };
}
test('broker stays disabled by default and status never exposes a secret', async t => {
  let calls = 0;
  const b = await broker(t, readBrokerConfig({ OPENAI_API_KEY: 'injected-test-secret' }), async () => { calls++; throw Error('unexpected'); });
  const status = await fetch(`${b.url}/api/realtime/status`);
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await status.json(), { enabled: false, reason: 'disabled', maxDurationSeconds: 600 });
  assert.equal((await b.post()).status, 503);
  assert.equal(calls, 0);
});
test('the broker routes written hints while voice is disabled using the configured text model', async t => {
  const configuration = readBrokerConfig({ OPENAI_API_KEY: 'injected-test-secret', OPENAI_HINT_MODEL: 'fixture-hint-model' });
  assert.equal(configuration.enabled, false);
  let calls = 0;
  const b = await broker(t, configuration, async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer injected-test-secret');
    const sent = JSON.parse(String(init?.body));
    assert.equal(sent.model, 'fixture-hint-model');
    assert.equal(sent.store, false);
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify({ hint: 'Revisa la concordancia del verbo con quien realiza la acción.' }) }] }] });
  });
  assert.equal((await b.post()).status, 503);
  assert.equal(calls, 0);
  const response = await fetch(`${b.url}/api/realtime/sentence-hint`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ helpEnabled: true, sentenceId: 'sentence-ps-bread', draft: 'He buy bread every morning.' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const output = await response.text();
  assert.deepEqual(JSON.parse(output), { hint: 'Revisa la concordancia del verbo con quien realiza la acción.' });
  assert.doesNotMatch(output, /injected-test-secret|fixture-hint-model|Authorization/);
  assert.equal(calls, 1);
});
test('the broker rejects a hostile Host before dispatching written hints', async t => {
  let calls = 0;
  const b = await broker(t, { ...config, enabled: false }, async () => { calls++; throw new Error('injected-test-secret'); });
  const output = await new Promise<{ status: number | undefined; text: string }>((resolve, reject) => {
    const req = request(`${b.url}/api/realtime/sentence-hint`, { method: 'POST',
      headers: { Host: 'foreign.invalid', Origin: origin, 'Content-Type': 'application/json' } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, text }));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ helpEnabled: true, sentenceId: 'sentence-ps-bread', draft: 'He buy bread every morning.' }));
  });
  assert.equal(output.status, 403); assert.equal(calls, 0);
  assert.doesNotMatch(output.text, /injected-test-secret|He buy|provider/);
});
test('the broker supplies the default text model and redacts hint provider failures', async t => {
  let calls = 0;
  const b = await broker(t, { ...config, enabled: false }, async (url, init) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(JSON.parse(String(init?.body)).model, 'gpt-6-luna');
    throw new Error('injected-test-secret private provider details');
  });
  const response = await fetch(`${b.url}/api/realtime/sentence-hint`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ helpEnabled: true, sentenceId: 'sentence-ps-bread', draft: 'He buy bread every morning.' }),
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Sentence help is unavailable. Please try again.' });
  assert.equal(calls, 1);
});
test('readiness distinguishes local opt-in from missing credentials without contacting the provider', async t => {
  let calls = 0;
  for (const [environment, reason] of [
    [{}, 'disabled'],
    [{ ALLOW_PAID_VOICE: '1' }, 'missing-credentials'],
    [{ ALLOW_PAID_VOICE: '1', OPENAI_API_KEY: 'injected-test-secret' }, 'ready'],
  ] as const) {
    const b = await broker(t, readBrokerConfig(environment), async () => { calls++; throw Error('unexpected'); });
    const response = await fetch(`${b.url}/api/realtime/status`);
    assert.deepEqual(await response.json(), { enabled: reason === 'ready', reason, maxDurationSeconds: 600 });
  }
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
    return answer();
  });
  const response = await b.post();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sdp, 'v=0\r\nfixture-answer'); assert.equal(body.maxDurationSeconds, 600);
  assert.match(body.releaseToken, /^[A-Za-z0-9_-]{32,128}$/);
  assert.equal((await b.post()).status, 429); assert.equal(calls, 1);
});
test('broker redacts upstream failures and leases a successful but invalid exchange', async t => {
  const failed = await broker(t, config, async () => new Response('injected-test-secret provider-detail', { status: 401 }));
  const response = await failed.post();
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /secret|provider-detail/);
  const invalid = await broker(t, config, async () => new Response('invalid SDP'));
  assert.equal((await invalid.post()).status, 502); assert.equal((await invalid.post()).status, 429);
});

test('release requires the matching token and a confirmed provider hangup before another call', async t => {
  let creations = 0; let hangups = 0;
  const b = await broker(t, config, async (url, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer injected-test-secret');
    if (String(url).endsWith('/rtc_fixture/hangup')) { hangups++; return new Response(null, { status: 200 }); }
    creations++; return answer();
  });
  const first = await (await b.post()).json();
  assert.equal((await b.end('wrong-release-token-00000000000000')).status, 403);
  assert.equal((await b.end(first.releaseToken, { Origin: 'https://foreign.invalid' })).status, 403);
  assert.equal(hangups, 0); assert.equal((await b.post()).status, 429);
  assert.equal((await b.end(first.releaseToken)).status, 200); assert.equal(hangups, 1);
  assert.equal((await b.end(first.releaseToken)).status, 200); assert.equal(hangups, 1);
  const second = await (await b.post()).json();
  assert.notEqual(first.releaseToken, second.releaseToken);
  assert.equal((await b.end(first.releaseToken)).status, 403); assert.equal(hangups, 1);
  assert.equal((await b.end(second.releaseToken)).status, 200); assert.equal(hangups, 2); assert.equal(creations, 2);
});

test('failed hangup preserves the lease and an explicit release retry can recover it', async t => {
  let canEnd = false; let creations = 0;
  const b = await broker(t, config, async url => {
    if (String(url).endsWith('/hangup')) return new Response(null, { status: canEnd ? 200 : 502 });
    creations++; return answer();
  });
  const first = await (await b.post()).json();
  assert.equal((await b.end(first.releaseToken)).status, 502);
  assert.equal((await b.post()).status, 429); assert.equal(creations, 1);
  canEnd = true; assert.equal((await b.end(first.releaseToken)).status, 200);
  assert.equal((await b.post()).status, 200); assert.equal(creations, 2);
});

test('concurrent release is idempotent and session creation waits for confirmed hangup', async t => {
  let finishHangup!: () => void; let started!: () => void; let creations = 0; let hangups = 0;
  const beginning = new Promise<void>(resolve => { started = resolve; });
  const b = await broker(t, config, async url => {
    if (String(url).endsWith('/hangup')) {
      hangups++; started(); await new Promise<void>(resolve => { finishHangup = resolve; });
      return new Response(null, { status: 200 });
    }
    creations++; return answer();
  });
  const first = await (await b.post()).json();
  const closing = b.end(first.releaseToken); await beginning;
  // fetch() schedules transport; it does not prove that the broker received the
  // duplicate before the next lease replaced the old token. Hold hangup until
  // both requests have actually entered their waiting paths.
  const duplicateArrived = new Promise<void>(resolve => b.server.once('request', request => {
    request.once('end', () => setImmediate(resolve));
  }));
  const duplicate = b.end(first.releaseToken); await duplicateArrived;
  const nextArrived = new Promise<void>(resolve => b.server.once('request', () => setImmediate(resolve)));
  const next = b.post(); await nextArrived;
  assert.equal(creations, 1); assert.equal(hangups, 1);
  finishHangup();
  assert.equal((await closing).status, 200); assert.equal((await duplicate).status, 200);
  assert.equal((await next).status, 200); assert.equal(creations, 2); assert.equal(hangups, 1);
});

test('missing or unsafe provider call locations retain the conservative lease', async t => {
  for (const location of ['', 'https://foreign.invalid/v1/realtime/calls/rtc_fixture', '/v1/realtime/calls/../../other',
    '/v1/realtime/calls/rtc_fixture?secret=fixture']) {
    let calls = 0;
    const b = await broker(t, config, async () => {
      calls++; return new Response('v=0\r\nfixture-answer', { headers: { Location: location } });
    });
    assert.equal((await b.post()).status, 502); assert.equal((await b.post()).status, 429); assert.equal(calls, 1);
  }
});

test('an aborted browser setup hangs up a successful upstream call before releasing its lease', async t => {
  let giveAnswer!: () => void; let creationStarted!: () => void; let callEnded!: () => void; let creations = 0;
  const creating = new Promise<void>(resolve => { creationStarted = resolve; });
  const ended = new Promise<void>(resolve => { callEnded = resolve; });
  const b = await broker(t, config, async url => {
    if (String(url).endsWith('/hangup')) { callEnded(); return new Response(null, { status: 200 }); }
    if (++creations === 1) { creationStarted(); await new Promise<void>(resolve => { giveAnswer = resolve; }); }
    return answer();
  });
  const controller = new AbortController();
  const requestPromise = fetch(`${b.url}/api/realtime/session`, { method: 'POST', signal: controller.signal,
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: 'v=0\r\nfixture-offer' }) });
  const cancelled = assert.rejects(requestPromise, { name: 'AbortError' });
  await creating; controller.abort(); await cancelled;
  // The client socket must close before the injected upstream responds.
  await new Promise(resolve => setTimeout(resolve, 10)); giveAnswer(); await ended;
  assert.equal((await b.post()).status, 200); assert.equal(creations, 2);
});

test('an ambiguous upstream failure retains its lease while a definitive rejection permits retry', async t => {
  let uncertainCalls = 0;
  const uncertain = await broker(t, config, async () => { uncertainCalls++; throw new Error('Injected timeout after dispatch'); });
  assert.equal((await uncertain.post()).status, 502);
  assert.equal((await uncertain.post()).status, 429); assert.equal(uncertainCalls, 1);
  let rejectedCalls = 0;
  const rejected = await broker(t, config, async () => ++rejectedCalls === 1 ? new Response('', { status: 401 }) : answer());
  assert.equal((await rejected.post()).status, 502); assert.equal((await rejected.post()).status, 200);
});

test('unusable successful SDP closes a known provider call before allowing an explicit retry', async t => {
  const unusableAnswers = [
    () => new Response('invalid SDP', { headers: { Location: '/v1/realtime/calls/rtc_fixture' } }),
    () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('Injected provider body failure')); } }),
      { headers: { Location: '/v1/realtime/calls/rtc_fixture' } }),
  ];
  for (const unusable of unusableAnswers) {
    let creations = 0; let hangups = 0;
    const b = await broker(t, config, async url => {
      if (String(url).endsWith('/rtc_fixture/hangup')) { hangups++; return new Response(null, { status: 200 }); }
      return ++creations === 1 ? unusable() : answer();
    });
    const failed = await b.post();
    assert.equal(failed.status, 502); assert.doesNotMatch(await failed.text(), /Injected|rtc_fixture|releaseToken/);
    assert.equal(hangups, 1);
    assert.equal((await b.post()).status, 200); assert.equal(creations, 2);
  }
});

test('an unusable successful SDP retains its lease when the known call cannot be hung up', async t => {
  let creations = 0; let hangups = 0;
  const b = await broker(t, config, async url => {
    if (String(url).endsWith('/rtc_fixture/hangup')) { hangups++; return new Response(null, { status: 502 }); }
    creations++; return new Response('invalid SDP', { headers: { Location: '/v1/realtime/calls/rtc_fixture' } });
  });
  assert.equal((await b.post()).status, 502); assert.equal(hangups, 1);
  assert.equal((await b.post()).status, 429); assert.equal(creations, 1);
});
