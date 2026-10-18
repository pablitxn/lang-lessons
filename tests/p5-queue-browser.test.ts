import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('real IndexedDB survives reload, isolates users/sessions and rolls back a failed conflicting write', { skip: process.env.P5_BROWSER !== '1', timeout: 60000 }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5199', '--strictPort']);
  let output = ''; server.stdout.on('data', data => { output += String(data); });
  let browser: any;
  try {
    for (let i = 0; i < 100 && !output.includes('Local:'); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(output, /Local:/);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
      env: { ...process.env, XDG_CONFIG_HOME: '/tmp/p5-queue-browser-config', XDG_CACHE_HOME: '/tmp/p5-queue-browser-cache' } });
    const page = await browser.newPage(); const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5199/src/features/verbs/__fixtures__/preview.html');
    const databaseName = `p5-isolated-test-${crypto.randomUUID()}`;
    const first = await page.evaluate(async (name: string) => {
      const path = '/src/features/progress/pending-progress-store.ts';
      const { createIndexedDbProgressStore } = await import(path);
      const store = createIndexedDbProgressStore(indexedDB, name);
      const row = { schemaVersion: 1, kind: 'attempt-result', eventId: 'event', source: 'typed', trust: 'client-reported', result: 'accepted',
        ref: { sessionId: 'session', exerciseId: 'exercise', generation: 1, obligation: 'spelling:past', attemptId: 'attempt', revision: 1 } };
      await store.enqueue({ userId: 'a', sessionId: 'session' }, [row]);
      await store.enqueue({ userId: 'a', sessionId: 'session' }, [row]);
      await store.enqueue({ userId: 'b', sessionId: 'session' }, [row]);
      await store.enqueue({ userId: 'a', sessionId: 'another' }, [{ ...row, ref: { ...row.ref, sessionId: 'another' } }]);
      const result = await store.list({ userId: 'a', sessionId: 'session' });
      await store.close(); return result;
    }, databaseName);
    assert.equal(first.length, 1);
    await page.reload();
    const recovered = await page.evaluate(async (name: string) => {
      const path = '/src/features/progress/pending-progress-store.ts';
      const { createIndexedDbProgressStore } = await import(path);
      const store = createIndexedDbProgressStore(indexedDB, name);
      const scope = { userId: 'a', sessionId: 'session' };
      const rows = await store.list(scope);
      let failed = false;
      try { await store.enqueue(scope, [{ ...rows[0], eventId: 'new-event' }, { ...rows[0], result: 'incorrect' }]); } catch { failed = true; }
      const afterFailure = await store.list(scope);
      await store.acknowledge(scope, rows);
      const result = { sessions: await store.pendingSessions('a'), rows, failed, afterFailure, remaining: await store.list(scope), otherUser: await store.list({ userId: 'b', sessionId: 'session' }),
        otherSession: await store.list({ userId: 'a', sessionId: 'another' }) };
      await store.close(); indexedDB.deleteDatabase(name); return result;
    }, databaseName);
    assert.deepEqual(recovered.sessions, [{ sessionId: 'another', pending: 1 }]);
    assert.deepEqual(recovered.rows, first); assert.equal(recovered.failed, true);
    assert.deepEqual(recovered.afterFailure, first); assert.equal(recovered.remaining.length, 0);
    assert.equal(recovered.otherUser.length, 1); assert.equal(recovered.otherSession.length, 1);
    await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-18T13:00:00Z'));
    await page.goto('http://127.0.0.1:5199/src/features/progress/__fixtures__/activity.html', { waitUntil: 'networkidle' });
    const input = page.getByRole('textbox', { name: 'Written activity input' }); await input.waitFor();
    await page.clock.runFor(100);
    await input.click(); await input.press('a');
    await page.clock.runFor(119999);
    assert.equal(await page.evaluate(() => window.p5Activity.intervals.length), 0);
    await page.clock.runFor(1);
    assert.equal(await page.evaluate(() => window.p5Activity.intervals.length), 1);
    await input.click(); await input.press('b'); await page.clock.runFor(1000);
    await page.evaluate(() => { window.p5Activity.writable = false; window.p5Activity.finish(); });
    await input.click(); await input.press('c'); await page.clock.runFor(180000);
    assert.equal(await page.evaluate(() => window.p5Activity.intervals.length), 2);
    assert.deepEqual(errors, []);

  } finally { await browser?.close(); server.kill(); }
});
