import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('professor daily pages preserve independent cursors, server policy and request identity', { skip: process.env.P3_BROWSER !== '1', timeout: 60000 }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5198;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', value => { log += String(value); }); server.stderr.on('data', value => { log += String(value); });
  let browser: any;
  try {
    for (let i = 0; i < 100 && !log.includes('Local:'); i++) { assert.equal(server.exitCode, null, log); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.match(log, /Local:/);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, env: { ...process.env, XDG_CONFIG_HOME: '/tmp/p3-browser-config', XDG_CACHE_HOME: '/tmp/p3-browser-cache' } });
    const page = await browser.newPage();
    const errors: string[] = [], external: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    page.on('request', (request: any) => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
    async function open(scenario = '') {
      await page.goto(`http://127.0.0.1:${port}/src/features/accounts/__fixtures__/daily.html?scenario=${scenario}`);
      await page.getByRole('button', { name: 'View progress for first-student', exact: true }).click();
    }
    async function select(day = '2026-10-18') { await page.getByLabel('Progress day', { exact: true }).fill(day); await page.getByRole('button', { name: 'Show day', exact: true }).click(); }
    const daily = page.getByRole('region', { name: 'Daily progress', exact: true });
    const history = page.getByRole('region', { name: 'Session history', exact: true });
    for (const width of [320, 390, 844, 1024]) {
      await page.setViewportSize({ width, height: 640 }); await open();
      assert.equal(await page.getByLabel('Progress day', { exact: true }).inputValue(), '');
      assert.equal(await page.evaluate(() => (window as any).p3DailyRequests.daily.length), 0);
      await select(); await daily.getByText('2026-10-18 · America/Argentina/Buenos_Aires', { exact: true }).waitFor();
      for (const duration of ['10 s', '20 s', '25 s']) assert.equal(await daily.getByText(duration, { exact: true }).count(), 1);
      assert.equal(await daily.getByText('30 s', { exact: true }).count(), 0);
      await daily.getByText('2026-10-18T23:30:00Z', { exact: true }).waitFor();
      await daily.getByText('typed / client-reported', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.getByRole('button', { name: 'Next written results', exact: true }).focus(); await page.keyboard.press('Enter');
    await daily.getByText('Result invalidated', { exact: true }).waitFor();
    assert.equal(await page.getByText('Daily page loaded for 2026-10-18', { exact: true }).evaluate((el: HTMLElement) => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Next daily sessions', exact: true }).click();
    await daily.getByText('first-student 2026-10-18 daily-two comment', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => (window as any).p3DailyRequests.daily.at(-1).input), { day: '2026-10-18', eventCursor: 'event-two', sessionCursor: 'daily-two' });
    await page.getByRole('button', { name: 'Previous written results', exact: true }).click(); await daily.getByText('accepted', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => (window as any).p3DailyRequests.daily.at(-1).input), { day: '2026-10-18', eventCursor: null, sessionCursor: 'daily-two' });
    await page.getByRole('button', { name: 'Next history sessions', exact: true }).click(); await history.getByText('first-student history history-two', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).p3DailyRequests.legacy), 0);
    await select('2026-10-19'); await daily.getByText('2026-10-19 · America/Argentina/Buenos_Aires', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => (window as any).p3DailyRequests.daily.at(-1).input), { day: '2026-10-19', eventCursor: null, sessionCursor: null });
    await open('late-day'); await select('2026-10-17'); await select();
    await daily.getByText('2026-10-18 · America/Argentina/Buenos_Aires', { exact: true }).waitFor(); await page.waitForTimeout(900);
    assert.equal(await daily.getByText('first-student 2026-10-17 daily-first comment', { exact: true }).count(), 0);
    await open('late-student'); await page.getByRole('button', { name: 'Back to students', exact: true }).click();
    await page.getByRole('button', { name: 'View progress for second-student', exact: true }).click();
    await history.getByText('second-student history first', { exact: true }).waitFor(); await page.waitForTimeout(800);
    assert.equal(await page.getByText('first-student history first', { exact: true }).count(), 0);
    await open('policy'); await select(); await daily.getByText('Daily grouping is unavailable', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Next history sessions', exact: true }).click(); await history.getByText('first-student history history-two', { exact: true }).waitFor();
    for (const scenario of ['error', 'history-error']) {
      await open(scenario); await select();
      const region = scenario === 'error' ? daily : history;
      await region.getByRole('alert').waitFor(); await region.getByRole('button', { name: 'Try again', exact: true }).click();
      await region.getByText(scenario === 'error' ? '2026-10-18 · America/Argentina/Buenos_Aires' : 'first-student history first', { exact: true }).waitFor();
    }
    await open('loading'); await select(); await daily.getByRole('status').filter({ hasText: 'Loading' }).waitFor();
    await daily.getByText('2026-10-18 · America/Argentina/Buenos_Aires', { exact: true }).waitFor();
    await open('empty'); await select(); await daily.getByText('No written results for this page.').waitFor(); await history.getByText('No session comments found.').waitFor();
    await open('denied'); await select(); await daily.getByRole('alert').waitFor(); await history.getByRole('alert').waitFor();
    for (const scenario of ['mismatch-day', 'mismatch-student']) { await open(scenario); await select(); await daily.getByText('Daily data could not be verified.').waitFor(); assert.equal(await daily.getByRole('article').count(), 0); }
    await open('cycle'); await select(); await page.getByRole('button', { name: 'Next written results', exact: true }).click(); await daily.getByText('The next page could not be verified.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Next written results', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Revoke access', exact: true }).click(); await page.getByRole('alert').waitFor(); assert.equal(await page.getByLabel('Progress day', { exact: true }).count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser?.close(); server.kill('SIGTERM'); }
});
