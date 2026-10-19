import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationClient } from '../src/platform/application-client';

const actor = { id: 'student', role: 'student', capabilities: { granted: [] }, name: 'Learner', image: null };
test('profile update uses own-account endpoint and navigation timezone context', async () => {
  const client = createApplicationClient(async (path, init) => {
    assert.equal(path, '/api/learning/profile');
    assert.equal(init?.credentials, 'same-origin');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-learning-time-zone'), Intl.DateTimeFormat().resolvedOptions().timeZone);
    assert.deepEqual(JSON.parse(String(init?.body)), { name: 'Learner', image: null });
    return Response.json(actor);
  });
  assert.deepEqual(await client.profile.update({ name: 'Learner', image: null }, new AbortController().signal), actor);
});
test('profile response rejects remote image URLs before rendering', async () => {
  const client = createApplicationClient(async () => Response.json({ ...actor, image: 'https://example.test/tracking.jpg' }));
  await assert.rejects(client.me(), /Invalid account response/);
});
test('legacy account fixtures remain valid without a profile', async () => {
  const legacy = { id: 'student', role: 'student', capabilities: { granted: [] } };
  const client = createApplicationClient(async () => Response.json(legacy));
  assert.deepEqual(await client.me(), legacy);
});
