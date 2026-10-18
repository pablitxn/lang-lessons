const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { installBrowserTransport, inspectTransport } = require('../tests/helpers/browser-transport.cjs');

// Actual app + feature + controller rendering with intercepted WebRTC transport.
// These lifecycle checks do not validate real audio, pronunciation, cost or a provider.
(async () => {
  const ports = process.argv.slice(2).length ? process.argv.slice(2) : ['5174'];
  for (const port of ports) assert.match(port, /^\d{4,5}$/);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-browser-cache' } });
  async function setup(port, viewport) {
    const origin = `http://127.0.0.1:${port}`;
    const context = await browser.newContext({ viewport });
    const transport = await installBrowserTransport(context, origin);
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
    return { context, page, transport, errors };
  }
  async function startTutor(page) {
    const dialog = page.getByRole('dialog', { name: 'Voice call details', exact: true });
    const scope = await dialog.isVisible() ? dialog : page.locator('header');
    await scope.getByRole('button', { name: 'Start tutor', exact: true }).click();
  }
  async function ready(page) {
    await page.waitForFunction(() => window.__voiceTransportFixture.peers.at(-1)?.channel?.readyState === 'open');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Mute microphone' && !button.disabled));
    const details = page.getByRole('dialog', { name: 'Voice call details', exact: true });
    if (await details.isVisible()) await details.getByRole('button', { name: 'Close voice details', exact: true }).click();
  }
  async function openVoiceError(page) {
    const details = page.getByRole('dialog', { name: 'Voice call details', exact: true });
    if (!await details.isVisible()) await page.getByRole('button', { name: 'Voice unavailable', exact: true }).click();
    await details.getByRole('button', { name: 'Start tutor', exact: true }).waitFor();
  }
  async function assertReleased(page) {
    const state = await inspectTransport(page);
    assert.ok(state.tracks.every(track => track.stopped));
    assert.ok(state.peers.every(peer => peer.closed && peer.channel === 'closed'));
  }
  try {
    for (const port of ports) {
      for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
        for (const [name, mode] of [['Picture', 'verb-image'], ['Verb', 'verb-visible'], ['Sentence', 'sentence']]) {
          const { context, page, transport, errors } = await setup(port, viewport);
          await page.getByRole('link', { name: `Start ${name} practice`, exact: true }).click(); await startTutor(page); await ready(page);
          const call = page.locator('header');
          const exercise = page.locator(mode === 'sentence' ? '.ll-sentences[data-exercise-id]' : '.verbs-lesson');
          const attribute = mode === 'sentence' ? 'data-exercise-id' : 'data-exercise';
          const firstId = await exercise.getAttribute(attribute);
          assert.ok(firstId); assert.equal(transport.sessionRequests, 1);
          assert.equal((await inspectTransport(page)).mediaCalls, 1);
          assert.doesNotMatch(await page.locator('body').innerText(), /mock|session mode|ask your coach a question/i);
          assert.equal(await page.getByRole('region', { name: 'Coach response', exact: true }).count(), 0);
          assert.equal(await page.locator('.ll-progress:visible').count(), 0);
          if (mode === 'verb-image') assert.equal(await exercise.locator('.ll-cue img').evaluate(image => image.complete && image.naturalWidth > 0), true);
          if (mode !== 'sentence') {
            const label = mode === 'verb-image' ? 'Base form' : 'Past';
            await page.getByRole('textbox', { name: label, exact: true }).fill('zzzz');
            await page.locator('.ll-incorrect').first().waitFor();
          }
          assert.equal(await page.getByRole('button', { name: 'Your progress', exact: true }).count(), 0);
          assert.equal(await exercise.getAttribute(attribute), firstId);
          await page.getByRole('button', { name: 'Preferences', exact: true }).click();
          await page.getByLabel('Theme', { exact: true }).selectOption('dark');
          await page.getByRole('navigation', { name: 'Preferences sections' }).getByRole('button', { name: 'Learning', exact: true }).click();
          await page.getByLabel('Grammar difficulty', { exact: true }).selectOption('2');
          await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
          assert.equal(await exercise.getAttribute(attribute), firstId); assert.equal(transport.sessionRequests, 1);
          await page.getByRole('button', { name: 'Voice call details', exact: true }).click();
          await page.getByRole('dialog').getByRole('button', { name: 'Mute microphone', exact: true }).click();
          assert.equal((await inspectTransport(page)).tracks[0].enabled, false);
          await page.getByRole('dialog').getByRole('button', { name: 'Unmute microphone', exact: true }).click();
          assert.equal((await inspectTransport(page)).tracks[0].enabled, true);
          await page.getByRole('button', { name: 'Close voice details', exact: true }).click();
          const pausedRelease = page.waitForResponse(response => response.url().endsWith('/api/realtime/session/end'));
          await call.getByRole('button', { name: 'Stop tutor', exact: true }).click();
          await pausedRelease; assert.equal(transport.releaseRequests, 1);
          await call.getByRole('button', { name: 'Start tutor', exact: true }).waitFor(); await assertReleased(page);
          assert.equal(await exercise.getAttribute(attribute), firstId);
          await call.getByRole('button', { name: 'Start tutor', exact: true }).click(); await ready(page);
          assert.equal(transport.sessionRequests, 2); assert.equal((await inspectTransport(page)).mediaCalls, 2);
          assert.equal(await exercise.getAttribute(attribute), firstId);
          assert.equal(await page.getByRole('button', { name: 'Reference table', exact: true }).count(), 0);
          assert.equal(await exercise.getAttribute(attribute), firstId);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          assert.equal(await page.evaluate(() => document.querySelector('.ll-exercise').getBoundingClientRect().bottom <= innerHeight), true);
          await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
          if (port === ports[0] && [390, 1024].includes(viewport.width)) await page.screenshot({ path: `/tmp/lang-lessons-voice-ui-final-${mode}-${viewport.width}.png`, fullPage: true });
          const routeRelease = page.waitForResponse(response => response.url().endsWith('/api/realtime/session/end'));
          await page.getByRole('link', { name: 'All lessons', exact: true }).click();
          await page.getByRole('button', { name: 'Leave session', exact: true }).click(); await routeRelease;
          await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor(); await assertReleased(page);
          assert.equal(transport.releaseRequests, 2);
          const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('lang-lessons.settings.v1')));
          assert.deepEqual(Object.keys(persisted).sort(), ['difficulty', 'helpEnabled', 'preferredMode', 'schemaVersion', 'sentenceTense', 'theme', 'untimedHelp']);
          assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
          console.log(JSON.stringify({ status: 'passed', mode, port, viewport, evidence: 'actual app rendering; mocked browser transport; no real microphone/provider', checks: ['one explicit connection', 'progress home-only', 'settings preserve exercise/session', 'microphone mute', 'pause release/resume', 'reference home-only', 'route cleanup', '200% text/reflow', 'preferences-only storage', 'no external requests'] }));
          await context.close();
        }
      }
      // Cancellation and failures need no viewport duplication. They target resource ownership.
      const viewport = { width: 390, height: 844 };
      {
        const { context, page, transport, errors } = await setup(port, viewport);
        await page.getByRole('button', { name: 'Preferences', exact: true }).click();
        await page.getByRole('navigation', { name: 'Preferences sections' }).getByRole('button', { name: 'Learning', exact: true }).click();
        await page.getByLabel('Grammar difficulty', { exact: true }).selectOption('3');
        await page.getByLabel('Vocabulary difficulty', { exact: true }).selectOption('3');
        await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
        await page.getByRole('link', { name: 'Start Sentence practice', exact: true }).click();
        await page.getByRole('heading', { name: 'Sentence practice', exact: true }).waitFor();
        assert.equal(await page.locator('header').getByRole('button', { name: 'Start tutor', exact: true }).isDisabled(), true);
        await page.getByText(/No authored prompt matches grammar 3 and vocabulary 3/).waitFor();
        assert.equal(await page.locator('.ll-sentences[data-exercise-id]').count(), 0);
        assert.equal((await inspectTransport(page)).mediaCalls, 0); assert.equal(transport.sessionRequests, 0); assert.equal(transport.statusRequests, 0);
        await page.getByRole('button', { name: 'Preferences', exact: true }).click();
        await page.getByRole('navigation', { name: 'Preferences sections' }).getByRole('button', { name: 'Learning', exact: true }).click();
        await page.getByLabel('Grammar difficulty', { exact: true }).selectOption('1');
        await page.getByLabel('Vocabulary difficulty', { exact: true }).selectOption('1');
        await page.getByRole('button', { name: 'Close preferences', exact: true }).click(); await startTutor(page); await ready(page);
        assert.equal(await page.locator('.ll-sentences[data-exercise-id]').count(), 1);
        assert.equal((await inspectTransport(page)).mediaCalls, 1); assert.equal(transport.sessionRequests, 1);
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []); await context.close();
      }
      {
        const { context, page, transport, errors } = await setup(port, viewport);
        transport.sessionStatus = 503;
        await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click(); await startTutor(page);
        await openVoiceError(page); await assertReleased(page);
        assert.equal(transport.sessionRequests, 1);
        transport.sessionStatus = 200;
        await startTutor(page); await ready(page);
        assert.equal(transport.sessionRequests, 2); assert.equal((await inspectTransport(page)).mediaCalls, 2);
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []); await context.close();
      }
      {
        const { context, page, transport, errors } = await setup(port, viewport);
        await page.evaluate(() => { window.__voiceTransportFixture.mediaError = 'NotAllowedError'; });
        await page.getByRole('link', { name: 'Start Verb practice', exact: true }).click(); await startTutor(page);
        await openVoiceError(page);
        assert.equal(transport.sessionRequests, 0); assert.equal((await inspectTransport(page)).mediaCalls, 1);
        await page.evaluate(() => { window.__voiceTransportFixture.mediaError = null; });
        await startTutor(page); await ready(page);
        assert.equal(transport.sessionRequests, 1);
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []); await context.close();
      }
      {
        const { context, page, transport, errors } = await setup(port, viewport);
        await page.evaluate(() => { window.__voiceTransportFixture.deferMedia = true; });
        await page.getByRole('link', { name: 'Start Sentence practice', exact: true }).click(); await startTutor(page);
        await page.waitForFunction(() => window.__voiceTransportFixture.mediaCalls === 1);
        await page.getByRole('link', { name: 'All lessons', exact: true }).click();
        await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
        await page.evaluate(() => window.__voiceTransportFixture.resolveMedia());
        await page.waitForFunction(() => window.__voiceTransportFixture.tracks.length === 1 && window.__voiceTransportFixture.tracks[0].stopped);
        assert.equal(transport.sessionRequests, 0); assert.equal((await inspectTransport(page)).peers.length, 0);
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []); await context.close();
      }
      {
        const { context, page, transport, errors } = await setup(port, viewport);
        await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click(); await startTutor(page); await ready(page);
        let release; transport.releaseBarrier = new Promise(resolve => { release = resolve; });
        const pendingRelease = page.waitForRequest(request => request.url().endsWith('/api/realtime/session/end'));
        await page.getByRole('link', { name: 'All lessons', exact: true }).click();
        await page.getByRole('button', { name: 'Leave session', exact: true }).click(); await pendingRelease;
        await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
        const nextPreflight = page.waitForResponse(response => response.url().endsWith('/api/realtime/status'));
        await page.getByRole('link', { name: 'Start Verb practice', exact: true }).click(); await startTutor(page); await nextPreflight;
        await page.locator('header').getByRole('button', { name: 'Stop tutor', exact: true }).waitFor();
        assert.equal((await inspectTransport(page)).mediaCalls, 1); assert.equal(transport.sessionRequests, 1);
        release(); await ready(page);
        assert.equal((await inspectTransport(page)).mediaCalls, 2); assert.equal(transport.sessionRequests, 2);
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []); await context.close();
      }
      {
        const { context, page, transport, errors } = await setup(port, viewport);
        await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click(); await startTutor(page); await ready(page);
        transport.releaseStatus = 503;
        const failedRelease = page.waitForResponse(response => response.url().endsWith('/api/realtime/session/end'));
        await page.locator('header').getByRole('button', { name: 'Stop tutor', exact: true }).click(); await failedRelease;
        await startTutor(page);
        await openVoiceError(page);
        assert.equal((await inspectTransport(page)).mediaCalls, 1); assert.equal(transport.sessionRequests, 1);
        transport.releaseStatus = 200;
        await startTutor(page); await ready(page);
        assert.equal((await inspectTransport(page)).mediaCalls, 2); assert.equal(transport.sessionRequests, 2);
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []); await context.close();
      }
      {
        const { context, page, transport, errors } = await setup(port, viewport);
        let release; transport.statusBarrier = new Promise(resolve => { release = resolve; });
        const pendingStatus = page.waitForRequest(request => request.url().endsWith('/api/realtime/status'));
        await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click(); await startTutor(page); await pendingStatus;
        await page.getByRole('link', { name: 'All lessons', exact: true }).click();
        await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
        release();
        assert.equal((await inspectTransport(page)).mediaCalls, 0); assert.equal(transport.sessionRequests, 0);
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []); await context.close();
      }
      {
        const { context, page, transport, errors } = await setup(port, viewport);
        let release; transport.sessionBarrier = new Promise(resolve => { release = resolve; });
        const pendingSession = page.waitForRequest(request => request.url().endsWith('/api/realtime/session'));
        await page.getByRole('link', { name: 'Start Picture practice', exact: true }).click(); await startTutor(page);
        await pendingSession;
        await page.getByRole('link', { name: 'All lessons', exact: true }).click();
        await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor(); release();
        await assertReleased(page); assert.equal(transport.sessionRequests, 1);
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []); await context.close();
      }
      console.log(JSON.stringify({ status: 'passed', port, evidence: 'mocked browser transport only', checks: ['unsupported difficulty creates no call; valid context starts once', 'broker error explicit retry', 'microphone denial explicit retry', 'late microphone cancellation', 'pending preflight cancellation', 'pending broker cancellation', 'cross-lesson release gate', 'failed release blocks new call until retry'] }));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
