const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const verbContent = require('../content/en-wp-03/verbs.json');
const { installBrowserTransport, inspectTransport } = require('../tests/helpers/browser-transport.cjs');

// Actual app rendering with a disabled, intercepted broker. No microphone/provider.
(async () => {
  const ports = process.argv.slice(2).length ? process.argv.slice(2) : ['5174'];
  for (const port of ports) assert.match(port, /^\d{4,5}$/);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-browser-cache' } });
  try {
    for (const port of ports) for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      const origin = `http://127.0.0.1:${port}`;
      const context = await browser.newContext({ viewport, colorScheme: 'light' });
      const transport = await installBrowserTransport(context, origin, { enabled: false });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(`${origin}/`, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200);
      await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
      const lessons = page.getByRole('navigation', { name: 'Lessons', exact: true });
      assert.equal(await page.getByRole('button', { name: 'Preferences', exact: true }).innerText(), 'PC');
      assert.equal(await page.locator('.ll-dock').count(), 0);
      for (const name of ['Picture', 'Verb', 'Sentence']) assert.equal(await lessons.getByRole('link', { name: `Start ${name} practice`, exact: true }).count(), 1);
      assert.equal(transport.statusRequests, 0); assert.equal(transport.sessionRequests, 0);
      assert.equal((await inspectTransport(page)).mediaCalls, 0);
      assert.doesNotMatch(await page.locator('body').innerText(), /mock|session mode|local development|make english feel natural/i);
      assert.equal(await page.locator('footer').count(), 0);
      assert.equal(await page.locator('.catalog-note').count(), 0);

      const preferences = page.getByRole('button', { name: 'Preferences', exact: true });
      const dialog = page.getByRole('dialog', { name: 'Preferences', exact: true });
      await preferences.click(); await dialog.waitFor();
      const sections = dialog.getByRole('navigation', { name: 'Preferences sections' });
      const selectSection = name => sections.getByRole('button', { name, exact: true }).click();
      assert.equal(await sections.getByRole('button', { name: 'Appearance', exact: true }).getAttribute('aria-current'), 'page');
      assert.equal(await page.getByLabel('Grammar difficulty', { exact: true }).count(), 0);
      if (viewport.width >= 540) {
        const navBounds = await sections.boundingBox();
        const contentBounds = await dialog.locator('.preferences-content').boundingBox();
        assert.ok(navBounds.x + navBounds.width <= contentBounds.x + 1, 'Preferences sections sit left of the content');
      }
      await selectSection('Voice');
      await dialog.getByRole('button', { name: 'Check microphone access', exact: true }).click();
      await dialog.getByText('Microphone access is allowed.', { exact: true }).waitFor();
      assert.equal((await inspectTransport(page)).mediaCalls, 1);
      assert.equal((await inspectTransport(page)).tracks[0].stopped, true);
      assert.equal(transport.statusRequests, 0); assert.equal(transport.sessionRequests, 0);
      await selectSection('Learning');
      await page.getByLabel('Grammar difficulty', { exact: true }).selectOption('3');
      await page.getByLabel('Vocabulary difficulty', { exact: true }).selectOption('1');
      await page.getByLabel('Offer sound guidance after a spelling error').check();
      await page.getByLabel('Keep sound-help offers available until dismissed').check();
      await selectSection('Appearance');
      await page.getByLabel('Theme', { exact: true }).selectOption('dark');
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      for (let index = 0; index < 14; index += 1) await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await preferences.evaluate(element => element === document.activeElement), true);
      await page.evaluate(() => localStorage.setItem('unrelated.preference', 'preserve'));
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor(); await preferences.click();
      await selectSection('Learning');
      assert.equal(await page.getByLabel('Grammar difficulty', { exact: true }).inputValue(), '3');
      assert.equal(await page.getByLabel('Vocabulary difficulty', { exact: true }).inputValue(), '1');
      assert.equal(await page.getByLabel('Keep sound-help offers available until dismissed').isChecked(), true);
      await selectSection('Appearance');
      assert.equal(await page.getByLabel('Theme', { exact: true }).inputValue(), 'dark');
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      if (port === ports[0] && viewport.width === 390) await page.screenshot({ path: '/tmp/lang-lessons-preferences-390.png', fullPage: true });
      await page.getByLabel('Theme', { exact: true }).selectOption('system');
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
      await selectSection('Storage');
      await page.getByRole('button', { name: 'Clear saved preferences' }).click();
      await dialog.getByText('Saved preferences cleared.', { exact: true }).waitFor();
      await selectSection('Learning');
      assert.equal(await page.getByLabel('Grammar difficulty', { exact: true }).inputValue(), '1');
      await selectSection('Appearance');
      assert.equal(await page.getByLabel('Theme', { exact: true }).inputValue(), 'system');
      assert.equal(await page.evaluate(() => localStorage.getItem('unrelated.preference')), 'preserve');
      await page.getByRole('button', { name: 'Close preferences', exact: true }).click();

      for (const name of ['Picture', 'Verb', 'Sentence']) {
        await lessons.getByRole('link', { name: `Start ${name} practice`, exact: true }).click();
        await page.getByRole('heading', { name: `${name} practice`, exact: true }).waitFor();
        const voiceBadge = page.getByRole('button', { name: 'Voice unavailable', exact: true });
        await voiceBadge.waitFor();
        assert.equal(await page.locator('.voice-call-bar').count(), 0);
        assert.doesNotMatch(await page.locator('.ll-exercise').innerText(), /Voice is unavailable|Voice calls are turned off/);
        const statusRequests = transport.statusRequests;
        await voiceBadge.click();
        const voiceDetails = page.getByRole('dialog', { name: 'Voice call details', exact: true });
        await voiceDetails.waitFor();
        assert.equal(await voiceDetails.getByRole('button', { name: 'Unmute microphone', exact: true }).isDisabled(), true);
        await voiceDetails.getByRole('button', { name: 'Retry call', exact: true }).waitFor();
        assert.match(await voiceDetails.locator('.voice-call-status').innerText(), /Voice/);
        if (viewport.width === 390 && name === 'Sentence') await page.screenshot({ path: '/tmp/lang-lessons-voice-details.png' });
        await page.keyboard.press('Escape');
        await voiceDetails.waitFor({ state: 'hidden' });
        assert.equal(await voiceBadge.evaluate(element => document.activeElement === element), true);
        assert.equal(transport.statusRequests, statusRequests);
        const next = page.getByRole('button', { name: name === 'Sentence' ? 'Next sentence' : name === 'Picture' ? 'Next image' : 'Next word', exact: true });
        assert.equal((await next.innerText()).trim(), '→');
        const dock = page.locator('.ll-dock');
        assert.equal(await dock.evaluate(element => getComputedStyle(element).position), 'fixed');
        assert.equal(await dock.locator('svg').count(), 2);
        await dock.getByRole('button', { name: 'Your progress', exact: true }).click();
        await page.getByRole('dialog', { name: 'Lesson progress', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        if (viewport.width === 390 && name === 'Sentence') await page.screenshot({ path: '/tmp/lang-lessons-compact-sentence-390.png', fullPage: true });
        if (name !== 'Sentence') {
          const exercise = page.locator('.verbs-lesson');
          const verbId = await exercise.getAttribute('data-verb');
          const expectedPast = verbContent.verbs.find(verb => verb.lemma === verbId).forms.past[0].text;
          const past = page.getByRole('textbox', { name: 'Past', exact: true });
          await past.fill('zzzz');
          await page.getByRole('button', { name: 'Check Past', exact: true }).click();
          await exercise.locator('.ll-incorrect').first().waitFor();
          await past.fill(expectedPast);
          await page.getByRole('button', { name: 'Check Past', exact: true }).click();
          await exercise.locator('.ll-correct').first().waitFor();
          assert.doesNotMatch(await exercise.innerText(), /This response could not be processed/);
          assert.equal(transport.sessionRequests, 0);
          assert.equal((await inspectTransport(page)).mediaCalls, 0);
        }
        assert.doesNotMatch(await page.locator('body').innerText(), /mock|session mode|ask your coach a question/i);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await page.getByRole('link', { name: 'All lessons', exact: true }).click();
        await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
      }
      await page.goBack({ waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Sentence practice', exact: true }).waitFor();
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Sentence practice', exact: true }).waitFor();
      await page.getByRole('link', { name: 'All lessons', exact: true }).click();
      await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
      assert.equal(transport.sessionRequests, 0); assert.equal((await inspectTransport(page)).mediaCalls, 0);
      assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
      if (process.env.SCREENSHOT_PATH && port === ports[0] && viewport.width === 390) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
      console.log(JSON.stringify({ status: 'passed', port, viewport, evidence: 'actual browser rendering; mocked permission check and disabled broker; no real audio/provider', checks: ['lesson cards', 'preferences section navigation and focus/Escape', 'microphone permission check releases device without call', 'theme and system preference', 'independent preferences', 'persistence', 'owned reset', 'offline spelling without voice', 'three routes', 'reload/history', 'reflow', 'no external requests'], errors: errors.length }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
