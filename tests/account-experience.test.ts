import test from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationRequestError, createApplicationClient } from '../src/platform/application-client';

test('a delayed unauthorized response cannot expire a newer authenticated account', async () => {
  let generation = 1; let expirations = 0;
  let finish!: (response: Response) => void;
  const client = createApplicationClient(() => new Promise(resolve => { finish = resolve; }), () => { expirations++; }, () => generation);
  const pending = client.me();
  generation++;
  finish(Response.json({ error: 'unauthenticated' }, { status: 401 }));
  await assert.rejects(pending, error => error instanceof ApplicationRequestError && error.status === 401);
  assert.equal(expirations, 0, 'an old request still fails without clearing the new account');
});

test('an unauthorized response for the current account still expires authentication', async () => {
  let expirations = 0;
  const client = createApplicationClient(async () => Response.json({ error: 'unauthenticated' }, { status: 401 }), () => { expirations++; }, () => 7);
  await assert.rejects(client.me(), error => error instanceof ApplicationRequestError && error.status === 401);
  assert.equal(expirations, 1);
});

test('sign-out requires an explicit success receipt and clears cached account revisions', async () => {
  const paths: string[] = []; let confirmed = false;
  const client = createApplicationClient(async (input, init) => {
    const path = String(input); paths.push(path);
    if (path === '/api/learning/users') return Response.json({ items: [{ id: 'student', role: 'student', disabled: false, revision: 3 }], nextCursor: null });
    assert.equal(path, '/api/auth/sign-out');
    assert.equal(init?.method, 'POST'); assert.equal(init?.credentials, 'same-origin');
    assert.equal(init?.body, '{}');
    return Response.json({ ok: confirmed });
  });
  await client.administration.listUsers(null, new AbortController().signal);
  await assert.rejects(client.signOut(), /Sign out was not confirmed/);
  confirmed = true;
  await client.signOut();
  assert.deepEqual(await client.management.apply({ kind: 'change-role', userId: 'student', role: 'professor' }, new AbortController().signal), { status: 'conflict' });
  assert.deepEqual(paths, ['/api/learning/users', '/api/auth/sign-out', '/api/auth/sign-out']);
});
