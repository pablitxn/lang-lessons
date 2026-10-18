import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

test('recovery UI confirms only called sessions and exposes explicit feedback retry with account cleanup',
  { skip: process.env.P4_BROWSER !== '1', timeout: 60000 }, async () => {
    const { chromium } = createRequire(import.meta.url)('playwright');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
      env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-browser-cache' } });
    try {
      const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
      const errors: string[] = []; const unexpected: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      await page.route('**/*', async (route: any) => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://127.0.0.1:5174' || url.pathname.startsWith('/api/')) {
          unexpected.push(url.pathname); await route.abort();
        } else await route.continue();
      });
      await page.goto('http://127.0.0.1:5174/src/app/__fixtures__/p4-recovery.html');
      const finalize = page.getByRole('button', { name: 'Finalize session', exact: true });
      await finalize.click();
      const dialog = page.getByRole('dialog', { name: 'Leave this exercise session?' });
      await dialog.waitFor();
      assert.equal(await page.getByRole('button', { name: 'Keep practicing' }).evaluate((el: HTMLElement) => el === document.activeElement), true);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.textContent === 'Finalize session');
      await finalize.click(); await page.getByRole('button', { name: 'Leave session', exact: true }).click();
      const retry = page.getByRole('button', { name: 'Retry tutor comment', exact: true }); await retry.waitFor();
      assert.match(await page.getByLabel('Fixture counts').textContent(), /"retry":0/);
      await retry.click(); await page.getByText('Your tutor comment is pending.', { exact: true }).waitFor();
      assert.match(await page.getByLabel('Fixture counts').textContent(), /"retry":1/);
      await page.getByRole('button', { name: 'Use no-call fixture' }).click(); await finalize.click();
      await page.getByRole('heading', { name: 'Session finalized' }).waitFor(); assert.equal(await dialog.count(), 0);
      await page.getByText('No tutor comment was requested.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Switch account fixture' }).click();
      assert.equal(await page.getByRole('region', { name: 'Interrupted session recovery' }).count(), 0);
      assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    } finally { await browser.close(); }
  });
