import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
test('canonical lesson composition saves incrementally and no-call exit awaits flush and close without a popup', { skip: process.env.PERSISTED_BROWSER !== '1', timeout: 60000 }, async () => {
  const require = createRequire(import.meta.url); const { chromium } = require('playwright');
  const { installBrowserTransport } = require('./helpers/browser-transport.cjs');
  const port = 5205; const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort']);
  let log = ''; server.stdout.on('data', chunk => { log += chunk; }); server.stderr.on('data', chunk => { log += chunk; });
  let browser: any;
  try {
    for (let i = 0; i < 100 && !log.includes('Local:'); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(log, /Local:/); browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const transport = await installBrowserTransport(context, origin, { enabled: false }); const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.goto(`${origin}/src/app/__fixtures__/persisted.html`);
    await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'Base form', exact: true }); await field.fill('be'); await field.press('Enter');
    await page.locator('.ll-correct').first().waitFor(); await page.waitForFunction('persistedFixture.sends === 1');
    assert.equal(await page.evaluate('persistedFixture.creates'), 1, 'StrictMode does not duplicate canonical session creation');
    assert.equal(await page.evaluate('persistedFixture.streams'), 1);
    await page.waitForFunction("persistedFixture.observations.includes('visible')");
    await page.getByRole('link', { name: 'All lessons', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 0); assert.equal(await field.inputValue(), 'be');
    assert.equal(await page.evaluate('persistedFixture.closes'), 0);
    await page.evaluate('persistedFixture.commit()'); await page.waitForFunction('persistedFixture.closes === 1');
    assert.equal(await field.inputValue(), 'be');
    assert.equal(await page.evaluate('persistedFixture.observations.at(-1)'), 'hidden');
    await page.evaluate('persistedFixture.close()'); await page.getByRole('heading', { name: 'Choose a lesson' }).waitFor();
    assert.equal(transport.sessionRequests, 0); assert.equal(transport.statusRequests, 0); assert.deepEqual(transport.externalRequests, []); assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser?.close(); if (server.exitCode === null) await new Promise<void>(resolve => { server.once('exit', () => resolve()); server.kill('SIGTERM'); }); }
});

test('production entry binds authenticated account, canonical identities and IndexedDB progress to HTTP', { skip: process.env.PERSISTED_BROWSER !== '1', timeout: 60000 }, async () => {
  const require = createRequire(import.meta.url); const { chromium } = require('playwright');
  const port = 5206; const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort']);
  let log = ''; server.stdout.on('data', chunk => { log += chunk; }); server.stderr.on('data', chunk => { log += chunk; });
  let browser: any; let revision = 0; let creates = 0; let closed = false;
  const events: any[] = []; const observations: string[] = []; const external: string[] = [];
  const session = { sessionId: 'canonical-http-session', mode: 'verb-image', status: 'open', revision: 0 };
  try {
    for (let i = 0; i < 100 && !log.includes('Local:'); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(log, /Local:/); browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    const context = await browser.newContext();
    await context.route('**/*', async (route: any) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      let response: unknown;
      switch (url.pathname) {
        case '/api/learning/config': response = { accountsEnabled: true }; break;
        case '/api/me': response = { id: 'canonical-student', role: 'student', capabilities: { granted: ['practice:own'] } }; break;
        case '/api/learning/session/create': creates++; response = session; break;
        case '/api/learning/session': response = session; break;
        case '/api/learning/usage/open': response = { streamId: 'canonical-http-stream' }; break;
        case '/api/learning/usage/written': observations.push(body.kind); response = { eventId: body.eventId, sequence: body.sequence, intervalId: null, observedAt: new Date().toISOString(), status: 'recorded' }; break;
        case '/api/learning/instance/issue': response = { sessionId: session.sessionId, exerciseId: 'canonical-http-exercise', generation: 0 }; break;
        case '/api/learning/progress': events.push(...body); response = { status: 'committed', acknowledgments: body.map((event: any) => ({ eventId: event.eventId, status: 'accepted', committedRevision: ++revision })), current: { sessionId: session.sessionId, journalRevision: revision } }; break;
        case '/api/learning/failed-feedback':
        case '/api/learning/open-sessions': response = { items: [], nextCursor: null }; break;
        case '/api/learning/recovery': response = { session, progress: { sessionId: session.sessionId, journalRevision: revision }, activeSegments: [], feedback: null }; break;
        case '/api/learning/session/confirm-close': assert.equal(body.finalProgress.journalRevision, revision); assert.equal(observations.at(-1), 'hidden'); closed = true; response = { sessionId: session.sessionId, operationId: body.operationId, revision: 1, status: 'closed', feedback: 'not-requested' }; break;
        default: throw new Error(`Unexpected application request: ${url.pathname}`);
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    });
    const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.goto(origin); await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click();
    const saved = page.waitForResponse((response: { url(): string }) => new URL(response.url()).pathname === '/api/learning/progress');
    const field = page.getByRole('textbox', { name: 'Base form', exact: true }); await field.fill('be'); await field.press('Enter');
    await saved;
    await page.waitForFunction(async () => {
      const path = '/src/features/progress/pending-progress-store.ts';
      const { createIndexedDbProgressStore } = await import(path);
      const store = createIndexedDbProgressStore(); const pending = await store.pendingSessions('canonical-student'); await store.close(); return pending.length === 0;
    });
    await page.getByRole('link', { name: 'All lessons', exact: true }).click();
    await page.getByRole('heading', { name: 'Choose a lesson' }).waitFor();
    assert.equal(creates, 1); assert.equal(closed, true); assert.ok(events.length >= 1);
    assert.ok(events.every(event => event.ref.sessionId === session.sessionId && event.ref.exerciseId === 'canonical-http-exercise'));
    assert.deepEqual(external, []); assert.deepEqual(errors, []); await context.close();
  } finally { await browser?.close(); if (server.exitCode === null) await new Promise<void>(resolve => { server.once('exit', () => resolve()); server.kill('SIGTERM'); }); }
});


test('shipped root requires account service and confirmed connected exit waits for durable flush and close', { skip: process.env.PERSISTED_BROWSER !== '1', timeout: 60000 }, async () => {
  const require = createRequire(import.meta.url); const { chromium } = require('playwright');
  const { installBrowserTransport } = require('./helpers/browser-transport.cjs');
  const port = 5207; const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort']);
  let log = ''; server.stdout.on('data', chunk => { log += chunk; }); server.stderr.on('data', chunk => { log += chunk; });
  let browser: any;
  try {
    for (let i = 0; i < 100 && !log.includes('Local:'); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(log, /Local:/); browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    const unavailable = await browser.newContext(); const blocked = await installBrowserTransport(unavailable, origin, { accountsEnabled: false });
    const blockedPage = await unavailable.newPage(); await blockedPage.goto(origin);
    await blockedPage.getByRole('alert').filter({ hasText: 'account service is unavailable' }).waitFor();
    assert.equal(await blockedPage.getByRole('link', { name: 'Start Picture practice', exact: true }).count(), 0);
    assert.equal(blocked.sessionRequests, 0); await unavailable.close();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const transport = await installBrowserTransport(context, origin); const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.goto(origin); await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click();
    await page.locator('header').getByRole('button', { name: 'Start tutor', exact: true }).click();
    await page.waitForFunction('window.__voiceTransportFixture.peers.at(-1)?.channel?.readyState === "open"');
    let progress!: () => void; let close!: () => void;
    transport.progressBarrier = new Promise<void>(resolve => { progress = resolve; });
    transport.closeBarrier = new Promise<void>(resolve => { close = resolve; });
    const field = page.getByRole('textbox', { name: 'Base form', exact: true }); await field.fill('be'); await field.press('Enter');
    await page.locator('.ll-correct').first().waitFor();
    await page.getByRole('link', { name: 'All lessons', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Leave this exercise session?' }); await dialog.waitFor();
    assert.equal(transport.learningCalls.includes('/api/learning/session/confirm-close'), false);
    await page.getByRole('button', { name: 'Keep practicing', exact: true }).click();
    assert.equal(await field.inputValue(), 'be'); assert.equal(await page.getByRole('heading', { name: 'Choose a lesson' }).count(), 0);
    await page.getByRole('link', { name: 'All lessons', exact: true }).click(); await dialog.waitFor();
    await page.getByRole('button', { name: 'Leave session', exact: true }).click();
    assert.equal(await field.inputValue(), 'be'); assert.equal(transport.learningCalls.includes('/api/learning/session/confirm-close'), false);
    const closing = page.waitForRequest((request: { url(): string }) => new URL(request.url()).pathname === '/api/learning/session/confirm-close');
    progress(); await closing; assert.equal(await field.inputValue(), 'be');
    close(); await page.getByRole('heading', { name: 'Choose a lesson' }).waitFor();
    assert.equal(transport.learningCalls.filter((path: string) => path === '/api/learning/session/confirm-close').length, 1);
    assert.equal(transport.sessionRequests, 1); assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
    await context.close();
  } finally { await browser?.close(); if (server.exitCode === null) await new Promise<void>(resolve => { server.once('exit', () => resolve()); server.kill('SIGTERM'); }); }
});
