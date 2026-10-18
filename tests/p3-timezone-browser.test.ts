import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('student timezone settings require explicit choice, preserve revision/replay and exclude other roles', { skip: process.env.P3_BROWSER !== '1', timeout: 60000 }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5199;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', value => { log += String(value); }); server.stderr.on('data', value => { log += String(value); });
  let browser: any;
  try {
    for (let i = 0; i < 100 && !log.includes('Local:'); i++) { assert.equal(server.exitCode, null, log); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.match(log, /Local:/);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, env: { ...process.env, XDG_CONFIG_HOME: '/tmp/p3-browser-config', XDG_CACHE_HOME: '/tmp/p3-browser-cache' } });
    const page = await browser.newPage({ timezoneId: 'Asia/Tokyo' });
    const errors: string[] = [], external: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    page.on('request', (request: any) => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
    const open = (query = '') => page.goto(`http://127.0.0.1:${port}/src/features/accounts/__fixtures__/timezone.html?${query}`);
    const input = page.getByLabel('Your IANA timezone', { exact: true });
    for (const width of [320, 390, 844, 1024]) {
      await page.setViewportSize({ width, height: 640 }); await open(); await input.waitFor();
      assert.equal(await input.inputValue(), '');
      await page.getByText('No timezone configured.', { exact: false }).waitFor();
      assert.equal(await page.evaluate(() => (window as any).p3TimezoneCalls.requests.length), 0);
      await input.fill('EST'); await input.press('Enter');
      await page.getByText('Choose an IANA timezone such as', { exact: false }).waitFor();
      assert.equal(await page.evaluate(() => (window as any).p3TimezoneCalls.requests.length), 0);
      await input.fill('America/New_York'); await page.getByRole('button', { name: 'Save timezone', exact: true }).dblclick();
      await page.getByText('Timezone saved.', { exact: false }).waitFor();
      assert.equal(await page.evaluate(() => (window as any).p3TimezoneCalls.requests.length), 1);
      assert.equal(await page.getByText('Timezone saved.', { exact: false }).evaluate((el: HTMLElement) => el === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(await page.evaluate(() => { const { operationId, ...request } = (window as any).p3TimezoneCalls.requests[0]; return [typeof operationId, request]; }), ['string', { expectedRevision: 0, timeZone: 'America/New_York' }]);
      await page.getByText('2026-10-18T12:00:00Z', { exact: true }).waitFor();
    }
    await open('scenario=configured'); await input.waitFor(); assert.equal(await input.inputValue(), 'Europe/Paris');
    await input.fill('UTC'); await input.press('Enter'); await page.getByText('Timezone saved.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).p3TimezoneCalls.requests[0].expectedRevision), 4);
    await open('scenario=unknown'); await input.fill('UTC'); await input.press('Enter');
    await page.getByText('The save outcome is unknown.', { exact: false }).waitFor(); assert.equal(await input.isDisabled(), true);
    await page.getByRole('button', { name: 'Retry same timezone request', exact: true }).click(); await page.getByText('Timezone saved.', { exact: false }).waitFor();
    const replay = await page.evaluate(() => (window as any).p3TimezoneCalls.requests); assert.equal(replay.length, 2); assert.deepEqual(replay[0], replay[1]);
    await open('scenario=conflict'); await input.fill('UTC'); await input.press('Enter'); await page.getByRole('button', { name: 'Reload timezone setting', exact: true }).click();
    await page.getByText('2026-10-18T11:00:00Z', { exact: true }).waitFor(); assert.equal(await input.inputValue(), 'Europe/Paris');
    for (const query of ['role=administrator', 'role=professor', 'scenario=no-grant', 'scenario=read-denied']) {
      await open(query); await page.getByRole('alert').waitFor(); assert.equal(await input.count(), 0);
      if (query !== 'scenario=read-denied') assert.equal(await page.evaluate(() => (window as any).p3TimezoneCalls.read), 0);
    }
    await open('scenario=set-denied'); await input.fill('UTC'); await input.press('Enter'); await page.getByRole('alert').waitFor(); assert.equal(await input.count(), 0);
    await open('scenario=read-error'); await page.getByRole('button', { name: 'Try again', exact: true }).click(); await input.waitFor();
    await open('scenario=invalid-server'); await input.fill('UTC'); await input.press('Enter'); await page.getByText('The server did not accept this timezone.', { exact: false }).waitFor(); assert.equal(await input.isEnabled(), true);
    await open('scenario=unbound'); await page.getByText('Timezone configuration is unavailable.', { exact: false }).waitFor();
    await open('scenario=late'); await input.fill('UTC'); await input.press('Enter'); await page.getByRole('button', { name: 'Revoke timezone access' }).click();
    await page.getByRole('alert').waitFor(); await page.waitForTimeout(800); assert.equal(await page.getByText('Timezone saved.', { exact: false }).count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser?.close(); server.kill('SIGTERM'); }
});
