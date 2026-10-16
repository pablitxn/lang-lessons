const assert = require('node:assert/strict');
const { chromium } = require('playwright');

// Uses the selected Cloud environment's supplied Playwright/Chromium tooling.
// No certificate bypass, external navigation or microphone permission is used.
(async () => {
  const ports = process.argv.slice(2).length ? process.argv.slice(2) : ['5174'];
  for (const port of ports) assert.match(port, /^\d{4,5}$/);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-browser-cache' },
  });
  try {
    for (const port of ports) {
      for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const errors = [];
        const externalRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => {
          if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) externalRequests.push(request.url());
        });
        const response = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200);
        await page.getByRole('heading', { name: 'Picture practice', exact: true }).waitFor();
        const nav = page.getByRole('navigation', { name: 'Practice mode' });
        await nav.getByRole('link', { name: 'Sentence', exact: true }).click();
        await page.getByRole('heading', { name: 'Sentence practice', exact: true }).waitFor();
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: 'Sentence practice', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Preferences', exact: true }).click();
        await page.getByLabel('Grammar difficulty', { exact: true }).selectOption('3');
        await page.getByLabel('Vocabulary difficulty', { exact: true }).selectOption('1');
        await page.getByLabel('Offer sound guidance after a spelling error').check();
        await page.getByLabel('Keep sound-help offers available until dismissed').check();
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Preferences', exact: true }).click();
        assert.equal(await page.getByLabel('Grammar difficulty', { exact: true }).inputValue(), '3');
        assert.equal(await page.getByLabel('Vocabulary difficulty', { exact: true }).inputValue(), '1');
        assert.equal(await page.getByLabel('Keep sound-help offers available until dismissed').isChecked(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await page.getByRole('button', { name: 'Clear saved preferences' }).click();
        assert.equal(await page.getByLabel('Grammar difficulty', { exact: true }).inputValue(), '1');
        await page.getByRole('button', { name: 'Close', exact: true }).click();
        await nav.getByRole('link', { name: 'Verb', exact: true }).click();
        await page.getByRole('heading', { name: 'Verb practice', exact: true }).waitFor();
        await page.goBack({ waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: 'Sentence practice', exact: true }).waitFor();
        assert.equal(await page.getByText('Microphone off', { exact: true }).count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        assert.deepEqual(errors, []);
        assert.deepEqual(externalRequests, []);
        if (process.env.SCREENSHOT_PATH && port === ports[0] && viewport.width === 390) {
          await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
        }
        console.log(JSON.stringify({ status: 'passed', port, viewport, checks: ['render', 'three modes', 'reload', 'history', 'independent preferences', 'persistence', 'reset', 'reflow', 'no external requests'], errors: errors.length }));
        await context.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
