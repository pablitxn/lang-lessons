import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationClient } from '../src/platform/application-client';

test('entering practice uses an atomic own-account command and keeps call state separate', async () => {
  const session = { sessionId: 'saved', mode: 'sentence', status: 'open', revision: 3 };
  const client = createApplicationClient(async (path, init) => {
    assert.equal(init?.credentials, 'same-origin');
    if (path === '/api/learning/session/enter') {
      assert.deepEqual(JSON.parse(String(init?.body)), { mode: 'sentence', operationId: 'enter-once' });
      return Response.json({ session, callState: 'none' });
    }
    assert.equal(path, '/api/learning/session/current');
    return Response.json({ session, callState: 'active' });
  });
  assert.deepEqual(await client.practice.enter({ mode: 'sentence', operationId: 'enter-once' }), { session, callState: 'none' });
  assert.deepEqual(await client.practice.current(), { session, callState: 'active' });
});

test('practice entry rejects foreign modes, closed records and invented call states', async () => {
  const session = { sessionId: 'saved', mode: 'verb-image', status: 'open', revision: 0 };
  for (const result of [{ session, callState: 'none' },
    { session: { ...session, mode: 'sentence', status: 'closed' }, callState: 'none' },
    { session: { ...session, mode: 'sentence' }, callState: 'historical' }]) {
    const client = createApplicationClient(async () => Response.json(result));
    await assert.rejects(client.practice.enter({ mode: 'sentence', operationId: 'entry' }));
  }
  const client = createApplicationClient(async () => Response.json(null));
  assert.equal(await client.practice.current(), null);
});
