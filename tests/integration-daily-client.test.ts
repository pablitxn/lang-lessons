import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationClient } from '../src/platform/application-client';

const signal = new AbortController().signal;
const day = {
  studentId: 'student', day: '2026-10-18', timeZone: 'Europe/Madrid', attributionTimeZones: ['Europe/Madrid'], eventAttribution: 'server-received',
  writtenEvents: { items: [], nextCursor: 'events-next' }, sessions: { items: [], nextCursor: 'sessions-next' }, totals: null,
  usageTime: { writtenMs: 120000, tutorConnectedMs: 90000, totalMs: 150000, writtenTrust: 'client-reported-interaction', tutorTrust: 'server-observed-connection' },
  hasUnattributedLegacyRecords: false,
};
test('daily client preserves server timezone, independent cursors and union duration without inventing metric totals', async () => {
  const paths: string[] = [];
  const client = createApplicationClient(async input => { paths.push(String(input)); return Response.json(day); });
  const result = await client.professor.readDaily('student', { day: day.day, eventCursor: 'e+cursor', sessionCursor: 's/cursor' }, signal);
  assert.deepEqual(result, { status: 'ok', value: day });
  const query = new URL(paths[0]!, 'http://fixture').searchParams;
  assert.equal(query.get('eventCursor'), 'e+cursor'); assert.equal(query.get('sessionCursor'), 's/cursor');
});
test('unselected daily boundary leaves session pagination available; foreign daily rows fail validation', async () => {
  const client = createApplicationClient(async input => String(input).includes('/daily-progress')
    ? Response.json({ error: 'policy-unresolved' }, { status: 503 })
    : Response.json({ studentId: 'student', sessions: { items: [], nextCursor: 'opaque' } }));
  assert.deepEqual(await client.professor.readDaily('student', { day: day.day }, signal), { status: 'policy-unresolved' });
  assert.deepEqual(await client.professor.readSessionPage('student', null, signal), { status: 'ok', value: { studentId: 'student', sessions: { items: [], nextCursor: 'opaque' } } });
  const foreign = createApplicationClient(async () => Response.json({ ...day, studentId: 'other' }));
  await assert.rejects(foreign.professor.readDaily('student', { day: day.day }, signal), /Invalid daily/);
  const forged = createApplicationClient(async () => Response.json({ ...day, usageTime: { ...day.usageTime, tutorTrust: 'client-reported' } }));
  await assert.rejects(forged.professor.readDaily('student', { day: day.day }, signal), /Invalid daily/);
});

test('student timezone client preserves explicit missing state and idempotent update coordinates', async () => {
  const requests: unknown[] = []; let configured = false;
  const setting = { timeZone: 'America/New_York', revision: 1, effectiveAt: '2026-10-18T12:00:00.000Z' };
  const client = createApplicationClient(async (_input, init) => {
    if (init?.method === 'POST') { requests.push(JSON.parse(String(init.body))); configured = true; }
    return Response.json(configured ? setting : null);
  });
  assert.deepEqual(await client.timeZone.read(signal), { status: 'ok', value: null });
  const input = { operationId: 'stable-operation', expectedRevision: 0, timeZone: 'America/New_York' };
  assert.deepEqual(await client.timeZone.set(input, signal), { status: 'ok', value: setting });
  assert.deepEqual(requests, [input]);
  const stale = createApplicationClient(async () => Response.json({ error: 'conflict' }, { status: 409 }));
  assert.deepEqual(await stale.timeZone.set(input, signal), { status: 'conflict' });
});
