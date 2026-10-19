const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { installBrowserTransport } = require('../tests/helpers/browser-transport.cjs');

// Shipped account/root components with controlled HTTP timing; no real accounts or provider.
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function administratorLogout(browser, origin) {
  const context = await browser.newContext();
  const transport = await installBrowserTransport(context, origin, { enabled: false });
  const refreshStarted = deferred(); const refresh = deferred();
  const logoutStarted = deferred(); const logout = deferred();
  let holdRefresh = false; let logoutRequests = 0;
  const administrator = { id: 'fixture-admin', email: 'admin@example.test', role: 'administrator', capabilities: { granted: ['users:list', 'users:manage'] } };
  await context.route('**/api/me', async route => {
    if (holdRefresh) { refreshStarted.resolve(); await refresh.promise; }
    await route.fulfill({ json: administrator });
  });
  await context.route(/\/api\/learning\/users(?:\/|\?|$)/u, async route => {
    if (route.request().method() === 'POST') {
      holdRefresh = true;
      return route.fulfill({ json: { user: { id: 'fixture-created-student', role: 'student', disabled: false, revision: 0 } } });
    }
    await route.fulfill({ json: { items: [{ ...administrator, disabled: false, revision: 0, credentialStatus: 'ready' }], nextCursor: null } });
  });
  await context.route('**/api/auth/sign-out', async route => {
    logoutRequests++; logoutStarted.resolve(); await logout.promise;
    await route.fulfill({ json: { ok: true } });
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.getByLabel('New user email').fill('learner@example.test');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm change', exact: true }).click();
    await refreshStarted.promise;
    await page.getByRole('button', { name: 'Preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await logoutStarted.promise;
    assert.equal(await page.locator('.p3-admin').evaluate(element => Boolean(element.closest('[inert]'))), true, 'management is unavailable during sign-out');
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/me');
    refresh.resolve(); await refreshed;
    logout.resolve();
    await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
    assert.equal(await page.locator('.p3-admin').count(), 0, 'a successful refresh cannot restore the signed-out account');
    assert.equal(logoutRequests, 1);
    assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
  } finally { refresh.resolve(); logout.resolve(); await context.close(); }
}

async function studentLogout(browser, origin) {
  const context = await browser.newContext();
  const transport = await installBrowserTransport(context, origin, { enabled: false });
  const logoutStarted = deferred(); const logout = deferred();
  await context.route('**/api/auth/sign-out', async route => {
    assert.ok(transport.learningCalls.includes('/api/learning/progress'), 'written progress is saved before cookie revocation');
    assert.equal(transport.learningCalls.includes('/api/learning/session/confirm-close'), false, 'text sign-out preserves the saved practice session');
    logoutStarted.resolve(); await logout.promise;
    await route.fulfill({ json: { ok: true } });
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'Base form', exact: true });
    await field.fill('be'); await field.press('Enter');
    await page.locator('.ll-correct').first().waitFor();
    await page.getByRole('button', { name: 'Preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await logoutStarted.promise;
    const entries = transport.learningCalls.filter(path => path === '/api/learning/session/enter').length;
    assert.equal(await page.locator('.lesson-catalog').evaluate(element => Boolean(element.closest('[inert]'))), true, 'catalog controls cannot open another lesson while sign-out waits');
    await page.evaluate(() => { location.hash = '#/sentence'; });
    await page.waitForFunction(() => location.hash === '#/');
    assert.equal(transport.learningCalls.filter(path => path === '/api/learning/session/enter').length, entries, 'direct navigation also cannot enter a session during sign-out');
    logout.resolve();
    await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
    assert.equal(await page.locator('.lesson-catalog').count(), 0);
    assert.equal(transport.sessionRequests, 0); assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
  } finally { logout.resolve(); await context.close(); }
}

(async () => {
  const port = process.argv[2] || '5174'; assert.match(port, /^\d{4,5}$/);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-account-config', XDG_CACHE_HOME: '/tmp/lang-lessons-account-cache' } });
  try {
    const origin = `http://127.0.0.1:${port}`;
    await administratorLogout(browser, origin);
    await studentLogout(browser, origin);
    console.log(JSON.stringify({ status: 'passed', evidence: 'actual root rendering with mocked HTTP; no real account, microphone or provider', checks: ['refresh overlapping sign-out', 'management locked during sign-out', 'written progress saved without closing before sign-out', 'catalog and direct navigation locked during sign-out'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
