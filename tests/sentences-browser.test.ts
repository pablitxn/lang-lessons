import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('sentence feature browser flow preserves controller stages, alternatives, no spoilers and lifecycle', {
  skip: process.env.SENTENCES_BROWSER !== '1', timeout: 90000,
}, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5196;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', chunk => { logs += String(chunk); }); server.stderr.on('data', chunk => { logs += String(chunk); });
  let browser: any;
  try {
    for (let index = 0; index < 100 && !logs.includes('Local:'); index++) {
      assert.equal(server.exitCode, null, logs); await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match(logs, /Local:/, logs);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
      env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-sentences-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-sentences-browser-cache' } });
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      const context: any = await browser.newContext({ viewport });
      const page: any = await context.newPage();
      const errors: string[] = []; const external: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      page.on('request', (request: { url(): string }) => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
      await page.addInitScript(() => { Math.random = () => 0.999; });
      await page.goto(`http://127.0.0.1:${port}/src/features/sentences/__fixtures__/preview.html`, { waitUntil: 'networkidle' });
      const lesson = page.locator('.ll-sentences[data-exercise-id]');
      await lesson.waitFor();
      assert.match(await page.locator('.ll-spanish').innerText(), /Vivimos aquí desde 2020/);
      assert.equal(await page.evaluate(() => window.sentenceFixture.voice.listeners.size), 1);
      assert.equal(await page.evaluate(() => window.sentenceFixture.voice.connects), 0);
      const oldId = await lesson.getAttribute('data-exercise-id');
      await page.getByRole('button', { name: 'Reference table', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Sentence practice guide', exact: true });
      assert.doesNotMatch(await sheet.innerText(), /present perfect|present simple|have\/has|We have/i);
      await page.getByRole('button', { name: 'Close table', exact: true }).click();
      assert.equal(await lesson.getAttribute('data-exercise-id'), oldId);
      await page.getByRole('button', { name: 'Give me a hint', exact: true }).click();
      await page.evaluate(() => window.sentenceFixture.voice.hint('The answer is We have lived here since 2020. Use present perfect.'));
      await page.getByText('Reviewed coaching fallback · generated content was withheld.', { exact: true }).waitFor();
      assert.doesNotMatch(await lesson.innerText(), /The answer is|We have lived|present perfect/i);
      const mock = page.getByRole('textbox', { name: 'Mock oral response (simulated)', exact: true });
      await mock.fill("We've been living here since 2020.");
      await mock.dispatchEvent('compositionstart');
      await page.getByRole('button', { name: 'Send simulated response', exact: true }).click();
      assert.equal(await page.evaluate(() => window.sentenceFixture.voice.inputs.length), 0);
      await mock.dispatchEvent('compositionend');
      await page.getByRole('button', { name: 'Send simulated response', exact: true }).click();
      await page.evaluate(() => window.sentenceFixture.voice.assess());
      await page.waitForFunction(() => document.querySelector('.ll-sentences')?.getAttribute('data-stage') === 'explanation');
      assert.equal(await page.getByRole('button', { name: 'Next exercise', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Reference table', exact: true }).click();
      assert.match(await sheet.innerText(), /Present perfect continuous/);
      await page.getByRole('button', { name: 'Close table', exact: true }).click();
      await page.evaluate(() => window.sentenceFixture.voice.transcript('unclear auxiliary', true));
      await page.getByText(/The audio was unclear/).waitFor();
      assert.equal(await lesson.getAttribute('data-stage'), 'explanation');
      assert.match(await page.locator('.ll-progress-count').innerText(), /1 of 4/);
      await mock.fill('Present perfect continuous, have plus been plus living; residence began in 2020 and continues now.');
      await page.getByRole('button', { name: 'Send simulated response', exact: true }).click();
      await page.evaluate(() => window.sentenceFixture.voice.assess());
      const next = page.getByRole('button', { name: 'Next exercise', exact: true });
      await next.waitFor(); assert.equal(await page.getByTestId('completion-count').innerText(), '0');
      await page.evaluate(() => window.sentenceFixture.voice.speech(true)); assert.equal(await next.isDisabled(), true);
      await page.evaluate(() => window.sentenceFixture.voice.speech(false));
      await page.getByRole('textbox', { name: 'Ask your coach a question', exact: true }).fill('Why do both forms fit?');
      assert.equal(await next.isDisabled(), true);
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      await page.getByRole('button', { name: 'My question is resolved', exact: true }).click();
      assert.equal(await next.isDisabled(), false);
      await page.getByRole('button', { name: 'Reference table', exact: true }).click();
      assert.equal(await next.isDisabled(), true);
      await page.getByRole('button', { name: 'Close table', exact: true }).click();
      if (viewport.width === 390) await page.screenshot({ path: '/workspace/scratch/en-wp06-sentence-feature.png', fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await next.click();
      await page.waitForFunction((id: string) => document.querySelector('.ll-sentences')?.getAttribute('data-exercise-id') !== id, oldId);
      assert.equal(await page.getByTestId('completion-count').innerText(), '1');
      assert.equal(await lesson.getAttribute('data-stage'), 'translation');
      await page.getByText('Fixture controls', { exact: true }).click();
      await page.getByRole('button', { name: 'Set unsupported pair', exact: true }).click();
      await page.getByText('New difficulty settings apply to the next prompt. Your current work is preserved.', { exact: true }).waitFor();
      assert.equal(await lesson.getAttribute('data-stage'), 'translation');
      await page.getByRole('button', { name: 'Unmount lesson', exact: true }).click();
      assert.equal(await page.evaluate(() => window.sentenceFixture.voice.listeners.size), 0);
      assert.equal(await page.evaluate(() => window.sentenceFixture.voice.disconnects), 0);
      await page.getByRole('button', { name: 'Mount lesson', exact: true }).click();
      await page.getByText(/No authored prompt matches grammar 3 and vocabulary 3/).waitFor();
      assert.equal(await page.evaluate(() => window.sentenceFixture.voice.listeners.size), 0);
      await page.getByRole('button', { name: 'Restore supported pair', exact: true }).click();
      await lesson.waitFor(); assert.equal(await page.evaluate(() => window.sentenceFixture.voice.listeners.size), 1);
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      await context.close();
      console.log(JSON.stringify({ viewport, status: 'passed', source: 'rendered feature with explicitly simulated transport/verdicts' }));
    }
    const realContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const realPage = await realContext.newPage();
    await realPage.goto(`http://127.0.0.1:${port}/src/features/sentences/__fixtures__/preview.html?real=1`, { waitUntil: 'networkidle' });
    assert.equal(await realPage.getByRole('textbox', { name: 'Mock oral response (simulated)' }).count(), 0);
    assert.equal(await realPage.evaluate(() => window.sentenceFixture.voice.connects), 0);
    await realContext.close();
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
    await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', () => resolve()); });
  }
});
