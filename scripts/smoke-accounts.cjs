const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// Explicit local-only account acceptance. Credentials are supplied from an ignored private file.
const origin = process.env.ACCOUNT_SMOKE_ORIGIN || 'http://127.0.0.1:5174';
assert.equal(new URL(origin).hostname, '127.0.0.1');
const alias = new URL(origin); alias.hostname = 'localhost';
const aliasOrigin = alias.origin;
assert.ok(process.env.ACCOUNT_SMOKE_CREDENTIALS, 'Supply an explicit private local account fixture');
const accounts = JSON.parse(fs.readFileSync(process.env.ACCOUNT_SMOKE_CREDENTIALS, 'utf8'));
const screenshotDirectory = process.env.ACCOUNT_SMOKE_SCREENSHOTS;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const errors = []; const external = []; let providerRequests = 0;
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin && url.origin !== aliasOrigin) { external.push(url.origin); return route.abort(); }
      if (url.pathname.startsWith('/api/realtime/') && route.request().method() !== 'GET' || url.pathname.startsWith('/api/') && url.pathname.includes('/hint')) { providerRequests++; return route.abort(); }
      return route.continue();
    });
    const screenshot = async name => {
      if (!screenshotDirectory) return;
      fs.mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDirectory, name), fullPage: true });
    };
    const reflow = async () => {
      for (const width of [320, 390, 844, 1280]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Reflow at ${width}px`);
      }
    };
    const login = async account => {
      await page.getByLabel('Email', { exact: true }).fill(account.email);
      await page.getByLabel('Password', { exact: true }).fill(account.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    };
    const signedOut = async () => {
      await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
      assert.equal((await context.request.get(origin + '/api/me')).status(), 401);
    };
    const signOut = async () => {
      await page.getByRole('button', { name: 'Preferences', exact: true }).click();
      const preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
      await preferences.getByRole('heading', { name: 'Profile', exact: true }).waitFor();
      await preferences.getByRole('button', { name: 'Sign out', exact: true }).click();
    };
    const documentHeaders = { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' };
    const redirect = await context.request.get(aliasOrigin + '/account/credentials?fixture=1', {
      headers: documentHeaders, maxRedirects: 0,
    });
    assert.equal(redirect.status(), 307);
    assert.equal(redirect.headers().location, origin + '/account/credentials?fixture=1');
    assert.equal(redirect.headers()['cache-control'], 'no-store');
    const rejectedLogin = await context.request.post(aliasOrigin + '/api/auth/sign-in/email', {
      headers: { Origin: aliasOrigin }, data: {}, maxRedirects: 0,
    });
    assert.equal(rejectedLogin.status(), 403, 'API requests retain origin validation');
    for (const [url, headers] of [
      [aliasOrigin + '/', {}],
      [aliasOrigin + '/src/main.tsx', { 'sec-fetch-dest': 'script', 'sec-fetch-mode': 'cors' }],
      [aliasOrigin + '/api/me', documentHeaders],
      [origin + '/', documentHeaders],
    ]) {
      const response = await context.request.get(url, { headers, maxRedirects: 0 });
      assert.notEqual(response.status(), 307, `No redirect for ${url}`);
    }
    await page.goto(aliasOrigin + '/account/credentials?fixture=1#token=' + 'a'.repeat(43));
    await page.getByLabel('New password', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).origin, origin);
    assert.equal(new URL(page.url()).pathname, '/account/credentials');
    assert.equal(new URL(page.url()).hash, '', 'Redemption captures and clears the inherited fragment');
    assert.equal(await page.getByText('This link is missing or invalid.', { exact: false }).count(), 0);
    await page.goto(aliasOrigin + '/?entry=localhost#local-navigation');
    assert.equal(page.url(), origin + '/?entry=localhost#local-navigation');
    await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
    await reflow(); await screenshot('login-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 }); await screenshot('login-mobile.png');
    await page.setViewportSize({ width: 1280, height: 1000 });
    await login(accounts.administrator);
    await page.getByRole('heading', { name: 'People & access' }).waitFor();
    await page.getByRole('heading', { name: accounts.student.email, exact: true }).waitFor();
    const studentCard = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: accounts.student.email, exact: true }) });
    assert.match(await studentCard.innerText(), /Password set/);
    assert.doesNotMatch(await page.locator('body').innerText(), /[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/i);
    await reflow(); await screenshot('admin-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 }); await screenshot('admin-mobile.png');
    await signOut(); await signedOut();
    await page.goto(aliasOrigin);
    assert.equal(new URL(page.url()).origin, origin);
    await login(accounts.student);
    await page.getByRole('heading', { name: 'Choose a lesson' }).waitFor();
    await screenshot('student-desktop.png');
    assert.equal(await page.getByRole('heading', { name: 'People & access' }).count(), 0);
    await page.getByRole('link', { name: 'Start Verb practice', exact: true }).click();
    await page.getByRole('textbox').first().waitFor();
    await page.getByRole('textbox').first().fill('wrote');
    await page.getByRole('textbox').first().press('Tab');
    await signOut();
    await signedOut();
    await login(accounts.student);
    await page.getByRole('heading', { name: 'Choose a lesson' }).waitFor();
    await signOut(); await signedOut();
    assert.equal(providerRequests, 0); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log('PASS: localhost entry redirects with query/fragment preserved, API origin validation, real local administrator/student sign-in, readable identities, four-width reflow, written lesson exit, logout/reload revocation; zero provider requests.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
