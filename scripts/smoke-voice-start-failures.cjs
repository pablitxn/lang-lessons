const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { installBrowserTransport, inspectTransport } = require('../tests/helpers/browser-transport.cjs');

// Actual shipped rendering with authenticated HTTP and WebRTC/media fixtures.
// No microphone, provider, credentials, or real call is used by this helper.
const privateDetail = 'private-start-detail: provider body and secret must never appear';
const genericMessage = 'The voice service could not start this call. Please try again.';
const cases = [
  { name: 'authentication', failure: { category: 'authentication', status: 401 }, message: 'The voice service could not authenticate with its provider. Ask the administrator to check its credentials.' },
  { name: 'permission', failure: { category: 'permission', status: 403 }, message: 'The voice service is not permitted to create calls. Ask the administrator to check provider access.' },
  { name: 'quota', failure: { category: 'quota', status: 429 }, message: 'The voice service has reached its usage allowance. Ask the administrator to check credits and limits before retrying.' },
  { name: 'credits-exhausted', failure: { category: 'credits-exhausted', status: 429 }, message: 'The voice service has no API credit available. Ask the administrator to check billing before retrying.' },
  { name: 'project-spend-limit', failure: { category: 'project-spend-limit', status: 429 }, message: 'The voice service has reached its project spending limit. Ask the administrator to review it before retrying.' },
  { name: 'organization-spend-limit', failure: { category: 'organization-spend-limit', status: 429 }, message: 'The voice service has reached its organization spending limit. Ask the administrator to review it before retrying.' },
  { name: 'usage-limit', failure: { category: 'usage-limit', status: 429 }, message: 'The voice service has reached its provider usage limit. Ask the administrator to review it before retrying.' },
  { name: 'rate-limit', failure: { category: 'rate-limit', status: 429 }, message: 'The voice provider is limiting requests right now. Wait before starting another call.' },
  { name: 'configuration', failure: { category: 'configuration', status: 422 }, message: 'The voice provider rejected the call configuration. Ask the administrator to review the voice service.' },
  { name: 'model-unavailable', failure: { category: 'model-unavailable', status: 404 }, message: 'The configured voice model is unavailable to this service. Ask the administrator to check model access.' },
  { name: 'unavailable', failure: { category: 'unavailable', status: 503 }, message: 'The voice provider is temporarily unavailable. Try again later.' },
  { name: 'rejected', failure: { category: 'rejected', status: 418 }, message: 'The voice provider rejected this call. Ask the administrator to check the voice service before retrying.' },
  { name: 'injected-category', failure: { category: '<img src=x onerror="window.__unsafeVoiceStart=true">', status: 429 }, message: genericMessage },
  { name: 'unexpected-provider-field', failure: { category: 'quota', status: 429, message: privateDetail }, message: genericMessage },
  { name: 'mismatched-status', failure: { category: 'quota', status: 400 }, message: genericMessage },
  { name: 'coerced-status', failure: { category: 'quota', status: '429' }, message: genericMessage },
];

async function savedWrittenProgress(page, sessionId) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(async sessionId => {
      const { createIndexedDbWrittenSnapshotStore } = await import('/src/features/progress/written-snapshot-store.ts');
      const store = createIndexedDbWrittenSnapshotStore();
      try { return await store.load({ userId: 'browser-fixture-student', sessionId }, 'verb-visible'); }
      finally { await store.close(); }
    }, sessionId);
    if (snapshot?.drafts.past === 'was' && snapshot.records.find(record => record.form === 'past')?.finalized) return snapshot;
    await page.waitForTimeout(50);
  }
  throw new Error('The finalized written fixture did not persist before voice startup.');
}

(async () => {
  const ports = process.argv.slice(2).length ? process.argv.slice(2) : ['5174'];
  for (const port of ports) assert.match(port, /^\d{4,5}$/);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-start-failures-config', XDG_CACHE_HOME: '/tmp/lang-lessons-start-failures-cache' } });
  try {
    for (const port of ports) for (const test of cases) {
      const origin = `http://127.0.0.1:${port}`;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        const transport = await installBrowserTransport(context, origin, { sessionFailure: { error: privateDetail, failure: test.failure } });
        transport.sessionStatus = 502;
        const page = await context.newPage(); const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const entering = page.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/session/enter');
        await page.goto(`${origin}/#/verb-visible`, { waitUntil: 'networkidle' });
        const { session } = await (await entering).json();
        await page.getByRole('heading', { name: 'Verb practice', level: 1, exact: true }).waitFor();
        const exercise = page.locator('.verbs-lesson');
        assert.equal(await exercise.getAttribute('data-verb'), 'be', 'Deterministic fixture selects the authored be prompt');
        const draft = page.getByRole('textbox', { name: 'Past', exact: true });
        await draft.fill('was'); await draft.press('Enter');
        await exercise.locator('.ll-correct').first().waitFor(); await draft.blur();
        const start = page.locator('header').getByRole('button', { name: 'Start tutor', exact: true });
        await page.waitForFunction(() => [...document.querySelectorAll('header button')].some(button => button.getAttribute('aria-label') === 'Start tutor' && !button.disabled));
        assert.equal(await start.isEnabled(), true);
        assert.equal(transport.sessionRequests, 0, 'Readiness never creates a provider session');
        assert.equal((await inspectTransport(page)).mediaCalls, 0, 'Readiness never requests a microphone');
        const writtenBefore = await savedWrittenProgress(page, session.sessionId);
        assert.equal(writtenBefore.drafts.past, 'was');
        assert.equal(writtenBefore.records.find(record => record.form === 'past')?.finalized, true);
        const acceptedBefore = await exercise.locator('.ll-correct').count();
        const exerciseBefore = await exercise.getAttribute('data-exercise');
        await start.click();
        const notice = page.locator('.voice-call-error');
        await notice.getByText(test.message, { exact: true }).waitFor();
        await page.waitForTimeout(1200);
        assert.equal(transport.sessionRequests, 1, 'A failed explicit start is never retried automatically');
        assert.equal(transport.releaseRequests, 0, 'A rejected session has no fabricated release token');
        const media = await inspectTransport(page);
        assert.equal(media.mediaCalls, 1);
        assert.equal(media.tracks.length, 1); assert.ok(media.tracks.every(track => track.stopped));
        assert.equal(media.peers.length, 1); assert.ok(media.peers.every(peer => peer.closed && peer.channel === 'closed'));
        assert.equal(await start.isEnabled(), true, 'Another attempt requires an explicit learner action');
        assert.equal(await draft.inputValue(), 'was');
        assert.equal(await exercise.getAttribute('data-exercise'), exerciseBefore);
        assert.equal(await exercise.locator('.ll-correct').count(), acceptedBefore);
        assert.deepEqual(await savedWrittenProgress(page, session.sessionId), writtenBefore, 'Connection failure preserves the complete written snapshot');
        assert.doesNotMatch(await page.locator('body').innerText(), /private-start-detail|provider body and secret|<img src=x/);
        assert.equal(await page.evaluate(() => Boolean(window.__unsafeVoiceStart)), false);
        assert.equal(transport.externalRequests.length, 0); assert.deepEqual(errors, []);
        if (port === ports[0] && test.name === 'credits-exhausted') {
          await page.evaluate(() => {
            const banner = document.createElement('aside'); banner.textContent = 'Browser test: simulated failure; no microphone or provider';
            banner.setAttribute('role', 'note'); banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:8px;background:#fff3cd;color:#4d3a00;font:12px system-ui;text-align:center';
            document.body.append(banner);
          });
          await page.screenshot({ path: '/tmp/lang-lessons-safe-voice-start-failure.png', fullPage: true });
        }
        console.log(JSON.stringify({ status: 'passed', port, case: test.name,
          evidence: 'actual Chromium rendering; mocked account, readiness, session rejection, microphone and WebRTC; no real provider',
          checks: ['static failure message', 'ready phone without media or session', 'one explicit start without automatic retries', 'tracks and peer released', 'written progress preserved', 'private body suppressed'], errors: errors.length }));
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
