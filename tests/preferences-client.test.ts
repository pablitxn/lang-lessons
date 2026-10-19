import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/contracts';
import { ApplicationRequestError, createApplicationClient } from '../src/platform/application-client';

test('preferences use authenticated own-account transport and preserve revision conflicts', async () => {
  const signal = new AbortController().signal;
  const requests: RequestInit[] = [];
  const client = createApplicationClient(async (path, init) => {
    assert.equal(path, '/api/learning/preferences');
    assert.equal(init?.credentials, 'same-origin'); assert.equal(init?.cache, 'no-store');
    assert.equal(init?.signal, signal); requests.push(init!);
    return init?.method === 'POST' ? Response.json({}, { status: 409 }) : Response.json({ settings: null, revision: 0 });
  });
  assert.deepEqual(await client.preferences.read(signal), { settings: null, revision: 0 });
  const input = { settings: DEFAULT_SETTINGS, expectedRevision: 2 };
  await assert.rejects(client.preferences.update(input, signal), error => error instanceof ApplicationRequestError && error.status === 409);
  assert.deepEqual(JSON.parse(String(requests[1]?.body)), input);
});

test('preferences reject malformed server snapshots before they can update the device cache', async () => {
  for (const value of [{ settings: null, revision: 3 }, { settings: DEFAULT_SETTINGS, revision: 0 },
    { settings: DEFAULT_SETTINGS, revision: -1 }, { settings: DEFAULT_SETTINGS, revision: 1.2 },
    { settings: { ...DEFAULT_SETTINGS, preferredMode: ['sentence'] }, revision: 1 },
    { settings: { ...DEFAULT_SETTINGS, difficulty: { grammar: 4, vocabulary: 1 } }, revision: 1 }]) {
    const client = createApplicationClient(async () => Response.json(value));
    await assert.rejects(client.preferences.read(new AbortController().signal), /Invalid preferences response/);
  }
  const client = createApplicationClient(async () => Response.json({ settings: DEFAULT_SETTINGS, revision: 1 }));
  assert.deepEqual(await client.preferences.read(new AbortController().signal), { settings: DEFAULT_SETTINGS, revision: 1 });
});
