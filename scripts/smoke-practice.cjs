const assert = require('node:assert/strict');
const { chromium } = require('playwright');

// Actual root + feature + controller + deterministic mock; no microphone/provider.
(async () => {
  const ports = process.argv.slice(2).length ? process.argv.slice(2) : ['5174'];
  for (const port of ports) assert.match(port, /^\d{4,5}$/);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-browser-cache' } });
  try {
    for (const port of ports) for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      const context = await browser.newContext({ viewport }); const page = await context.newPage();
      const errors = []; const external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
      await page.goto(`http://127.0.0.1:${port}/#/sentence`, { waitUntil: 'networkidle' });
      const exercise = page.locator('.ll-sentences[data-exercise-id]');
      await exercise.waitFor();
      const firstId = await exercise.getAttribute('data-exercise-id');
      await page.getByRole('button', { name: 'Start mock session', exact: true }).click();
      await page.getByLabel('Mock oral response (simulated)', { exact: true }).fill('Explicit accepted translation fixture.');
      await page.getByRole('button', { name: 'Send simulated response', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.ll-sentences')?.getAttribute('data-stage') === 'explanation');
      await page.getByRole('button', { name: 'Preferences', exact: true }).click();
      await page.getByLabel('Grammar difficulty', { exact: true }).selectOption('2');
      assert.equal(await exercise.getAttribute('data-exercise-id'), firstId);
      assert.equal(await exercise.getAttribute('data-stage'), 'explanation');
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByLabel('Ask your coach a question', { exact: true }).fill('Can I take my time?');
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      await page.getByRole('button', { name: 'My question is resolved', exact: true }).waitFor();
      assert.equal(await exercise.getAttribute('data-exercise-id'), firstId);
      await page.getByRole('button', { name: 'My question is resolved', exact: true }).click();
      await page.getByLabel('Mock oral response (simulated)', { exact: true }).fill('Explicit accepted explanation fixture.');
      await page.getByRole('button', { name: 'Send simulated response', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.ll-sentences')?.getAttribute('data-stage') === 'complete');
      await page.waitForTimeout(1900);
      assert.equal(await exercise.getAttribute('data-exercise-id'), firstId);
      await page.getByRole('button', { name: 'Next exercise', exact: true }).click();
      await page.waitForFunction(id => document.querySelector('.ll-sentences')?.getAttribute('data-exercise-id') !== id, firstId);
      assert.equal(await exercise.getAttribute('data-stage'), 'translation');
      await page.getByRole('button', { name: 'Stop session', exact: true }).click();
      await page.getByRole('button', { name: 'Start mock session', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('lang-lessons.settings.v1')));
      assert.deepEqual(Object.keys(persisted).sort(), ['difficulty', 'helpEnabled', 'preferredMode', 'schemaVersion', 'untimedHelp']);
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      console.log(JSON.stringify({ status: 'passed', port, viewport, evidence: 'actual root rendering with explicit mock outcomes', checks: ['sentence stages', 'question hold', 'settings preserve evidence', 'manual Next', 'no history storage', 'reflow', 'no external requests'] }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
