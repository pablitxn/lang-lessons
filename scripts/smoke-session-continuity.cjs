const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { installBrowserTransport, inspectTransport } = require('../tests/helpers/browser-transport.cjs');

// Shipped routes and IndexedDB in Chromium, with authenticated HTTP fixtures.
// This smoke never starts a microphone, voice transport, or external provider.
const modes = [
  { id: 'verb-image', title: 'Picture', input: 'Past', selector: '.verbs-lesson', attribute: 'data-exercise' },
  { id: 'verb-visible', title: 'Verb', input: 'Past', selector: '.verbs-lesson', attribute: 'data-exercise' },
  { id: 'sentence', title: 'Sentence', input: 'English translation', selector: '.ll-sentences', attribute: 'data-exercise-id' },
];
const legacyActions = /^(Resume session|Finalize session|Start new practice|Check session status|Refresh saved practice)$/;

async function noRecoveryChoices(page) {
  assert.equal(await page.getByRole('button', { name: legacyActions }).count(), 0, 'Written practice opens directly without session choices');
  assert.equal(await page.getByRole('heading', { name: /^(Saved practice|Continue your practice|Continue your last practice|Your last practice)$/ }).count(), 0);
  assert.equal(await page.getByRole('dialog').count(), 0, 'Written navigation never opens an exit confirmation');
}

async function savedDraft(page, mode, sessionId, draft) {
  const handle = await page.waitForFunction(async ({ mode, sessionId, draft }) => {
    const path = '/src/features/progress/written-snapshot-store.ts';
    const { createIndexedDbWrittenSnapshotStore } = await import(path);
    const store = createIndexedDbWrittenSnapshotStore();
    try {
      const snapshot = await store.load({ userId: 'browser-fixture-student', sessionId }, mode);
      return snapshot && (mode === 'sentence' ? snapshot.draft : snapshot.drafts.past) === draft ? snapshot : null;
    } finally { await store.close(); }
  }, { mode, sessionId, draft });
  const snapshot = await handle.jsonValue(); await handle.dispose(); return snapshot;
}

async function lessonReady(page, mode, draft) {
  await page.getByRole('heading', { name: `${mode.title} practice`, exact: true, level: 1 }).waitFor();
  const input = page.getByRole('textbox', { name: mode.input, exact: true });
  await input.waitFor();
  if (draft !== undefined) assert.equal(await input.inputValue(), draft);
  await noRecoveryChoices(page);
  return input;
}

function assertIdentity(actual, expected) {
  assert.deepEqual(actual.identity, expected.identity, 'Automatic restore retains canonical session and exercise identity');
  for (const field of ['kind', 'sentenceId', 'verbId', 'photoSrc']) assert.equal(actual[field], expected[field], `Automatic restore retains ${field}`);
}

(async () => {
  const ports = process.argv.slice(2).length ? process.argv.slice(2) : ['5174'];
  for (const port of ports) assert.match(port, /^\d{4,5}$/);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-continuity-config', XDG_CACHE_HOME: '/tmp/lang-lessons-continuity-cache' } });
  try {
    for (const port of ports) {
      const origin = `http://127.0.0.1:${port}`;
      for (const viewport of [{ width: 390, height: 844 }, { width: 705, height: 924 }]) for (const mode of modes) {
        const context = await browser.newContext({ viewport });
        const transport = await installBrowserTransport(context, origin, { enabled: false, recoveryEnabled: true });
        const page = await context.newPage(); const errors = []; const payloads = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) payloads.push(request.postData() ?? ''); });
        const entering = page.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/session/enter');
        await page.goto(`${origin}/#/${mode.id}`, { waitUntil: 'networkidle' });
        const { session } = await (await entering).json();
        assert.equal(session.mode, mode.id);
        const input = await lessonReady(page, mode);
        const untouched = await savedDraft(page, mode.id, session.sessionId, '');
        const untouchedReload = page.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/session/enter');
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal((await (await untouchedReload).json()).session.sessionId, session.sessionId);
        await lessonReady(page, mode, '');
        assertIdentity(await savedDraft(page, mode.id, session.sessionId, ''), untouched);
        await page.getByRole('link', { name: 'All lessons', exact: true }).click();
        await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor(); await noRecoveryChoices(page);
        const untouchedReturn = page.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/session/enter');
        await page.getByRole('link', { name: `Start ${mode.title} practice`, exact: true }).click();
        assert.equal((await (await untouchedReturn).json()).session.sessionId, session.sessionId);
        await lessonReady(page, mode, '');
        assertIdentity(await savedDraft(page, mode.id, session.sessionId, ''), untouched);
        const draft = `private unfinished ${mode.id} ${viewport.width}`;
        await input.fill(draft);
        const before = await savedDraft(page, mode.id, session.sessionId, draft);
        assert.equal(await page.locator(mode.selector).getAttribute(mode.attribute), before.identity.exerciseId);
        assert.equal((await inspectTransport(page)).mediaCalls, 0);

        const reloadEntry = page.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/session/enter');
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal((await (await reloadEntry).json()).session.sessionId, session.sessionId);
        await lessonReady(page, mode, draft);
        assertIdentity(await savedDraft(page, mode.id, session.sessionId, draft), before);
        assert.equal(await page.locator(mode.selector).getAttribute(mode.attribute), before.identity.exerciseId);
        assert.equal((await inspectTransport(page)).mediaCalls, 0);

        await page.getByRole('link', { name: 'All lessons', exact: true }).click();
        await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor();
        await noRecoveryChoices(page);
        const returnEntry = page.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/session/enter');
        await page.getByRole('link', { name: `Start ${mode.title} practice`, exact: true }).click();
        assert.equal((await (await returnEntry).json()).session.sessionId, session.sessionId);
        await lessonReady(page, mode, draft);
        assertIdentity(await savedDraft(page, mode.id, session.sessionId, draft), before);
        assert.equal(await page.locator(mode.selector).getAttribute(mode.attribute), before.identity.exerciseId);
        assert.equal(transport.learningCalls.includes('/api/learning/session/confirm-close'), false);
        assert.equal(transport.learningCalls.includes('/api/learning/session/start-call'), false);
        assert.equal(transport.learningCalls.includes('/api/learning/session/create'), false);
        assert.equal(payloads.some(payload => payload.includes(draft)), false, 'Private drafts remain local while progress uses content-free events');
        assert.equal(transport.sessionRequests, 0); assert.equal((await inspectTransport(page)).mediaCalls, 0);
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
        console.log(JSON.stringify({ status: 'passed', port, mode: mode.id, viewport, evidence: 'actual Chromium routes/IndexedDB; mocked authenticated server; no microphone/provider', checks: ['direct lesson entry', 'untouched exercise after reload and home return', 'draft after reload', 'draft after home and reentry', 'stable session/exercise/photo', 'no manual recovery or text exit confirmation', 'local-only draft'] }));
        await context.close();
      }

      // Switching lesson types selects that mode's saved work without showing
      // historical-session choices. Backend tests own the global pointer race.
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const transport = await installBrowserTransport(context, origin, { enabled: false, recoveryEnabled: true });
      const page = await context.newPage(); const errors = []; const saved = new Map();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin, { waitUntil: 'networkidle' });
      for (const mode of modes) {
        const entering = page.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/session/enter');
        await page.getByRole('link', { name: `Start ${mode.title} practice`, exact: true }).click();
        const { session } = await (await entering).json();
        await lessonReady(page, mode); const draft = '';
        saved.set(mode.id, { draft, snapshot: await savedDraft(page, mode.id, session.sessionId, draft) });
        await page.getByRole('link', { name: 'All lessons', exact: true }).click();
        await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor(); await noRecoveryChoices(page);
      }
      for (const stage of ['untouched', 'written']) for (const mode of [...modes].reverse()) {
        const entering = page.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/session/enter');
        await page.getByRole('link', { name: `Start ${mode.title} practice`, exact: true }).click();
        const { session } = await (await entering).json(); const previous = saved.get(mode.id);
        assert.equal(session.sessionId, previous.snapshot.identity.sessionId);
        const input = await lessonReady(page, mode, previous.draft);
        assertIdentity(await savedDraft(page, mode.id, session.sessionId, previous.draft), previous.snapshot);
        if (stage === 'untouched') {
          const draft = `saved mode draft ${mode.id}`; await input.fill(draft);
          saved.set(mode.id, { draft, snapshot: await savedDraft(page, mode.id, session.sessionId, draft) });
        }
        await page.getByRole('link', { name: 'All lessons', exact: true }).click();
        await page.getByRole('heading', { name: 'Choose a lesson', exact: true }).waitFor(); await noRecoveryChoices(page);
      }
      assert.equal(transport.learningCalls.includes('/api/learning/session/confirm-close'), false);
      assert.equal(transport.learningCalls.includes('/api/learning/session/start-call'), false);
      assert.equal(transport.sessionRequests, 0); assert.equal((await inspectTransport(page)).mediaCalls, 0);
      assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
      console.log(JSON.stringify({ status: 'passed', port, evidence: 'actual Chromium routes/IndexedDB; mocked authenticated server; no microphone/provider', checks: ['Picture/Verb/Sentence round trip', 'untouched exercises survive mode switching', 'independent saved mode drafts', 'stable identities on return', 'no session lists or exit confirmation'] }));
      await context.close();

      // A different tab may end the restored call and move the global pointer.
      // The old lesson must not adopt another session's call controls.
      const historical = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const historicalTransport = await installBrowserTransport(historical, origin);
      const historicalPage = await historical.newPage(); const historicalErrors = [];
      historicalPage.on('pageerror', error => historicalErrors.push(error.message));
      const firstEntry = historicalPage.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/session/enter');
      await historicalPage.goto(`${origin}/#/verb-image`, { waitUntil: 'networkidle' });
      const historicalSession = (await (await firstEntry).json()).session;
      await lessonReady(historicalPage, modes[0]);
      await historical.route('**/api/learning/session/enter', route => route.fulfill({ json: { session: historicalSession, callState: 'active' } }));
      await historical.route('**/api/learning/session/current', route => route.fulfill({ json: {
        session: { sessionId: 'fixture-other-tab-session', mode: 'sentence', status: 'open', revision: 1 }, callState: 'active',
      } }));
      await historicalPage.reload({ waitUntil: 'networkidle' });
      await historicalPage.getByRole('button', { name: 'Stop tutor', exact: true }).waitFor();
      await historicalPage.getByRole('button', { name: 'Check call status', exact: true }).click();
      await historicalPage.getByRole('button', { name: 'Start tutor', exact: true }).waitFor();
      assert.equal(await historicalPage.getByRole('button', { name: 'Stop tutor', exact: true }).count(), 0);
      assert.equal(historicalTransport.learningCalls.includes('/api/learning/session/reconcile'), false, 'Read-only status cannot end another session');
      assert.equal(historicalTransport.sessionRequests, 0); assert.equal((await inspectTransport(historicalPage)).mediaCalls, 0);
      assert.deepEqual(historicalErrors, []); assert.deepEqual(historicalTransport.externalRequests, []);
      console.log(JSON.stringify({ status: 'passed', port, evidence: 'actual Chromium with a simulated cross-tab current session change; no microphone/provider', checks: ['restored call status stays scoped to mounted session', 'no controls adopted from another active session', 'read-only refresh'] }));
      await historical.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
