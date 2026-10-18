import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('P3 mocked views handle all-student paging, denial, races, focus and reflow', { skip: process.env.P3_BROWSER !== '1', timeout: 60000 }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5197;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', value => { log += String(value); });
  server.stderr.on('data', value => { log += String(value); });
  let browser: any;
  try {
    for (let i = 0; i < 100 && !log.includes('Local:'); i++) { assert.equal(server.exitCode, null, log); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.match(log, /Local:/);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, env: { ...process.env, XDG_CONFIG_HOME: '/tmp/p3-browser-config', XDG_CACHE_HOME: '/tmp/p3-browser-cache' } });
    const page = await browser.newPage();
    const errors: string[] = [], external: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    page.on('request', (request: any) => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
    const open = (query = '') => page.goto(`http://127.0.0.1:${port}/src/features/accounts/__fixtures__/preview.html?${query}`);
    for (const width of [320, 390, 844, 1024]) {
      await page.setViewportSize({ width, height: 640 });
      await open();
      await page.getByRole('button', { name: 'Next students' }).click();
      const student = page.getByRole('button', { name: 'View progress for student-outside-subset' });
      await student.focus(); await page.keyboard.press('Enter');
      await page.getByText('Mock comment for student-outside-subset:', { exact: false }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Progress for student-outside-subset' }).evaluate((el: HTMLElement) => el === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole('button', { name: 'Back to students' }).click();
      await page.waitForFunction(() => document.activeElement?.textContent === 'View progress for student-outside-subset');
    }
    await open('scenario=loading'); await page.getByRole('status').filter({ hasText: 'Loading' }).waitFor();
    await page.getByRole('button', { name: 'View progress for student-first' }).waitFor();
    await open('scenario=empty'); await page.getByText('No students found.').waitFor();
    await open('scenario=error'); await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Private transport detail').count(), 0);
    await page.getByRole('button', { name: 'Try again' }).click(); await page.getByRole('button', { name: 'View progress for student-first' }).waitFor();
    await open('scenario=denied'); await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: /View progress/ }).count(), 0);
    await open('scenario=unbound'); await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => (window as any).p3Calls.list), 0);
    await open('scenario=late'); await page.getByRole('button', { name: 'View progress for student-first' }).click();
    await page.getByRole('button', { name: 'Back to students' }).click();
    await page.getByRole('button', { name: 'Next students' }).click();
    await page.getByRole('button', { name: 'View progress for student-outside-subset' }).click();
    await page.getByText('Mock comment for student-outside-subset:', { exact: false }).waitFor();
    await page.waitForTimeout(1000);
    assert.equal(await page.getByText('Mock comment for student-first:', { exact: false }).count(), 0);
    await page.getByRole('button', { name: 'Revoke grants' }).click(); await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Mock comment', { exact: false }).count(), 0);
    await open('scenario=mismatch'); await page.getByRole('button', { name: 'View progress for student-first' }).click();
    await page.getByText('Comment could not be verified.').waitFor();
    assert.equal(await page.getByText('Mock comment', { exact: false }).count(), 0);
    await open('view=admin&role=administrator'); await page.getByRole('list', { name: 'Users', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Create|Disable|Delete/ }).count(), 0);
    await page.getByRole('button', { name: 'Next users' }).click(); await page.getByText('student-outside-subset · student').waitFor();
    await open('scenario=login-error'); await page.getByLabel('Email').fill('fixture@example.test'); await page.getByLabel('Password').fill('fixture-only');
    await page.getByLabel('Password').press('Enter'); await page.getByRole('alert').waitFor();
    assert.equal(await page.getByLabel('Password').inputValue(), '');
    assert.equal(await page.getByRole('alert').evaluate((el: HTMLElement) => el === document.activeElement), true);
    await open('scenario=login'); await page.getByLabel('Email').fill('fixture@example.test'); await page.getByLabel('Password').fill('fixture-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).dblclick(); await page.getByRole('heading', { name: 'All students' }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).p3Calls.login), 1);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser?.close(); server.kill('SIGTERM'); }
});
