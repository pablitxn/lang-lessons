import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('both verb lessons render real images and enforce their shared-controller gate in Chromium', { skip: process.env.VERBS_BROWSER !== '1', timeout: 90000 }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5193;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', data => { log += String(data); });
  server.stderr.on('data', data => { log += String(data); });
  // Optional environment-supplied browser types are not a new repository dependency.
  let browser: any;
  try {
    for (let count = 0; count < 100 && !log.includes('Local:'); count++) {
      assert.equal(server.exitCode, null, log);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match(log, /Local:/);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
      env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-browser-cache' } });
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      for (const mode of ['image', 'visible']) {
        const context: any = await browser.newContext({ viewport });
        await context.addInitScript(() => { Math.random = () => 0; });
        const page: any = await context.newPage();
        const errors: string[] = []; const external: string[] = [];
        page.on('pageerror', (error: Error) => errors.push(error.message));
        page.on('request', (request: { url(): string }) => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
        await page.clock.install();
        await page.goto(`http://127.0.0.1:${port}/src/features/verbs/__fixtures__/preview.html?mode=${mode}`, { waitUntil: 'networkidle' });
        await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 10));
        const lesson = page.locator('.verbs-lesson');
        await lesson.waitFor();
        const original = await lesson.getAttribute('data-exercise');
        assert.equal(await lesson.getAttribute('data-verb'), 'be');
        assert.equal(await page.getByRole('textbox', { name: 'Base form', exact: true }).count(), mode === 'image' ? 1 : 0);
        if (mode === 'image') {
          assert.equal(await lesson.locator('.ll-cue img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), true);
          const base = page.getByRole('textbox', { name: 'Base form', exact: true });
          await base.fill('zzzz');
          await page.clock.runFor(600);
          assert.equal(await page.locator('.ll-spelling').count(), 0);
          await page.clock.runFor(200);
          await page.locator('.ll-incorrect').first().waitFor();
          assert.equal(await page.getByRole('button', { name: 'Sound help for Base form', exact: true }).count(), 0);
          await page.getByLabel('Enable sound help', { exact: true }).check();
          await page.getByRole('button', { name: 'Sound help for Base form', exact: true }).click();
          await page.locator('.ll-guide').waitFor();
          assert.equal(await base.inputValue(), 'zzzz');
          await page.getByRole('button', { name: 'Close sound help', exact: true }).click();
          await base.fill('be');
          await page.clock.runFor(800);
          await page.locator('.ll-spelling.ll-correct').waitFor();
        }
        for (const [label, value] of [['Past', 'was'], ['Past participle', 'been']]) {
          await page.getByRole('textbox', { name: label, exact: true }).fill(value);
          await page.clock.runFor(800);
        }
        await page.getByRole('button', { name: 'Give me a hint', exact: true }).focus();
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        const observations = page.getByTestId('observations');
        assert.equal(await observations.getAttribute('data-spelling-submissions'), mode === 'image' ? '4' : '2');
        await page.getByRole('button', { name: 'Send oral fixture', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.ll-progress-count')?.textContent?.includes('requirements accepted') && document.querySelector('.ll-progress progress')?.getAttribute('value') === document.querySelector('.ll-progress progress')?.getAttribute('max'));
        await page.getByRole('button', { name: 'Reference table', exact: true }).click();
        const sheet = page.getByRole('dialog', { name: 'Verb practice reference', exact: true });
        await sheet.waitFor();
        assert.equal(await sheet.getByRole('button', { name: 'Mock Stop session', exact: true }).count(), 1);
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'hidden' });
        const past = page.getByRole('textbox', { name: 'Past', exact: true });
        assert.equal(await past.inputValue(), 'was');
        const question = page.getByRole('textbox', { name: 'Ask your coach a question', exact: true });
        await question.fill('Why can I use this form?');
        await page.getByRole('button', { name: 'Ask', exact: true }).click();
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.getByRole('button', { name: 'Answer question fixture', exact: true }).click();
        await page.getByRole('button', { name: 'Keep speaking', exact: true }).click();
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.getByRole('button', { name: 'Finish speaking', exact: true }).click();
        await page.getByRole('button', { name: 'Stay here', exact: true }).click();
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.getByRole('button', { name: 'Back to practice', exact: true }).click();
        await page.clock.runFor(1799);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.clock.runFor(1);
        await page.waitForFunction(() => document.querySelector('.verbs-lesson')?.getAttribute('data-generation') === '2');
        assert.equal(await lesson.getAttribute('data-verb'), 'beat');
        assert.equal(await observations.getAttribute('data-completed'), '1');
        assert.equal(await page.getByRole('textbox', { name: 'Past', exact: true }).inputValue(), '');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (viewport.width === 390) {
          await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
          await page.screenshot({ path: `/tmp/en-wp-05-${mode}.png`, fullPage: true });
        }
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log(JSON.stringify({ mode, viewport, gate: 'shared controller', evidence: 'explicit mock only', checks: ['image/two or three fields', 'stable feedback/help', 'deduplicated finalization', 'full oral/written gate', 'helper/question/speech/pause holds', 'quiet auto-next', 'no repeat', 'reflow', '200% text', 'no external requests'] }));
        await context.close();
      }
    }
  } finally { await browser?.close(); server.kill('SIGTERM'); }
});
