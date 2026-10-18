import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedJson } from '../server/data/request-body';
import { transaction } from '../server/data/database';
import type { Pool } from 'pg';

test('P2 streaming body bound rejects oversize input even with a false Content-Length', async () => {
  const request = new Request('http://localhost/api/events', { method: 'POST', headers: { 'content-length': '1' }, body: JSON.stringify({ raw: 'x'.repeat(1000) }) });
  await assert.rejects(readBoundedJson(request, 100), /invalid-input/);
  assert.deepEqual(await readBoundedJson(new Request('http://localhost/api/events', { method: 'POST', body: '{"events":[]}' })), { events: [] });
  await assert.rejects(readBoundedJson(new Request('http://localhost/api/events', { method: 'POST', body: '{' })), /invalid-input/);
});

test('P2 transaction never returns a successful receipt on ambiguous commit failure', async () => {
  const calls: string[] = []; let discarded = false;
  const client = { query: async (sql: string) => { calls.push(sql); if (sql === 'COMMIT' || sql === 'ROLLBACK') throw new Error('connection lost'); }, release: (broken: boolean) => { discarded = broken; } };
  const pool = { connect: async () => client } as unknown as Pool;
  await assert.rejects(transaction(pool, async () => ({ status: 'saved' })), /connection lost/);
  assert.deepEqual(calls, ['BEGIN', 'COMMIT', 'ROLLBACK']); assert.equal(discarded, true);
});
