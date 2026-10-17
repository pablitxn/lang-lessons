const assert = require('node:assert/strict');
const { chromium } = require('playwright');

// Actual root + feature + controller + deterministic mock; no microphone/provider.
(async () => {
  const ports = process.argv.slice(2).length ? process.argv.slice(2) : ['5174'];
  for (const port of ports) assert.match(port, /^\d{4,5}$/);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-browser-cache' } });
  try {
    for (const port of ports) for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      for (const mode of ['verb-image', 'verb-visible']) {
        const context = await browser.newContext({ viewport });
        await context.addInitScript(() => { Math.random = () => 0; });
        const page = await context.newPage(); const errors = []; const external = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
        // Freeze before navigation rather than racing a Date.now() + 10ms round trip.
        await page.clock.install({ time: new Date('2026-10-16T12:00:00Z') });
        await page.clock.pauseAt(new Date('2026-10-16T13:00:00Z'));
        await page.goto(`http://127.0.0.1:${port}/#/${mode}`, { waitUntil: 'networkidle' });
        const exercise = page.locator('.verbs-lesson'); await exercise.waitFor();
        const firstId = await exercise.getAttribute('data-exercise');
        assert.equal(await exercise.getAttribute('data-verb'), 'be');
        assert.equal(await page.getByRole('textbox', { name: 'Base form', exact: true }).count(), mode === 'verb-image' ? 1 : 0);
        if (mode === 'verb-image') assert.equal(await exercise.locator('.ll-cue img').evaluate(image => image.complete && image.naturalWidth > 0), true);
        const rootControls = page.getByRole('region', { name: 'Conversation controls', exact: true });
        await rootControls.getByRole('button', { name: 'Start mock session', exact: true }).click();
        const label = mode === 'verb-image' ? 'Base form' : 'Past';
        const field = page.getByRole('textbox', { name: label, exact: true });
        await field.fill('zzzz'); await page.clock.runFor(600);
        assert.equal(await page.locator('.ll-spelling').count(), 0);
        await page.clock.runFor(200); await page.locator('.ll-incorrect').first().waitFor();
        assert.equal(await page.getByRole('button', { name: `Sound help for ${label}`, exact: true }).count(), 0);
        await page.getByRole('button', { name: 'Preferences', exact: true }).click();
        await page.getByLabel('Offer sound guidance after a spelling error').check();
        await page.getByLabel('Keep sound-help offers available until dismissed').check();
        await page.getByRole('button', { name: 'Close', exact: true }).click();
        await page.getByRole('button', { name: `Sound help for ${label}`, exact: true }).click();
        await page.locator('.ll-guide').waitFor(); assert.equal(await field.inputValue(), 'zzzz');
        await page.getByRole('button', { name: 'Close sound help', exact: true }).click();
        await page.getByText('Mock response simulator', { exact: true }).click();
        await page.getByLabel('Simulated outcome', { exact: true }).selectOption('uncertain');
        await page.getByRole('button', { name: 'Send simulated speech', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.ll-progress progress')?.getAttribute('value') === '0');
        assert.equal(await exercise.getAttribute('data-exercise'), firstId);
        await page.getByLabel('Simulated outcome', { exact: true }).selectOption('accepted');
        await page.getByRole('button', { name: 'Send simulated speech', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.ll-progress progress')?.getAttribute('value') === '7');
        // IME defers checking; unrelated accepted oral evidence stays intact.
        await field.dispatchEvent('compositionstart'); await field.fill(mode === 'verb-image' ? 'be' : 'was');
        await page.clock.runFor(800);
        assert.equal(await page.locator('.ll-progress progress').getAttribute('value'), '7');
        await field.dispatchEvent('compositionend'); await page.clock.runFor(800);
        const forms = mode === 'verb-image' ? [['Past', 'was'], ['Past participle', 'been']] : [['Past participle', 'been']];
        for (const [name, value] of forms) { await page.getByRole('textbox', { name, exact: true }).fill(value); await page.clock.runFor(800); }
        const total = mode === 'verb-image' ? '10' : '9';
        await page.waitForFunction(value => document.querySelector('.ll-progress progress')?.getAttribute('value') === value, total);
        await page.clock.runFor(3000); assert.equal(await exercise.getAttribute('data-exercise'), firstId);
        await page.getByRole('button', { name: 'Reference table', exact: true }).click();
        const sheet = page.getByRole('dialog', { name: 'Verb practice reference', exact: true }); await sheet.waitFor();
        await sheet.getByRole('button', { name: 'Stop practice session', exact: true }).click();
        assert.equal(await page.locator('.ll-progress progress').getAttribute('value'), total);
        await sheet.getByRole('button', { name: 'Start practice session', exact: true }).click();
        await sheet.getByText('Mock voice ready', { exact: true }).waitFor();
        await page.clock.runFor(3000); assert.equal(await exercise.getAttribute('data-exercise'), firstId);
        await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'hidden' });
        const question = page.getByRole('textbox', { name: 'Ask your coach a question', exact: true });
        await question.fill('Why can I use this form?'); await page.getByRole('button', { name: 'Ask', exact: true }).click();
        await page.clock.runFor(3000); assert.equal(await exercise.getAttribute('data-exercise'), firstId);
        await question.fill('A question still being drafted.');
        await page.getByRole('button', { name: 'Resume practice', exact: true }).click();
        await page.clock.runFor(3000); assert.equal(await exercise.getAttribute('data-exercise'), firstId);
        await question.fill(''); await question.blur();
        await page.getByRole('button', { name: 'Stay here', exact: true }).click();
        await page.clock.runFor(3000); assert.equal(await exercise.getAttribute('data-exercise'), firstId);
        await page.getByRole('button', { name: 'Back to practice', exact: true }).click();
        await page.clock.runFor(1799); assert.equal(await exercise.getAttribute('data-exercise'), firstId);
        await page.clock.runFor(1);
        await page.waitForFunction(() => document.querySelector('.verbs-lesson')?.getAttribute('data-generation') === '2');
        assert.equal(await exercise.getAttribute('data-verb'), 'beat');
        assert.equal(await page.getByRole('textbox', { name: 'Past', exact: true }).inputValue(), '');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        if (port === ports[0] && [390, 1024].includes(viewport.width)) await page.screenshot({ path: `/tmp/lang-lessons-${mode}-${viewport.width}.png`, fullPage: true });
        // Replacing the route cancels timers/session work and leaves a fresh offline lesson.
        await page.getByRole('textbox', { name: 'Past', exact: true }).fill('beat');
        await page.getByRole('navigation', { name: 'Practice mode' }).getByRole('link', { name: 'Sentence', exact: true }).click();
        await page.locator('.ll-sentences[data-exercise-id]').waitFor(); await page.clock.runFor(3000);
        assert.equal(await page.locator('.ll-progress progress').getAttribute('value'), '0');
        await rootControls.getByRole('button', { name: 'Start mock session', exact: true }).waitFor();
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log(JSON.stringify({ status: 'passed', mode, port, viewport, evidence: 'actual root rendering; explicit mock outcomes; controlled clock', checks: ['independent oral/written evidence', 'debounce/IME', 'help without autofill', 'question/draft/helper holds', 'modal stop/restart', 'full quiet interval', 'no repeat', 'route cancellation', '200% text/reflow', 'no external requests'] }));
        await context.close();
      }
      const context = await browser.newContext({ viewport }); const page = await context.newPage();
      const errors = []; const external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
      await page.goto(`http://127.0.0.1:${port}/#/sentence`, { waitUntil: 'networkidle' });
      const exercise = page.locator('.ll-sentences[data-exercise-id]');
      await exercise.waitFor();
      const firstId = await exercise.getAttribute('data-exercise-id');
      await page.getByRole('button', { name: 'Start mock session', exact: true }).click();
      await page.getByLabel('Mock oral response (simulated)', { exact: true }).fill('Explicit accepted translation fixture.');
      await page.getByRole('button', { name: 'Send simulated response', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.ll-sentences')?.getAttribute('data-stage') === 'explanation');
      await page.getByRole('button', { name: 'Preferences', exact: true }).click();
      await page.getByLabel('Grammar difficulty', { exact: true }).selectOption('2');
      assert.equal(await exercise.getAttribute('data-exercise-id'), firstId);
      assert.equal(await exercise.getAttribute('data-stage'), 'explanation');
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByLabel('Ask your coach a question', { exact: true }).fill('Can I take my time?');
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      await page.getByRole('button', { name: 'My question is resolved', exact: true }).waitFor();
      assert.equal(await exercise.getAttribute('data-exercise-id'), firstId);
      await page.getByRole('button', { name: 'My question is resolved', exact: true }).click();
      await page.getByLabel('Mock oral response (simulated)', { exact: true }).fill('Explicit accepted explanation fixture.');
      await page.getByRole('button', { name: 'Send simulated response', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.ll-sentences')?.getAttribute('data-stage') === 'complete');
      await page.waitForTimeout(1900);
      assert.equal(await exercise.getAttribute('data-exercise-id'), firstId);
      await page.getByRole('button', { name: 'Next exercise', exact: true }).click();
      await page.waitForFunction(id => document.querySelector('.ll-sentences')?.getAttribute('data-exercise-id') !== id, firstId);
      assert.equal(await exercise.getAttribute('data-stage'), 'translation');
      await page.getByRole('button', { name: 'Stop session', exact: true }).click();
      await page.getByRole('button', { name: 'Start mock session', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('lang-lessons.settings.v1')));
      assert.deepEqual(Object.keys(persisted).sort(), ['difficulty', 'helpEnabled', 'preferredMode', 'schemaVersion', 'untimedHelp']);
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      if (port === ports[0] && [390, 1024].includes(viewport.width)) await page.screenshot({ path: `/tmp/lang-lessons-sentence-${viewport.width}.png`, fullPage: true });
      console.log(JSON.stringify({ status: 'passed', mode: 'sentence', port, viewport, evidence: 'actual root rendering with explicit mock outcomes', checks: ['sentence stages', 'question hold', 'settings preserve evidence', 'manual Next', 'no history storage', 'reflow', 'no external requests'] }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
