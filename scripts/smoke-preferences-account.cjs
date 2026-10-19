const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { chromium } = require('playwright');

// Uses isolated browser contexts and existing loopback fixture accounts; never opens the user's browser session.
const origin = process.env.PREFERENCES_SMOKE_ORIGIN || 'http://127.0.0.1:5174';
assert.equal(new URL(origin).hostname, '127.0.0.1');
assert.ok(process.env.PREFERENCES_SMOKE_CREDENTIALS, 'Supply a private local account fixture');
assert.ok(process.env.LEARNING_DATABASE_URL, 'Supply the local fixture database configuration for exact restoration');
const database = new URL(process.env.LEARNING_DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname));
const accounts = JSON.parse(fs.readFileSync(process.env.PREFERENCES_SMOKE_CREDENTIALS, 'utf8'));
const screenshotDirectory = process.env.PREFERENCES_SMOKE_SCREENSHOTS;
const preferencesPath = '/api/learning/preferences';
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

(async () => {
  const pool = new Pool({ connectionString: database.href });
  const contexts = []; const pendingResponses = new Set();
  let browser = null; let original = null; let latestOwnWrite = null; let studentId;
  let successfulWrites = 0;
  const errors = []; const forbidden = [];
  async function accountId(email) {
    const result = await pool.query('SELECT id FROM "user" WHERE email=$1', [email]);
    assert.equal(result.rowCount, 1, 'The supplied local fixture must identify one account');
    return result.rows[0].id;
  }
  async function storedPreferences(userId) {
    const result = await pool.query('SELECT revision,settings,updated_at::text AS updated_at FROM learning_user_preferences WHERE user_id=$1', [userId]);
    return result.rows[0] || null;
  }
  async function restore() {
    if (!latestOwnWrite) return;
    const parameters = [studentId, latestOwnWrite.revision, JSON.stringify(latestOwnWrite.settings)];
    const result = original
      ? await pool.query('UPDATE learning_user_preferences SET revision=$4,settings=$5,updated_at=$6 WHERE user_id=$1 AND revision=$2 AND settings=$3::jsonb RETURNING user_id',
        [...parameters, original.revision, JSON.stringify(original.settings), original.updated_at])
      : await pool.query('DELETE FROM learning_user_preferences WHERE user_id=$1 AND revision=$2 AND settings=$3::jsonb RETURNING user_id', parameters);
    assert.equal(result.rowCount, 1, 'Preferences changed outside this smoke; preserve the concurrent edit instead of restoring over it');
    assert.deepEqual(await storedPreferences(studentId), original, 'Restore the exact original payload, revision and timestamp');
    latestOwnWrite = null;
  }
  function captureWrite(response) {
    if (new URL(response.url()).pathname !== preferencesPath || response.request().method() !== 'POST' || !response.ok()) return;
    const pending = response.json().then(value => {
      assert.ok(Number.isSafeInteger(value.revision) && value.revision > 0 && value.settings);
      successfulWrites++;
      if (!latestOwnWrite || value.revision > latestOwnWrite.revision) latestOwnWrite = value;
    }).catch(error => { errors.push(error.message); }).finally(() => pendingResponses.delete(pending));
    pendingResponses.add(pending);
  }
  async function isolatedBrowser() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Africa/Casablanca' });
    contexts.push(context);
    await context.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin !== origin || url.pathname.startsWith('/api/') && url.pathname.includes('hint')
        || url.pathname.startsWith('/api/realtime/') && request.method() === 'POST') {
        forbidden.push(url.pathname); return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message)); page.on('response', captureWrite);
    return { context, page };
  }
  const settingsKey = id => `lang-lessons.account-settings.v1:${encodeURIComponent(id)}`;
  async function loginStudent(page) {
    await page.goto(origin);
    await page.getByLabel('Email', { exact: true }).fill(accounts.student.email);
    await page.getByLabel('Password', { exact: true }).fill(accounts.student.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
    await page.waitForFunction(key => localStorage.getItem(key) !== null, settingsKey(studentId));
  }
  async function openPreferences(page, section) {
    await page.getByRole('button', { name: 'Preferences', exact: true }).click();
    await page.getByRole('dialog', { name: 'Preferences', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Storage', exact: true }).count(), 0);
    await page.getByRole('button', { name: section, exact: true }).click();
  }
  async function readCanonical(context) {
    const response = await context.request.get(origin + preferencesPath);
    assert.equal(response.status(), 200, 'The migrated preferences service must be available');
    return response.json();
  }
  async function settled(context, page, fields) {
    let value;
    for (let attempt = 0; attempt < 40; attempt++) {
      value = await readCanonical(context);
      const setting = value.settings;
      if (setting && Object.entries(fields).every(([key, expected]) =>
        key === 'difficulty' ? setting.difficulty.grammar === expected.grammar && setting.difficulty.vocabulary === expected.vocabulary : setting[key] === expected)) break;
      await pause(100);
    }
    assert.ok(value.settings, 'Preferences were saved automatically');
    for (const [key, expected] of Object.entries(fields)) assert.deepEqual(value.settings[key], expected, `Canonical ${key} matches the latest edit`);
    await page.waitForFunction(key => {
      const cached = JSON.parse(localStorage.getItem(key) || 'null'); return cached && cached.dirty.length === 0;
    }, settingsKey(studentId));
    const cached = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), settingsKey(studentId));
    assert.deepEqual(cached.settings, value.settings, 'Device and account settings agree');
    await Promise.all([...pendingResponses]);
    return value;
  }
  async function screenshot(page, filename) {
    if (!screenshotDirectory) return;
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDirectory, filename), fullPage: true });
  }
  try {
    studentId = await accountId(accounts.student.email); original = await storedPreferences(studentId);
    const administratorId = accounts.administrator ? await accountId(accounts.administrator.email) : null;
    const administratorOriginal = administratorId ? await storedPreferences(administratorId) : null;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
    const a = await isolatedBrowser(); await loginStudent(a.page);
    await openPreferences(a.page, 'Appearance');
    await a.page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('dark');
    await a.page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('light');
    await a.page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('system');
    await a.page.getByRole('button', { name: 'Learning', exact: true }).click();
    for (const level of ['3', '1', '2']) await a.page.getByRole('combobox', { name: 'Grammar difficulty', exact: true }).selectOption(level);
    await a.page.getByRole('combobox', { name: 'Vocabulary difficulty', exact: true }).selectOption('3');
    for (const tense of ['present-simple', 'past-simple', 'past-perfect']) await a.page.getByRole('combobox', { name: 'Sentence tenses', exact: true }).selectOption(tense);
    await a.page.getByRole('checkbox', { name: 'Offer help after written corrections', exact: true }).uncheck();
    await a.page.getByRole('checkbox', { name: 'Keep sound-help offers available until dismissed', exact: true }).check();
    const expected = { theme: 'system', difficulty: { grammar: 2, vocabulary: 3 }, sentenceTense: 'past-perfect', helpEnabled: false, untimedHelp: true };
    const saved = await settled(a.context, a.page, expected);
    assert.ok(saved.revision > (original?.revision || 0));
    assert.equal(await a.page.getByRole('button', { name: 'Save preferences', exact: true }).count(), 0);
    await screenshot(a.page, 'preferences-learning-mobile.png');
    await a.page.reload(); await a.page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
    await a.page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || 'null')?.dirty.length === 0, settingsKey(studentId));
    await openPreferences(a.page, 'Learning');
    assert.equal(await a.page.getByRole('combobox', { name: 'Grammar difficulty', exact: true }).inputValue(), '2');
    assert.equal(await a.page.getByRole('combobox', { name: 'Sentence tenses', exact: true }).inputValue(), 'past-perfect');

    const b = await isolatedBrowser(); await b.page.goto(origin);
    assert.equal(await b.page.evaluate(key => localStorage.getItem(key), settingsKey(studentId)), null, 'Browser B has fresh device storage');
    await loginStudent(b.page); await openPreferences(b.page, 'Learning');
    assert.equal(await b.page.getByRole('combobox', { name: 'Grammar difficulty', exact: true }).inputValue(), '2');
    assert.equal(await b.page.getByRole('combobox', { name: 'Vocabulary difficulty', exact: true }).inputValue(), '3');
    assert.equal(await b.page.getByRole('combobox', { name: 'Sentence tenses', exact: true }).inputValue(), 'past-perfect');
    assert.equal(await b.page.getByRole('checkbox', { name: 'Keep sound-help offers available until dismissed', exact: true }).isChecked(), true);
    await b.page.getByRole('button', { name: 'Appearance', exact: true }).click();
    assert.equal(await b.page.getByRole('combobox', { name: 'Theme', exact: true }).inputValue(), 'system');
    await b.page.getByRole('button', { name: 'Close preferences', exact: true }).click();

    await b.page.getByRole('link', { name: 'Start Picture practice', exact: true }).click();
    await b.page.waitForFunction(() => document.querySelector('.verbs-lesson') || [...document.querySelectorAll('button')].some(button => button.textContent === 'Start new practice'));
    const startNew = b.page.getByRole('button', { name: 'Start new practice', exact: true });
    if (await startNew.isVisible()) await startNew.click();
    const lesson = b.page.locator('.verbs-lesson'); await lesson.waitFor();
    const identity = await lesson.getAttribute('data-exercise'); const generation = await lesson.getAttribute('data-generation');
    const draft = b.page.getByRole('textbox', { name: 'Past', exact: true }); await draft.fill('preference review');
    await openPreferences(b.page, 'Learning');
    await b.page.getByRole('combobox', { name: 'Grammar difficulty', exact: true }).selectOption('1');
    await settled(b.context, b.page, { ...expected, difficulty: { grammar: 1, vocabulary: 3 }, preferredMode: 'verb-image' });
    await screenshot(b.page, 'preferences-in-lesson-mobile.png');
    await b.page.getByRole('button', { name: 'Close preferences', exact: true }).click();
    assert.equal(await lesson.getAttribute('data-exercise'), identity); assert.equal(await lesson.getAttribute('data-generation'), generation);
    assert.equal(await draft.inputValue(), 'preference review');
    await b.page.getByRole('link', { name: 'All lessons', exact: true }).click();
    await b.page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();

    if (administratorId) {
      const c = await isolatedBrowser();
      const login = await c.context.request.post(origin + '/api/auth/sign-in/email', {
        headers: { origin }, data: { email: accounts.administrator.email, password: accounts.administrator.password },
      });
      assert.equal(login.status(), 200);
      const other = await readCanonical(c.context);
      assert.deepEqual(other, administratorOriginal ? { settings: administratorOriginal.settings, revision: administratorOriginal.revision } : { settings: null, revision: 0 });
      assert.deepEqual(await storedPreferences(administratorId), administratorOriginal, 'Student edits never change another account preferences');
      await c.context.request.post(origin + '/api/auth/sign-out', { headers: { origin }, data: {} });
    }
    assert.ok(successfulWrites >= 2); assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
    // Revocation is scoped to these isolated sessions; the user's existing browser is never touched.
    for (const { context } of [a, b]) await context.request.post(origin + '/api/auth/sign-out', { headers: { origin }, data: {} });
    console.log('Preferences smoke passed: automatic device/account saving, rapid edits, reload, fresh-browser hydration, account isolation and active exercise preservation.');
  } finally {
    try {
      for (const context of contexts) await context.close();
      await Promise.all([...pendingResponses]);
      await restore();
      if (latestOwnWrite === null && successfulWrites > 0) console.log('Original preferences restored with revision/settings comparison; no provider calls.');
    } finally { await browser?.close(); await pool.end(); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
