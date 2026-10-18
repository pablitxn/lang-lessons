import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('root exits preserve mounted drafts until confirmed flush and close, including history and retry', {
  skip: process.env.ROOT_NAVIGATION_BROWSER !== '1', timeout: 90000,
}, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const { installBrowserTransport } = require('./helpers/browser-transport.cjs');
  const port = 5195; const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', chunk => { log += chunk; }); server.stderr.on('data', chunk => { log += chunk; });
  let browser: any;
  try {
    for (let i = 0; i < 100 && !log.includes('Local:'); i++) { assert.equal(server.exitCode, null, log); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.match(log, /Local:/);
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      const context = await browser.newContext({ viewport });
      const transport = await installBrowserTransport(context, origin, { enabled: false });
      const page: any = await context.newPage(); const errors: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      await page.goto(`${origin}/src/app/__fixtures__/root-navigation.html`);
      const home = page.getByRole('heading', { name: 'Choose a lesson', exact: true });
      await home.waitFor();
      await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click();
      const draft = page.getByRole('textbox', { name: 'Draft', exact: true }); await draft.fill('preserved answer');
      const mount = await page.locator('[data-mount]').getAttribute('data-mount');
      const calls = () => page.evaluate('rootFixture.calls');
      const waitCall = (name: string, count: number) => page.waitForFunction(({ name, count }: any) => (window as any).rootFixture.calls.filter((x: string) => x === name).length === count, { name, count });
      const stay = async () => { assert.equal(await draft.inputValue(), 'preserved answer'); assert.equal(await page.locator('[data-mount]').getAttribute('data-mount'), mount); assert.equal(await page.evaluate('rootFixture.unmounts'), 0); };
      const leave = () => page.getByRole('link', { name: 'All lessons', exact: true }).click();
      await leave(); await leave(); await waitCall('decision', 1); await stay();
      await page.evaluate("rootFixture.decision('cancel')"); await page.waitForTimeout(30); await stay();
      assert.deepEqual(await calls(), ['decision']);
      // Browser Back is restored while the decision is pending, without unmounting.
      await page.evaluate('history.back()'); await waitCall('decision', 2);
      await page.waitForFunction("location.hash === '#/verb-image'"); await stay();
      await page.evaluate("rootFixture.decision('cancel')"); await page.waitForTimeout(30); await stay();
      // An ambiguous close retains its request identity and original destination.
      await leave(); await waitCall('decision', 3);
      await page.evaluate("rootFixture.failClose = true; rootFixture.decision('confirm')");
      await waitCall('flush', 1); await stay(); assert.equal(await page.evaluate('rootFixture.closes.length'), 0);
      await page.evaluate('rootFixture.flush()');
      await page.getByRole('alert').waitFor(); await stay();
      assert.deepEqual((await calls()).slice(-4), ['freeze', 'flush', 'read', 'close']);
      await leave(); await waitCall('close', 2); await stay();
      assert.deepEqual(await page.evaluate('rootFixture.closes[0]'), await page.evaluate('rootFixture.closes[1]'));
      assert.equal((await calls()).filter((x: string) => x === 'flush').length, 1);
      await page.evaluate('rootFixture.close()'); await home.waitFor();
      assert.equal(await page.evaluate('rootFixture.unmounts'), 1);
      // Back into a lesson creates a fresh mounted session; confirmed Forward uses that entry.
      await page.evaluate('history.back()'); await draft.waitFor();
      await page.evaluate('history.forward()'); await waitCall('decision', 4);
      await page.evaluate("rootFixture.decision('confirm')"); await waitCall('flush', 2);
      await page.evaluate('rootFixture.flush()'); await waitCall('close', 3);
      await page.evaluate('rootFixture.close()'); await home.waitFor();
      // Missing lifecycle registration fails closed once integration requires it.
      await page.evaluate('rootFixture.register = false');
      await page.getByRole('link', { name: 'Start Verb practice', exact: true }).click(); await draft.fill('still mounted');
      await leave(); await page.getByRole('alert').waitFor(); assert.equal(await draft.inputValue(), 'still mounted');
      // Direct hash edits also pass through the guard.
      await page.evaluate("location.hash = '#/'"); await page.waitForFunction("location.hash === '#/verb-visible'");
      assert.equal(await draft.inputValue(), 'still mounted');
      assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []); assert.equal(transport.sessionRequests, 0);
      assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      await context.close();
    }
  } finally { await browser?.close(); server.kill('SIGTERM'); }
});
