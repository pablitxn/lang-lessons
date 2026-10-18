import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRealtimeServer } from '../server/realtime';
import type { BrokerAuthority } from '../server/broker/authority';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

// Counter-regression for P7 reproduction 74988d4, using injected transport only.
test('cancel during broker reservation rejects the undispatched receipt and releases local capacity', async () => {
  let release!: () => void; let entered!: () => void; let rejected!: () => void;
  const reservationEntered = new Promise<void>(resolve => entered = resolve);
  const barrier = new Promise<void>(resolve => release = resolve);
  const reservationRejected = new Promise<void>(resolve => rejected = resolve);
  let providerCalls = 0; let rejectedCount = 0; let createdCount = 0;
  const authority: BrokerAuthority = {
    authenticate: async () => ({ userId: 'actor' }),
    reserve: async (identity, segment, token) => { entered(); await barrier; return { identity, segment: segment as any, tokenDigest: token }; },
    isEnded: async () => false, created: async () => { createdCount++; }, ended: async () => {},
    rejected: async () => { rejectedCount++; rejected(); }, authorizeRelease: async () => { throw new Error('Unused'); },
  };
  const provider: typeof fetch = async () => { providerCalls++; return new Response('v=0\r\n', { status: 201, headers: { location: '/v1/realtime/calls/mock-call' } }); };
  const origin = 'http://127.0.0.1:5200';
  const server = createRealtimeServer({ enabled: true, apiKey: 'mock-only', model: 'fixture', allowedOrigins: [origin], maxDurationSeconds: 600 }, provider, undefined, undefined, authority);
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
  let sawClose!: () => void; const closed = new Promise<void>(resolve => sawClose = resolve);
  server.on('request', (_request, response) => response.once('close', sawClose));
  const url = `http://127.0.0.1:${address.port}/api/realtime/session`;
  const init = { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ sdp: 'v=0\r\n', segment: { sessionId: 's', segmentId: 'c', connectionEpoch: 1 } }) };
  try {
    const abort = new AbortController(); const response = fetch(url, { ...init, signal: abort.signal }).catch(() => null);
    await reservationEntered; abort.abort(); await response; await closed;
    release(); await reservationRejected; await tick();
    assert.equal(providerCalls, 0); assert.equal(createdCount, 0); assert.equal(rejectedCount, 1);
    assert.equal((await fetch(url, init)).status, 200, 'a later explicit start can use the released capacity');
    assert.equal(providerCalls, 1); assert.equal(createdCount, 1);
  } finally { release(); await tick(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
