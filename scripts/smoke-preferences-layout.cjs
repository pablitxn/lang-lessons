const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');
const { installBrowserTransport, inspectTransport } = require('../tests/helpers/browser-transport.cjs');

// Actual Chromium geometry and native controls; all account/broker responses are fixtures.
// Opening Preferences never requests microphone access or starts a provider call.
const viewports = [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 705, height: 924 }, { width: 1024, height: 768 }];
function sameBounds(actual, expected, message) {
  for (const axis of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[axis] - expected[axis]) <= 1, `${message}: ${axis}, ${JSON.stringify({ actual, expected })}`);
}

(async () => {
  const ports = process.argv.slice(2).length ? process.argv.slice(2) : ['5174'];
  for (const port of ports) assert.match(port, /^\d{4,5}$/);
  const evidenceDirectory = process.env.EVIDENCE_DIR || '/tmp/lang-lessons-preferences-layout';
  mkdirSync(evidenceDirectory, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-layout-config', XDG_CACHE_HOME: '/tmp/lang-lessons-layout-cache' } });
  let contentScrollCases = 0;
  try {
    for (const port of ports) for (const viewport of viewports) {
      const origin = `http://127.0.0.1:${port}`;
      const context = await browser.newContext({ viewport, colorScheme: 'dark' });
      const transport = await installBrowserTransport(context, origin, { enabled: false });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
      const tools = page.getByRole('navigation', { name: 'Learning tools', exact: true });
      assert.equal(await tools.evaluate(element => getComputedStyle(element).position), 'fixed');
      const toolsAtTop = await tools.boundingBox();
      assert.ok(Math.abs(toolsAtTop.y + toolsAtTop.height - viewport.height) <= 1, 'Learning tools stay at the viewport bottom');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const toolsAtBottom = await tools.boundingBox();
      sameBounds(toolsAtBottom, toolsAtTop, 'Page scrolling keeps learning tools fixed');
      const lastCard = await page.locator('.lesson-card').last().boundingBox();
      assert.ok(lastCard.y + lastCard.height <= toolsAtBottom.y - 1, `Last lesson clears the fixed tools: ${JSON.stringify({ viewport, lastCard, toolsAtBottom })}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(() => window.scrollTo(0, 0));

      const preferences = page.getByRole('button', { name: 'Preferences', exact: true });
      const dialog = page.getByRole('dialog', { name: 'Preferences', exact: true });
      await preferences.click(); await dialog.waitFor();
      const sections = dialog.getByRole('navigation', { name: 'Preferences sections', exact: true });
      const content = dialog.locator('.preferences-content');
      const heading = dialog.locator('.preferences-heading');
      const close = dialog.getByRole('button', { name: 'Close preferences', exact: true });
      const initialBounds = await dialog.boundingBox();
      assert.ok(initialBounds.x >= 0 && initialBounds.y >= 0 && initialBounds.x + initialBounds.width <= viewport.width + 1 && initialBounds.y + initialBounds.height <= viewport.height + 1, 'Preferences fit inside the viewport');
      assert.equal(await close.innerText(), '');
      assert.equal(await close.locator('svg[aria-hidden="true"]').count(), 1);
      assert.ok((await close.boundingBox()).height >= 44, 'Icon close retains an accessible touch target');
      assert.equal(await sections.getByRole('button', { name: 'Storage', exact: true }).count(), 0);
      assert.equal(await dialog.getByRole('button', { name: 'Clear saved preferences', exact: true }).count(), 0);
      assert.equal(await dialog.getByText('Your name and photo, wherever you practice.', { exact: true }).count(), 0);
      assert.equal(await dialog.getByRole('button', { name: 'Choose photo', exact: true }).isEnabled(), true);
      assert.equal(await dialog.locator('input[type="file"]').isVisible(), false);
      const hint = dialog.locator('.profile-photo-hint');
      assert.match(await hint.innerText(), /JPG, PNG or WebP.*10 MB/);
      const photoHintSize = await hint.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      const nameSize = await dialog.getByLabel('Name', { exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      assert.ok(photoHintSize < nameSize, 'Photo format hint is visually secondary');

      const screenshots = [];
      async function screenshot(section) {
        if (port !== ports[0] || ![390, 705].includes(viewport.width)) return;
        const path = join(evidenceDirectory, `${section.toLowerCase()}-${viewport.width}x${viewport.height}.png`);
        await page.screenshot({ path }); screenshots.push(path);
      }
      await screenshot('Profile');
      for (const section of ['Profile', 'Appearance', 'Voice', 'Learning']) {
        await sections.getByRole('button', { name: section, exact: true }).click();
        await dialog.getByRole('heading', { name: section, exact: true }).waitFor();
        sameBounds(await dialog.boundingBox(), initialBounds, `Dialog bounds do not change for ${section}`);
        const contentBounds = await content.boundingBox();
        const navBounds = await sections.boundingBox();
        assert.ok(navBounds.x + navBounds.width <= contentBounds.x + 1, 'Section navigation remains on the left at every width');
        const signOut = await dialog.getByRole('button', { name: 'Sign out', exact: true }).boundingBox();
        const lastSection = await sections.getByRole('button', { name: 'Learning', exact: true }).boundingBox();
        assert.ok(signOut.x + signOut.width <= contentBounds.x + 1, 'Sign out is in the left sidebar');
        assert.ok(signOut.y >= lastSection.y + lastSection.height, 'Sign out stays below section navigation');
        assert.ok(Math.abs(signOut.y + signOut.height - contentBounds.y - contentBounds.height) <= 30, 'Sign out stays at the bottom of the sidebar');
        assert.equal(await content.evaluate(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)), true);
        assert.equal(await dialog.evaluate(element => element.scrollTop), 0);
        assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');

        if (section === 'Appearance') {
          const theme = dialog.getByRole('combobox', { name: 'Theme', exact: true });
          assert.equal(await theme.evaluate(element => element.tagName), 'SELECT');
          assert.equal(await theme.evaluate(element => getComputedStyle(element).appearance), 'none');
          assert.ok(await theme.evaluate(element => parseFloat(getComputedStyle(element).borderRadius) >= 8), 'Native select has the application styling');
          await theme.focus(); await theme.press('d'); await theme.press('Enter');
          assert.equal(await theme.inputValue(), 'dark', 'Native select responds to keyboard selection');
          await theme.selectOption('system');
        }
        if (section === 'Learning') {
          assert.equal(await content.locator('select').count(), 3);
          const grammar = dialog.getByRole('combobox', { name: 'Grammar difficulty', exact: true });
          await grammar.focus(); await grammar.press('3'); await grammar.press('Enter');
          assert.equal(await grammar.inputValue(), '3', 'Learning select responds to keyboard selection');
          await grammar.selectOption('1');
          await content.evaluate(element => { element.scrollTop = 0; });
          await screenshot('Learning');
          const headerBefore = await heading.boundingBox();
          const navBefore = await sections.boundingBox();
          const windowBefore = await page.evaluate(() => scrollY);
          const scroll = await content.evaluate(element => {
            element.scrollTop = element.scrollHeight;
            return { top: element.scrollTop, height: element.clientHeight, scrollHeight: element.scrollHeight };
          });
          if (scroll.scrollHeight > scroll.height) {
            assert.ok(scroll.top > 0, 'Long settings content can scroll'); contentScrollCases += 1;
          }
          sameBounds(await heading.boundingBox(), headerBefore, 'Content scroll leaves the header fixed');
          sameBounds(await sections.boundingBox(), navBefore, 'Content scroll leaves navigation fixed');
          sameBounds(await dialog.boundingBox(), initialBounds, 'Content scroll leaves dialog bounds fixed');
          assert.equal(await page.evaluate(() => scrollY), windowBefore, 'Content scroll does not move the page');
          assert.equal(await dialog.evaluate(element => element.scrollTop), 0, 'Dialog frame never becomes the scrolling container');
        }
      }
      await close.click(); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await preferences.evaluate(element => element === document.activeElement), true);
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
      await preferences.click(); await dialog.waitFor(); await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await preferences.evaluate(element => element === document.activeElement), true);
      assert.equal((await inspectTransport(page)).mediaCalls, 0);
      assert.equal(transport.statusRequests, 0); assert.equal(transport.sessionRequests, 0);
      assert.deepEqual(transport.externalRequests, []); assert.deepEqual(errors, []);
      console.log(JSON.stringify({ status: 'passed', port, viewport, evidence: 'actual Chromium layout and native keyboard controls; mocked account responses; no microphone/provider', checks: ['fixed home tools and last-card clearance', 'stable preferences frame', 'content-only scrolling', 'left sidebar and sign-out footer', 'icon close and focus restoration', 'compact photo picker', 'native styled selects'], screenshots }));
      await context.close();
    }
    assert.ok(contentScrollCases > 0, 'At least one narrow viewport exercises real content scrolling');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
