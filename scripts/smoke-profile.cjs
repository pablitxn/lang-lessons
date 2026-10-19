const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { chromium } = require('playwright');

// Isolated browser session, existing local synthetic account, bounded temporary profile edits.
const origin = process.env.PROFILE_SMOKE_ORIGIN || 'http://127.0.0.1:5174';
assert.equal(new URL(origin).hostname, '127.0.0.1');
assert.ok(process.env.PROFILE_SMOKE_CREDENTIALS, 'Supply the private local account fixture');
assert.ok(process.env.LEARNING_DATABASE_URL, 'Supply the local fixture database configuration for exact restoration');
const database = new URL(process.env.LEARNING_DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname));
const accounts = JSON.parse(fs.readFileSync(process.env.PROFILE_SMOKE_CREDENTIALS, 'utf8'));
const screenshotDirectory = process.env.PROFILE_SMOKE_SCREENSHOTS;

(async () => {
  const pool = new Pool({ connectionString: database.href });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
  let original = null;
  let expectedProfile = null;
  async function restoreProfile() {
    if (!original || !expectedProfile) return;
    const restored = await pool.query('UPDATE "user" SET name=$2,image=$3,"updatedAt"=$4 WHERE id=$1 AND name=$5 AND image IS NOT DISTINCT FROM $6 RETURNING id',
      [original.id, original.name, original.image, original.updatedAt, expectedProfile.name, expectedProfile.image]);
    assert.equal(restored.rowCount, 1, 'The fixture profile changed concurrently; preserve that change instead of overwriting it');
    expectedProfile = null;
  }
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Istanbul' });
    const page = await context.newPage();
    const errors = []; const forbidden = []; const timezones = []; const sessionEntries = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/me' || url.pathname === '/api/learning/session/enter') timezones.push(request.headers()['x-learning-time-zone']);
    });
    page.on('response', async response => {
      if (new URL(response.url()).pathname === '/api/learning/session/enter' && response.ok()) sessionEntries.push((await response.json()).session);
    });
    await context.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin !== origin || url.pathname.startsWith('/api/') && url.pathname.includes('hint') || url.pathname.startsWith('/api/realtime/') && request.method() === 'POST') {
        forbidden.push(url.pathname); return route.abort();
      }
      return route.continue();
    });
    const screenshot = async name => {
      if (!screenshotDirectory) return;
      fs.mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDirectory, name), fullPage: true });
    };
    const preferences = async () => { await page.getByRole('button', { name: 'Preferences', exact: true }).click(); await page.getByRole('dialog', { name: 'Preferences', exact: true }).waitFor(); };
    const saveProfile = async () => {
      expectedProfile = { name: (await page.getByRole('textbox', { name: 'Name', exact: true }).inputValue()).trim(),
        image: await page.getByRole('img', { name: 'Your profile photo', exact: true }).getAttribute('src') };
      const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/profile');
      await page.getByRole('button', { name: 'Save profile', exact: true }).click();
      assert.equal((await response).status(), 200); await page.getByText('Profile saved.', { exact: true }).waitFor();
    };
    await page.goto(origin);
    await page.getByLabel('Email', { exact: true }).fill(accounts.student.email);
    await page.getByLabel('Password', { exact: true }).fill(accounts.student.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
    const current = await (await context.request.get(origin + '/api/me')).json();
    const raw = await pool.query('SELECT id,name,image,"updatedAt" FROM "user" WHERE id=$1', [current.id]);
    assert.equal(raw.rows.length, 1); original = raw.rows[0];
    assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Your daily timezone', exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Saved practice', exact: true }).count(), 0);
    assert.equal(await page.getByText(accounts.student.email, { exact: false }).count(), 0);
    const timezone = await (await context.request.get(origin + '/api/learning/time-zone')).json();
    assert.equal(timezone.timeZone, 'Europe/Istanbul');
    await screenshot('catalog-mobile.png');

    await preferences();
    const name = page.getByRole('textbox', { name: 'Name', exact: true });
    assert.notEqual(await name.inputValue(), current.id, 'Opaque IDs are not display names');
    await name.fill('Profile Review Student');
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 800;
      const paint = canvas.getContext('2d'); paint.fillStyle = '#dbe7d0'; paint.fillRect(0, 0, 800, 800);
      paint.fillStyle = '#35554a'; paint.font = 'bold 280px sans-serif'; paint.textAlign = 'center'; paint.textBaseline = 'middle'; paint.fillText('PR', 400, 420);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByLabel('Profile photo', { exact: true }).setInputFiles({ name: 'synthetic-profile-fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByRole('img', { name: 'Your profile photo', exact: true }).waitFor();
    await saveProfile();
    const saved = await (await context.request.get(origin + '/api/me')).json();
    assert.equal(saved.name, 'Profile Review Student'); assert.match(saved.image, /^data:image\/jpeg;base64,/);
    await screenshot('profile-mobile.png');
    await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
    await page.reload(); await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
    assert.equal(await page.locator('#profile-preferences img').getAttribute('src'), saved.image);
    await preferences(); assert.equal(await name.inputValue(), 'Profile Review Student');
    assert.equal(await page.getByRole('img', { name: 'Your profile photo', exact: true }).getAttribute('src'), saved.image);
    await page.getByRole('button', { name: 'Close preferences', exact: true }).click();

    await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click();
    const lesson = page.locator('.verbs-lesson'); await lesson.waitFor();
    assert.equal(await page.getByRole('button', { name: /^(Start new practice|Resume session|Finalize session)$/ }).count(), 0);
    const exercise = await lesson.getAttribute('data-exercise'); const generation = await lesson.getAttribute('data-generation');
    const draft = page.getByRole('textbox', { name: 'Past', exact: true }); await draft.fill('review draft');
    const entriesBeforeSave = sessionEntries.length;
    await preferences(); await name.fill('Updated During Practice'); await saveProfile();
    await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
    assert.equal(await draft.inputValue(), 'review draft');
    assert.equal(await lesson.getAttribute('data-exercise'), exercise); assert.equal(await lesson.getAttribute('data-generation'), generation);
    assert.equal(sessionEntries.length, entriesBeforeSave, 'Profile updates preserve the canonical practice session');
    for (const width of [320, 390, 607, 1280]) {
      await page.setViewportSize({ width, height: 924 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Reflow at ${width}px`);
      const call = await page.locator('.header-voice-status button').first().boundingBox();
      const avatar = await page.getByRole('button', { name: 'Preferences', exact: true }).boundingBox();
      assert.ok(call && avatar); assert.ok(Math.abs(call.y + call.height / 2 - avatar.y - avatar.height / 2) <= 2, `Header alignment at ${width}px`);
      if (width === 390 || width === 607) await screenshot(`lesson-header-${width}.png`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await restoreProfile();
    await preferences(); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Leave session', exact: true }).count(), 0);
    await page.reload(); await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
    assert.equal((await context.request.get(origin + '/api/me')).status(), 401);
    assert.ok(timezones.length >= 2 && timezones.every(zone => zone === 'Europe/Istanbul'));
    assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
    console.log('Profile smoke passed: persistence, photo upload, active exercise preservation, automatic timezone, responsive header and logout revocation. Synthetic profile restored; no provider calls.');
  } finally {
    try { await restoreProfile(); } finally { await browser.close(); await pool.end(); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
