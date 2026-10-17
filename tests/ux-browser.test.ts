import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

// Opt in with UX_BROWSER=1. Uses the environment's supplied browser/helper
// resolution; no dependency, browser installation or TLS bypass is introduced.
test('mobile UI browser fixture preserves native input, stable results, help holds and question flow', { skip: process.env.UX_BROWSER !== '1', timeout: 60000 }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5192;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout.on('data', chunk => { serverLog += String(chunk); });
  server.stderr.on('data', chunk => { serverLog += String(chunk); });
  // Browser types are supplied by the environment, not a package dependency.
  let browser: any;
  try {
    for (let count = 0; count < 100 && !serverLog.includes('Local:'); count++) {
      assert.equal(server.exitCode, null, serverLog);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match(serverLog, /Local:/, serverLog);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
      env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-browser-cache' } });
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      const context: any = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
      const page: any = await context.newPage();
      const errors: string[] = [];
      const external: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      page.on('request', (request: { url(): string }) => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
      // Own every app timer from startup; installing after a help timer already
      // exists mixes real and controlled clocks under concurrent browser load.
      // Freeze before navigation rather than racing a Date.now() + 10ms round trip.
      await page.clock.install({ time: new Date('2026-10-16T12:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-16T13:00:00Z'));
      await page.goto(`http://127.0.0.1:${port}/src/ui/mobile/__fixtures__/preview.html`, { waitUntil: 'networkidle' });
      // This component harness also places its mock conversation controls and
      // question composer in the dock. Keep those test-only controls in flow;
      // the application browser suites cover the actual two-tool fixed dock.
      await page.addStyleTag({ content: '.ll-dock { position: static; }' });
      await page.getByText('Fixture controls', { exact: true }).focus();
      await page.keyboard.press('Enter');
      const field = page.getByRole('textbox', { name: 'Past', exact: true });
      const observations = page.getByTestId('observations');
      async function waitAttribute(name: string, value: string) {
        await page.waitForFunction(([name, value]: [string, string]) => document.querySelector('[data-testid="observations"]')?.getAttribute(name) === value, [name, value]);
      }
      await field.fill('bentt');
      assert.equal(await page.locator('.ll-spelling').count(), 0);
      await page.clock.runFor(300);
      assert.equal(await observations.getAttribute('data-finalizations'), '0');
      await page.clock.runFor(500);
      assert.equal(await observations.getAttribute('data-finalizations'), '1');
      await field.press('Enter');
      await field.blur();
      assert.equal(await observations.getAttribute('data-finalizations'), '1');
      await page.getByRole('button', { name: 'Process incorrect', exact: true }).click();
      assert.equal(await page.locator('.ll-incorrect').allTextContents().then((items: string[]) => items.join('')), 't');
      assert.equal(await page.locator('.ll-incorrect').evaluate((element: HTMLElement) => getComputedStyle(element).color), 'rgb(180, 35, 24)');
      assert.equal(await field.getAttribute('aria-invalid'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Sound help for Past', exact: true }).count(), 0);
      await page.getByLabel('Enable sound help', { exact: true }).check();
      const soundHelp = page.getByRole('button', { name: 'Sound help for Past', exact: true });
      const soundTooltip = page.getByRole('tooltip');
      const spellingField = page.locator('.ll-field');
      const heading = page.getByRole('heading', { name: 'Mobile UI component fixture', exact: true });
      async function fieldHeight() {
        return spellingField.evaluate((element: HTMLElement) => element.getBoundingClientRect().height);
      }
      await soundHelp.waitFor();
      const closedHeight = await fieldHeight();
      await soundHelp.hover();
      await soundTooltip.waitFor();
      await waitAttribute('data-holds', '1');
      assert.equal(await fieldHeight(), closedHeight);
      await soundTooltip.hover();
      assert.equal(await soundTooltip.isVisible(), true);
      await heading.hover();
      assert.equal(await soundTooltip.count(), 0);
      await waitAttribute('data-holds', '0');
      if (viewport.width === 390) {
        await soundHelp.focus();
        await soundTooltip.waitFor();
        await page.clock.runFor(9000);
        assert.equal(await soundHelp.count(), 1);
        await page.keyboard.press('Escape');
        await waitAttribute('data-holds', '0');
        assert.equal(await soundTooltip.count(), 0);
        // Keyboard focus keeps the offer available after the bubble closes.
        await page.clock.runFor(9000);
        assert.equal(await soundHelp.count(), 1);
        await page.keyboard.press('Tab');
        await page.clock.runFor(9000);
        assert.equal(await soundHelp.count(), 0);
        await field.focus();
        await soundHelp.waitFor();
      }
      if (viewport.width < 600) await soundHelp.tap();
      else await soundHelp.click();
      await page.getByText('/bent/', { exact: true }).waitFor();
      assert.equal(await soundTooltip.locator('[lang="es"]').count(), 1);
      await waitAttribute('data-holds', '1');
      assert.equal(await field.inputValue(), 'bentt');
      await page.keyboard.press('Escape');
      await waitAttribute('data-holds', '0');
      assert.equal(await soundTooltip.count(), 0);
      assert.equal(await soundHelp.count(), 1);
      assert.equal(await soundHelp.evaluate((element: HTMLElement) => document.activeElement === element), true);
      if (viewport.width < 600) {
        await soundHelp.tap();
        await soundTooltip.waitFor();
        await heading.tap();
      } else {
        await soundHelp.click();
        await soundTooltip.waitFor();
        await heading.click();
      }
      assert.equal(await soundTooltip.count(), 0);
      await waitAttribute('data-holds', '0');
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      const enlargedClosedHeight = await fieldHeight();
      await soundHelp.evaluate((element: HTMLElement) => element.scrollIntoView({ block: 'center' }));
      await soundHelp.focus();
      await soundTooltip.waitFor();
      assert.equal(await fieldHeight(), enlargedClosedHeight);
      const tooltipBounds = await soundTooltip.boundingBox();
      assert.ok(tooltipBounds && tooltipBounds.x >= 0 && tooltipBounds.x + tooltipBounds.width <= viewport.width);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.keyboard.press('Escape');
      await waitAttribute('data-holds', '0');
      await page.getByLabel('Enable sound help', { exact: true }).focus();
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      if (viewport.width === 390) {
        await page.getByLabel('Untimed help', { exact: true }).check();
        await soundHelp.waitFor();
        await page.clock.runFor(9000);
        assert.equal(await soundHelp.count(), 1);
        await soundHelp.focus();
        await soundTooltip.waitFor();
        await page.getByLabel('Untimed help', { exact: true }).focus();
        assert.equal(await soundTooltip.count(), 0);
        await waitAttribute('data-holds', '0');
        await page.clock.runFor(9000);
        assert.equal(await soundHelp.count(), 1);
      }
      await soundHelp.focus();
      await soundTooltip.waitFor();
      await field.fill('bent');
      assert.equal(await soundTooltip.count(), 0);
      await waitAttribute('data-holds', '0');
      assert.equal(await page.locator('.ll-spelling').count(), 0);
      await page.getByRole('button', { name: 'Process accepted', exact: true }).click();
      assert.equal(await page.locator('.ll-spelling.ll-correct').innerText(), '✓bent');
      assert.equal(await page.locator('.ll-spelling.ll-correct').evaluate((element: HTMLElement) => getComputedStyle(element).color), 'rgb(23, 100, 60)');
      assert.equal(await page.locator('.ll-incorrect').count(), 0);
      await page.getByRole('button', { name: 'Deliver stale result', exact: true }).click();
      assert.equal(await page.locator('.ll-spelling').count(), 0);
      const beforeComposition = Number(await observations.getAttribute('data-finalizations'));
      await field.focus();
      await field.dispatchEvent('compositionstart');
      await field.fill('ben');
      await page.clock.runFor(800);
      assert.equal(Number(await observations.getAttribute('data-finalizations')), beforeComposition);
      await field.dispatchEvent('compositionend');
      await field.press('Enter');
      await waitAttribute('data-finalizations', String(beforeComposition + 1));
      await field.fill('bent');
      await page.getByRole('button', { name: 'Process accepted', exact: true }).click();
      assert.equal(await page.getByRole('region', { name: 'Your progress' }).count(), 0);
      await page.getByRole('button', { name: 'Your progress', exact: true }).click();
      const progress = page.getByRole('dialog', { name: 'Lesson progress', exact: true });
      await progress.waitFor();
      await waitAttribute('data-holds', '1');
      const before = await progress.locator('.ll-progress-count').innerText();
      await page.keyboard.press('Escape');
      await waitAttribute('data-holds', '0');
      assert.equal(await progress.isVisible(), false);
      assert.equal(await page.getByRole('button', { name: 'Your progress', exact: true }).evaluate((element: HTMLElement) => document.activeElement === element), true);
      await page.getByRole('button', { name: 'Reference table', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Form reference', exact: true });
      await sheet.waitFor();
      await waitAttribute('data-holds', '1');
      assert.equal(await sheet.getByRole('button', { name: 'Stop session', exact: true }).count(), 1);
      await page.keyboard.press('Escape');
      assert.equal(await sheet.isVisible(), false);
      await waitAttribute('data-holds', '0');
      assert.equal(await page.getByRole('button', { name: 'Reference table', exact: true }).evaluate((element: HTMLElement) => document.activeElement === element), true);
      assert.equal(await field.inputValue(), 'bent');
      await page.getByRole('button', { name: 'Your progress', exact: true }).click();
      assert.equal(await progress.locator('.ll-progress-count').innerText(), before);
      await page.getByRole('button', { name: 'Close progress', exact: true }).click();
      await waitAttribute('data-holds', '0');
      assert.equal(await observations.getAttribute('data-generation'), '1');
      const question = page.getByRole('textbox', { name: 'Ask your coach a question', exact: true });
      await question.fill('Why does this work?');
      assert.equal(await observations.getAttribute('data-question-active'), 'true');
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      assert.equal(await observations.getAttribute('data-question-active'), 'false');
      assert.equal(await observations.getAttribute('data-question'), 'Why does this work?');
      await page.getByRole('button', { name: 'Toggle sentence mode', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Next exercise', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Accept translation', exact: true }).click();
      await page.getByText('Translation accepted. Name the tense', { exact: false }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Next exercise', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Accept explanation', exact: true }).click();
      await page.getByRole('button', { name: 'Next exercise', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      // All component harness controls remain usable with enlarged text.
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      console.log(JSON.stringify({ viewport, mock: true, checks: ['debounce', 'deduplication', 'stable letter/form colors', 'help opt-in', 'no autofill', 'hover/focus/touch tooltip holds and dismissal', 'focus pauses help expiry', 'untimed help', 'question draft', 'sentence sequence', 'tooltip without reflow', '200% text', 'no external requests'] }));
      if (viewport.width === 390) {
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        await page.getByRole('button', { name: 'Toggle sentence mode', exact: true }).click();
        await page.getByText('Fixture controls', { exact: true }).focus();
        await page.keyboard.press('Enter');
        await page.screenshot({ path: '/tmp/en-wp-02-mobile-ui.png', fullPage: true });
      }
      await context.close();
    }
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
});
