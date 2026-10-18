import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('Pictures card renders only after completion and explicit Next works at mobile width', { skip: process.env.P5_BROWSER !== '1', timeout: 60000 }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5198', '--strictPort']);
  let output = ''; server.stdout.on('data', data => { output += String(data); });
  let browser: any;
  try {
    for (let i = 0; i < 100 && !output.includes('Local:'); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(output, /Local:/);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
      env: { ...process.env, XDG_CONFIG_HOME: '/tmp/p5-browser-config', XDG_CACHE_HOME: '/tmp/p5-browser-cache' } });
    const page = await browser.newPage({ viewport: { width: 320, height: 640 } });
    const external: string[] = []; const errors: string[] = [];
    page.on('request', (request: any) => { if (!request.url().startsWith('http://127.0.0.1:5198/')) external.push(request.url()); });
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.addInitScript(() => { Math.random = () => 0; });
    await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-18T13:00:00Z'));
    await page.goto('http://127.0.0.1:5198/src/features/verbs/__fixtures__/preview.html');
    const lesson = page.locator('.verbs-lesson'); await lesson.waitFor();
    const initial = await lesson.getAttribute('data-exercise');
    const card = page.getByRole('region', { name: 'Completed picture dictionary' });
    assert.equal(await card.count(), 0);
    await page.getByRole('textbox', { name: 'Base form', exact: true }).fill('be');
    await page.getByRole('textbox', { name: 'Base form', exact: true }).press('Enter');
    await page.getByRole('textbox', { name: 'Past', exact: true }).fill('was');
    await page.getByRole('textbox', { name: 'Past', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Send oral fixture', exact: true }).click();
    assert.equal(await card.count(), 0);
    await page.getByRole('textbox', { name: 'Past participle', exact: true }).fill('been');
    await page.getByRole('textbox', { name: 'Past participle', exact: true }).press('Enter');
    await page.getByRole('heading', { name: 'Verb lesson fixture' }).click();
    await page.clock.runFor(2500);
    await card.waitFor();
    assert.match(await card.innerText(), /unavailable/);
    assert.equal(await lesson.getAttribute('data-exercise'), initial);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await card.getByRole('button', { name: 'Next picture', exact: true }).click();
    await card.waitFor({ state: 'detached' });
    assert.notEqual(await lesson.getAttribute('data-exercise'), initial);
    assert.equal(await page.getByTestId('observations').getAttribute('data-completed'), '1');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  } finally { await browser?.close(); server.kill(); }
});
