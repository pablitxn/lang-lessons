import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('shipped application restores a local written draft in the same canonical session without starting audio',
  { skip: process.env.RECOVERY_BROWSER !== '1', timeout: 60000 }, async () => {
    const require = createRequire(import.meta.url); const { chromium } = require('playwright');
    const { installBrowserTransport } = require('./helpers/browser-transport.cjs');
    const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5210', '--strictPort']);
    let output = ''; server.stdout.on('data', chunk => output += chunk); server.stderr.on('data', chunk => output += chunk);
    let browser: any;
    try {
      for (let i = 0; i < 100 && !output.includes('Local:'); i++) await new Promise(resolve => setTimeout(resolve, 50));
      assert.match(output, /Local:/);
      browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
        env: { ...process.env, XDG_CONFIG_HOME: '/tmp/root-written-config', XDG_CACHE_HOME: '/tmp/root-written-cache' } });
      const context = await browser.newContext(); const origin = 'http://127.0.0.1:5210';
      const transport = await installBrowserTransport(context, origin, { enabled: false, recoveryEnabled: true });
      const page = await context.newPage(); const errors: string[] = []; const payloads: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      page.on('request', (request: any) => { if (request.url().includes('/api/')) payloads.push(request.postData() ?? ''); });
      await page.addInitScript('globalThis.__name = value => value');
      await page.goto(origin);
      const zone = page.getByLabel('Your IANA timezone', { exact: true }); await zone.waitFor();
      assert.equal(await zone.inputValue(), '', 'no browser timezone is selected implicitly');
      await zone.fill('America/New_York'); await page.getByRole('button', { name: 'Save timezone', exact: true }).click();
      await page.getByText('Configured timezone', { exact: true }).waitFor();
      const opened = page.waitForResponse((response: any) => response.url().endsWith('/api/learning/session/create'));
      await page.getByRole('link', { name: 'Start Sentence practice', exact: true }).click();
      const session = await (await opened).json();
      const input = page.getByRole('textbox').first(); await input.fill('local-only unfinished draft');
      await page.waitForFunction(async (sessionId: string) => {
        const path = '/src/features/progress/written-snapshot-store.ts'; const { createIndexedDbWrittenSnapshotStore } = await import(path);
        const store = createIndexedDbWrittenSnapshotStore();
        try { return (await store.load({ userId: 'browser-fixture-student', sessionId }, 'sentence'))?.draft === 'local-only unfinished draft'; }
        finally { await store.close(); }
      }, session.sessionId);
      await page.goto(origin + '/?return=1');
      await page.getByRole('button', { name: 'Resume session', exact: true }).click();
      await page.getByRole('textbox').first().waitFor();
      assert.equal(await page.getByRole('textbox').first().inputValue(), 'local-only unfinished draft');
      assert.equal(transport.learningCalls.filter((path: string) => path === '/api/learning/session/create').length, 1);
      assert.equal(transport.sessionRequests, 0); assert.equal(transport.statusRequests, 0);
      assert.equal(payloads.some(payload => payload.includes('local-only unfinished draft')), false);
      const identities = await page.evaluate(async (sessionId: string) => {
        const modulePath = '/src/app/browser-written-practice.tsx'; const { createBrowserWrittenPractice } = await import(modulePath);
        const scope = { userId: 'browser-fixture-student', sessionId, mode: 'sentence', isCurrent: () => true };
        const first = await createBrowserWrittenPractice(scope);
        const saved = first.binding.initialSnapshot;
        const oral = { schemaVersion: 1, eventId: 'new-oral', kind: 'attempt-result', result: 'accepted', source: 'audio', trust: 'client-reported',
          ref: { ...saved.identity, obligation: 'meaning', attemptId: 'fresh-attempt', revision: 1 } };
        const written = { ...oral, eventId: 'written', source: 'typed', ref: { ...oral.ref, obligation: 'written:translation' } };
        const mapped = first.mapNewEvents([oral, written]); const again = first.mapNewEvents([oral]); first.dispose();
        const second = await createBrowserWrittenPractice(scope); const later = second.mapNewEvents([oral]); second.dispose();
        return { original: saved.identity.exerciseId, oral: mapped[0].ref.exerciseId, written: mapped[1].ref.exerciseId,
          sameMount: again[0].ref.exerciseId, laterMount: later[0].ref.exerciseId, originalUnmodified: oral.ref.exerciseId,
          eventId: mapped[0].eventId, revision: mapped[0].ref.revision };
      }, session.sessionId);
      assert.equal(identities.written, identities.original); assert.equal(identities.originalUnmodified, identities.original);
      assert.notEqual(identities.oral, identities.original); assert.equal(identities.sameMount, identities.oral);
      assert.notEqual(identities.laterMount, identities.oral); assert.equal(identities.eventId, 'new-oral'); assert.equal(identities.revision, 1);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      if (server.exitCode === null) await new Promise<void>(resolve => { server.once('exit', () => resolve()); server.kill('SIGTERM'); });
    }
  });
