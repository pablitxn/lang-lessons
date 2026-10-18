import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Use the supplied browser and existing intercepted media helper; never a real provider.
test('optional tutor entry, stop and restart preserve written drafts in the rendered application', { skip: process.env.P4_BROWSER !== '1', timeout: 60000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const { installBrowserTransport, inspectTransport } = require('./helpers/browser-transport.cjs');
  const origin = `http://127.0.0.1:${process.env.APP_BROWSER_PORT || '5174'}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-browser-cache' } });
  try {
    for (const width of [320, 1024]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const transport = await installBrowserTransport(context, origin);
      const page = await context.newPage();
      await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
      // Select the app-owned route through the catalog.
      if (await page.getByRole('link', { name: 'Start Verb practice', exact: true }).count()) {
        await page.getByRole('link', { name: 'Start Verb practice', exact: true }).click();
      }
      const draft = page.getByRole('textbox', { name: 'Past', exact: true });
      await draft.fill('kept draft');
      assert.equal(transport.statusRequests, 0); assert.equal(transport.sessionRequests, 0);
      assert.equal((await inspectTransport(page)).mediaCalls, 0);
      const header = page.locator('header');
      await header.getByRole('button', { name: 'Start tutor', exact: true }).click();
      await page.waitForFunction(() => (window as any).__voiceTransportFixture.mediaCalls === 1);
      await header.getByRole('button', { name: 'Stop tutor', exact: true }).click();
      assert.equal(await draft.inputValue(), 'kept draft');
      assert.equal((await inspectTransport(page)).tracks[0].stopped, true);
      await header.getByRole('button', { name: 'Start tutor', exact: true }).click();
      await page.waitForFunction(() => (window as any).__voiceTransportFixture.mediaCalls === 2);
      assert.equal(await draft.inputValue(), 'kept draft');
      assert.deepEqual(transport.externalRequests, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await context.close();
    }
  } finally { await browser.close(); }
});
