const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { installBrowserTransport, inspectTransport } = require('../tests/helpers/browser-transport.cjs');

// Actual shipped routes, rendering and IndexedDB; authenticated HTTP is a fixture.
// No physical microphone, paid hint, provider request or production account is used.
const userId = 'browser-fixture-student';
const accountKey = `lang-lessons.account-settings.v1:${userId}`;
const modes = ['verb-image', 'verb-visible', 'sentence'];
const languageLabels = { en: 'English practice', fr: 'Práctica de francés' };
const defaults = { schemaVersion: 1, learningLanguage: 'en', theme: 'system', helpEnabled: false, untimedHelp: false,
  difficulty: { grammar: 1, vocabulary: 1 }, preferredMode: 'verb-image', sentenceTense: 'all' };
const frenchVerbs = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/fr/verbs.json'), 'utf8')).verbs;
const frenchSentences = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/fr/sentences.json'), 'utf8')).sentences;
const frenchPhotos = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/fr/asset-ledger.json'), 'utf8')).assets;
const frenchTenses = ['fr-present', 'fr-passe-compose', 'fr-imparfait', 'fr-futur-proche', 'fr-futur-simple', 'fr-conditionnel-present'];
const loadedScripts = page => page.locator('script[src]').evaluateAll(scripts => scripts.map(script => new URL(script.src).pathname));

async function installLanguageSessions(context, origin, options = {}) {
  const transport = await installBrowserTransport(context, origin, { enabled: options.enabled ?? false, settings: { ...defaults, ...options.settings } });
  const sessions = new Map(); const operations = new Map(); const receipts = new Map();
  const entries = []; const calls = []; const progress = []; const failures = [];
  let current = null; let sequence = 0;
  const snapshot = row => ({ sessionId: row.id, mode: row.mode, language: row.language, status: 'open', revision: row.revision });
  await context.route(/\/api\/learning\/(?:session(?:\/|\?|$)|recovery(?:\?|$)|progress(?:\?|$)|usage\/|instance\/issue|open-sessions)/, async route => {
    try {
      const request = route.request(); const url = new URL(request.url());
      assert.equal(url.origin, origin);
      calls.push(url.pathname);
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      const sessionId = body?.sessionId ?? body?.segment?.sessionId ?? url.searchParams.get('sessionId');
      const row = sessions.get(sessionId);
      let result;
      if (url.pathname === '/api/learning/session/enter') {
        assert.ok(modes.includes(body.mode)); assert.ok(['en', 'fr'].includes(body.language));
        entries.push({ ...body });
        const selected = [...sessions.values()].find(value => value.mode === body.mode && value.language === body.language)
          ?? { id: `french-smoke-${body.language}-${body.mode}-${++sequence}`, mode: body.mode, language: body.language, journal: 0, revision: 0, epoch: 0, activeCall: false };
        sessions.set(selected.id, selected); current = selected;
        result = { session: snapshot(selected), callState: selected.activeCall ? 'active' : 'none' };
      } else if (url.pathname === '/api/learning/session/current') result = current ? { session: snapshot(current), callState: current.activeCall ? 'active' : 'none' } : null;
      else if (url.pathname === '/api/learning/open-sessions') result = { items: [...sessions.values()].map(snapshot), nextCursor: null };
      else if (url.pathname === '/api/learning/usage/written') result = { eventId: body.eventId, sequence: body.sequence, intervalId: null, observedAt: new Date().toISOString(), status: 'recorded' };
      else {
        assert.ok(row, `Unknown canonical session at ${url.pathname}`);
        if (url.pathname === '/api/learning/session') result = snapshot(row);
        else if (url.pathname === '/api/learning/session/start-call') {
          assert.equal(options.enabled, true, 'A written-only case cannot allocate a tutor call');
          assert.equal(body.expectedRevision, row.revision); row.revision++; row.epoch++; row.activeCall = true;
          result = { session: snapshot(row), segment: { sessionId, segmentId: `french-segment-${++sequence}`, connectionEpoch: row.epoch } };
        } else if (url.pathname === '/api/learning/session/stop-call') {
          assert.equal(body.expectedRevision, row.revision); row.revision++; row.activeCall = false; result = snapshot(row);
        } else if (url.pathname === '/api/learning/session/reconcile') {
          row.activeCall = false; result = { sessionId, status: 'reconciled' };
        } else if (url.pathname === '/api/learning/usage/client-call') result = { status: 'recorded' };
        else if (url.pathname === '/api/learning/recovery') result = { session: snapshot(row), progress: { sessionId, journalRevision: row.journal }, activeSegments: [], feedback: null };
        else if (url.pathname === '/api/learning/session/history') result = { sessionId, hadConnectedCall: false };
        else if (url.pathname === '/api/learning/usage/open') result = { streamId: `french-stream-${++sequence}` };
        else if (url.pathname === '/api/learning/instance/issue') {
          result = operations.get(body.operationId) ?? { sessionId, exerciseId: `french-instance-${++sequence}`, generation: 0 };
          operations.set(body.operationId, result);
        } else if (url.pathname === '/api/learning/progress') {
          assert.ok(Array.isArray(body));
          const acknowledgments = body.map(event => {
            assert.equal(event.ref.sessionId, sessionId); progress.push({ language: row.language, event });
            const previous = receipts.get(event.eventId);
            if (previous) return { ...previous, status: 'duplicate' };
            const receipt = { eventId: event.eventId, status: 'accepted', committedRevision: ++row.journal };
            receipts.set(event.eventId, receipt); return receipt;
          });
          result = { status: 'committed', acknowledgments, current: { sessionId, journalRevision: row.journal } };
        } else throw new Error(`Written-only smoke attempted ${url.pathname}`);
      }
      await route.fulfill({ status: 200, json: result });
    } catch (error) { failures.push(error.message); console.error(`Session fixture failure: ${error.message}`); await route.fulfill({ status: 500, json: { error: 'Fixture failure' } }); }
  });
  return { transport, entries, calls, sessions, progress, failures };
}

async function storedSnapshot(page, sessionId, mode, expectedDraft, field) {
  const handle = await page.waitForFunction(async ({ sessionId, mode, expectedDraft, field, userId }) => {
    return new Promise(resolve => {
      const request = indexedDB.open('lang-lessons.written-snapshots.v1', 1);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('snapshots')) { database.close(); resolve(null); return; }
        const tx = database.transaction('snapshots'); const read = tx.objectStore('snapshots').get([userId, sessionId, mode]);
        read.onsuccess = () => {
          const value = read.result;
          resolve(value && (expectedDraft === null || (mode === 'sentence' ? value.draft : value.drafts[field]) === expectedDraft) ? value : null);
        };
        tx.oncomplete = tx.onabort = () => database.close();
      };
    });
  }, { sessionId, mode, expectedDraft, field, userId });
  const value = await handle.jsonValue(); await handle.dispose(); return value;
}

function inputFor(page, mode, language) {
  return page.getByRole('textbox', { name: mode === 'sentence'
    ? language === 'fr' ? 'Traducción al francés' : 'English translation'
    : language === 'fr' ? 'Presente — je (sin el pronombre)' : 'Past', exact: true });
}
async function settingsSettled(page, language) {
  await page.waitForFunction(({ key, language }) => {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value?.settings.learningLanguage === language && value.dirty.length === 0;
  }, { key: accountKey, language });
}
async function chooseLanguage(page, language) {
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Learning', exact: true }).click();
  await page.getByRole('combobox', { name: 'Idioma de aprendizaje', exact: true }).selectOption(language);
  await settingsSettled(page, language);
  await page.getByRole('dialog', { name: 'Preferences', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
  await page.getByText(languageLabels[language], { exact: true }).waitFor();
}
async function enter(page, origin, mode, language) {
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/learning/session/enter');
  await page.locator(`a[href="#/${mode}"]`).click();
  const { session } = await (await response).json();
  assert.equal(session.language, language); assert.equal(session.mode, mode);
  try { await inputFor(page, mode, language).waitFor(); }
  catch (error) {
    await page.screenshot({ path: `/tmp/lang-lessons-french-failure-${language}-${mode}.png`, fullPage: true });
    throw new Error(`Lesson did not render ${language}/${mode}: ${await page.locator('body').innerText()}`, { cause: error });
  }
  return session;
}
async function home(page) {
  await page.getByRole('link', { name: 'All lessons', exact: true }).click();
  await page.locator('.lesson-catalog').waitFor();
}
function sameSaved(actual, previous) {
  for (const key of ['identity', 'kind', 'verbId', 'sentenceId', 'photoSrc', 'drafts', 'draft']) {
    assert.deepEqual(actual[key], previous[key], `Returning to a language preserves ${key}`);
  }
}
async function validPhoto(page, origin) {
  const image = page.locator('img.verbs-picture'); await image.waitFor();
  const value = await image.evaluate(async element => { await element.decode(); return { width: element.naturalWidth, height: element.naturalHeight, src: element.src, alt: element.alt }; });
  assert.ok(value.width > 0 && value.height > 0); assert.equal(new URL(value.src).origin, origin); assert.ok(value.alt.trim());
  return value;
}
async function verifyQuiet(page, state, errors) {
  assert.deepEqual(state.failures, []); assert.deepEqual(errors, []);
  assert.deepEqual(state.transport.externalRequests, []); assert.equal(state.transport.sessionRequests, 0);
  assert.equal((await inspectTransport(page)).mediaCalls, 0);
  assert.equal(state.calls.some(call => /start-call|confirm-close|\/create$/.test(call)), false);
}

async function frenchContentPractice(page, state, origin) {
  for (const tense of frenchTenses) {
    await page.getByRole('button', { name: 'Preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Learning', exact: true }).click();
    const choices = await page.getByRole('combobox', { name: 'Sentence tenses', exact: true }).locator('option').evaluateAll(options => options.map(option => option.value));
    assert.deepEqual(choices, ['all', ...frenchTenses], 'French settings contain the six authored French constructions');
    await page.getByRole('combobox', { name: 'Sentence tenses', exact: true }).selectOption(tense);
    await settingsSettled(page, 'fr');
    await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente frase', exact: true }).click();
    const current = [...state.sessions.values()].find(value => value.mode === 'sentence' && value.language === 'fr');
    const saved = await storedSnapshot(page, current.id, 'sentence', '', null);
    const sentence = frenchSentences.find(value => value.id === saved.sentenceId);
    assert.ok(sentence); assert.equal(sentence.alternatives[0].tense, tense);
    const input = inputFor(page, 'sentence', 'fr');
    assert.equal(await input.getAttribute('lang'), 'fr');
    await input.fill(sentence.alternatives[0].text); await input.press('Enter');
    await page.locator('.sentences-written[data-status="matched"]').waitFor();
    const chooser = page.getByRole('combobox', { name: 'Tiempo verbal', exact: true });
    await chooser.click();
    assert.equal(await page.getByRole('listbox', { name: 'Opciones de tiempo verbal', exact: true }).getByRole('option').count(), 6);
    await chooser.press('Home');
    for (let step = 0; step < frenchTenses.indexOf(tense); step++) await chooser.press('ArrowDown');
    await chooser.press('Enter');
    assert.equal(await chooser.getAttribute('data-value'), tense);
    await page.getByText('Tiempo correcto.', { exact: true }).waitFor();
    await storedSnapshot(page, current.id, 'sentence', sentence.alternatives[0].text, null);
  }
  await home(page);
  const session = await enter(page, origin, 'verb-image', 'fr');
  const original = await storedSnapshot(page, session.sessionId, 'verb-image', '', 'present');
  const verb = frenchVerbs.find(value => value.id === original.verbId); assert.ok(verb);
  const labels = { infinitive: 'Infinitivo', present: 'Presente — je (sin el pronombre)', participle: 'Participio pasado' };
  const accented = Object.entries(verb.forms).find(([, guidance]) => /[àâéèêëîïôùûüç]/u.test(guidance.accepted[0]));
  assert.ok(accented, 'The deterministic first French verb exercises significant accents');
  const [accentForm, guidance] = accented;
  const accentedInput = page.getByRole('textbox', { name: labels[accentForm], exact: true });
  await accentedInput.fill(guidance.accepted[0].normalize('NFD').replace(/\p{Mark}/gu, '')); await accentedInput.press('Enter');
  await page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-invalid') === 'true', await accentedInput.getAttribute('id'));
  for (const form of ['infinitive', 'present', 'participle']) {
    const input = page.getByRole('textbox', { name: labels[form], exact: true });
    assert.equal(await input.getAttribute('lang'), 'fr');
    await input.fill(verb.forms[form].accepted[0]); await input.press('Enter');
  }
  const dictionary = page.getByRole('region', { name: 'Diccionario de la imagen completada', exact: true });
  await dictionary.waitFor();
  await dictionary.getByRole('heading', { name: verb.lemma, exact: true }).waitFor();
  assert.ok((await dictionary.locator('.dictionary-definition').allTextContents()).some(text => text.trim()));
  assert.equal(await page.getByText('No hay contenido de diccionario para este verbo.', { exact: true }).count(), 0);
  await dictionary.getByRole('button', { name: 'Siguiente imagen', exact: true }).click();
  await page.waitForFunction(id => document.querySelector('.verbs-lesson')?.getAttribute('data-verb') !== id, verb.id);
  await validPhoto(page, origin);
  await page.getByRole('button', { name: 'Imagen anterior', exact: true }).click();
  await page.waitForFunction(id => document.querySelector('.verbs-lesson')?.getAttribute('data-verb') === id, verb.id);
  assert.equal(new URL((await validPhoto(page, origin)).src).pathname, original.photoSrc);
  assert.equal(await inputFor(page, 'verb-image', 'fr').inputValue(), verb.forms.present.accepted[0], 'Previous image retains typed practice');
  const sources = [...new Set(frenchPhotos.map(photo => photo.src))];
  const decoded = await page.evaluate(async sources => {
    const results = [];
    for (const src of sources) { const image = new Image(); image.src = src; await image.decode(); results.push({ src, width: image.naturalWidth, height: image.naturalHeight }); }
    return results;
  }, sources);
  assert.ok(decoded.every(image => image.width > 0 && image.height > 0));
  assert.equal(new Set(frenchPhotos.map(photo => photo.content_id)).size, 25);
  return { verbCount: frenchVerbs.length, tenseCount: frenchTenses.length, decodedPhotoCount: decoded.length };
}

async function activeCallLanguageSwitch(browser, origin, port) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const state = await installLanguageSessions(context, origin, { enabled: true });
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin, { waitUntil: 'networkidle' }); await settingsSettled(page, 'en');
    const session = await enter(page, origin, 'verb-visible', 'en');
    const draft = 'preserve while confirming';
    await inputFor(page, 'verb-visible', 'en').fill(draft);
    await storedSnapshot(page, session.sessionId, 'verb-visible', draft, 'past');
    const connected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/realtime/session');
    await page.getByRole('button', { name: 'Start tutor', exact: true }).click();
    await connected;
    await page.waitForFunction(() => window.__voiceTransportFixture.peers.some(peer => peer.connectionState === 'connected'));
    await page.getByRole('button', { name: 'Stop tutor', exact: true }).waitFor();
    assert.equal(state.transport.sessionRequests, 1);
    async function requestFrench() {
      await page.getByRole('button', { name: 'Preferences', exact: true }).click();
      await page.getByRole('button', { name: 'Learning', exact: true }).click();
      await page.getByRole('combobox', { name: 'Idioma de aprendizaje', exact: true }).selectOption('fr');
      await page.getByRole('dialog', { name: 'End your call and leave?', exact: true }).waitFor();
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).settings.learningLanguage, accountKey), 'en', 'Pending confirmation cannot commit the new language');
    }
    await requestFrench();
    await page.getByRole('button', { name: 'Keep practicing', exact: true }).click();
    await inputFor(page, 'verb-visible', 'en').waitFor();
    assert.equal(await inputFor(page, 'verb-visible', 'en').inputValue(), draft);
    assert.equal(state.transport.releaseRequests, 0, 'Cancel preserves the active tutor call');
    await page.getByRole('button', { name: 'Stop tutor', exact: true }).waitFor();
    await requestFrench();
    await page.getByRole('button', { name: 'Leave session', exact: true }).click();
    await settingsSettled(page, 'fr');
    await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
    await page.locator('.lesson-catalog').waitFor();
    assert.equal(state.transport.releaseRequests, 1, 'Confirmation ends exactly the active tutor transport');
    assert.equal(state.calls.filter(call => call === '/api/learning/session/stop-call').length, 1);
    const media = await inspectTransport(page);
    assert.equal(media.mediaCalls, 1); assert.ok(media.tracks.every(track => track.stopped));
    const french = await enter(page, origin, 'verb-visible', 'fr'); assert.notEqual(french.sessionId, session.sessionId);
    await home(page); await chooseLanguage(page, 'en');
    const returned = await enter(page, origin, 'verb-visible', 'en'); assert.equal(returned.sessionId, session.sessionId);
    assert.equal(await inputFor(page, 'verb-visible', 'en').inputValue(), draft);
    assert.deepEqual(state.failures, []); assert.deepEqual(errors, []); assert.deepEqual(state.transport.externalRequests, []);
    console.log(JSON.stringify({ status: 'passed', port, scripts: await loadedScripts(page), evidence: 'actual Chromium with simulated media/WebRTC and authenticated HTTP; no physical microphone/provider',
      checks: ['active-call language change waits for confirmation', 'cancel preserves English draft and call', 'confirm saves draft and closes exactly one transport', 'French session remains separate', 'English draft restores after return'] }));
  } catch (error) {
    await page.screenshot({ path: '/tmp/lang-lessons-french-call-switch-failure.png', fullPage: true });
    throw new Error(`Active-call language switch failed: body=${await page.locator('body').innerText()} fixture=${JSON.stringify(state.failures)} calls=${JSON.stringify(state.calls)} release=${state.transport.releaseRequests}`, { cause: error });
  } finally { await context.close(); }
}

(async () => {
  const ports = process.argv.slice(2).length ? process.argv.slice(2) : ['5184'];
  for (const port of ports) assert.match(port, /^\d{4,5}$/);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-french-config', XDG_CACHE_HOME: '/tmp/lang-lessons-french-cache' } });
  try {
    for (const port of ports) {
      const origin = `http://127.0.0.1:${port}`;
      for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }]) {
        const context = await browser.newContext({ viewport });
        const state = await installLanguageSessions(context, origin);
        const page = await context.newPage(); const errors = []; const payloads = []; const saved = new Map();
        page.on('pageerror', error => { errors.push(error.message); console.error(`Browser error: ${error.message}`); });
        page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) payloads.push(request.postData() ?? ''); });
        await page.goto(origin, { waitUntil: 'networkidle' }); await settingsSettled(page, 'en');
        for (const language of ['en', 'fr']) {
          if (language === 'fr') await chooseLanguage(page, 'fr');
          for (const mode of modes) {
            const session = await enter(page, origin, mode, language);
            const field = language === 'fr' ? 'present' : 'past';
            const before = await storedSnapshot(page, session.sessionId, mode, '', field);
            assert.equal((before.verbId ?? before.sentenceId).startsWith('fr-'), language === 'fr');
            if (mode === 'verb-image') {
              const photo = await validPhoto(page, origin);
              await page.getByRole('button', { name: language === 'fr' ? 'Ampliar imagen' : 'Expand picture', exact: true }).click();
              await page.getByRole('button', { name: language === 'fr' ? 'Cerrar imagen ampliada' : 'Close expanded picture', exact: true }).click();
              assert.equal((await validPhoto(page, origin)).src, photo.src, 'Opening and closing the photograph never rerolls it');
              sameSaved(await storedSnapshot(page, session.sessionId, mode, '', field), before);
            }
            const draft = `private ${language} ${mode} draft ${viewport.width}`;
            await inputFor(page, mode, language).fill(draft);
            const snapshot = await storedSnapshot(page, session.sessionId, mode, draft, field);
            saved.set(`${language}:${mode}`, { session, snapshot, draft, field });
            await home(page);
          }
        }
        assert.equal(state.sessions.size, 6, 'Each language has a separate canonical session for every lesson mode');
        for (const language of ['en', 'fr', 'en']) {
          await chooseLanguage(page, language);
          for (const mode of [...modes].reverse()) {
            const previous = saved.get(`${language}:${mode}`);
            const session = await enter(page, origin, mode, language);
            assert.equal(session.sessionId, previous.session.sessionId);
            assert.equal(await inputFor(page, mode, language).inputValue(), previous.draft);
            sameSaved(await storedSnapshot(page, session.sessionId, mode, previous.draft, previous.field), previous.snapshot);
            if (mode === 'verb-image') await validPhoto(page, origin);
            await home(page);
          }
        }
        // A switch made inside a lesson uses the root save/exit lifecycle.
        const active = await enter(page, origin, 'verb-image', 'en');
        await chooseLanguage(page, 'fr'); await page.locator('.lesson-catalog').waitFor();
        const french = await enter(page, origin, 'verb-image', 'fr');
        assert.notEqual(active.sessionId, french.sessionId);
        const entryCount = state.entries.length;
        await page.reload({ waitUntil: 'networkidle' });
        await inputFor(page, 'verb-image', 'fr').waitFor();
        assert.deepEqual(state.entries.slice(entryCount).map(entry => entry.language), ['fr'], 'Direct French hash reload never enters a transient English session');
        const previous = saved.get('fr:verb-image');
        sameSaved(await storedSnapshot(page, french.sessionId, 'verb-image', previous.draft, previous.field), previous.snapshot);
        await validPhoto(page, origin);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false, 'French practice fits the viewport');
        assert.equal(payloads.some(payload => /private (?:en|fr) .+ draft/.test(payload)), false, 'Private typed drafts never enter server requests');
        await verifyQuiet(page, state, errors);
        if (process.env.FRENCH_SMOKE_SCREENSHOTS) {
          fs.mkdirSync(process.env.FRENCH_SMOKE_SCREENSHOTS, { recursive: true });
          await page.screenshot({ path: path.join(process.env.FRENCH_SMOKE_SCREENSHOTS, `french-picture-${viewport.width}-${port}.png`), fullPage: true });
        }
        console.log(JSON.stringify({ status: 'passed', port, viewport, scripts: await loadedScripts(page), evidence: 'actual Chromium routes/IndexedDB; mocked authenticated server; no microphone/provider',
          checks: ['persistent language selector', 'six distinct language/mode sessions', 'repeated English/French round trips', 'unchanged drafts/photos/identity', 'active lesson language switch', 'French direct hash reload without English allocation', 'decoded local photographs', 'no horizontal overflow', 'local-only drafts'] }));
        await context.close();
      }
      // Start with a server-only French preference and empty device storage.
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const state = await installLanguageSessions(context, origin, { settings: { learningLanguage: 'fr' } });
      const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/#/sentence`, { waitUntil: 'networkidle' });
      try { await inputFor(page, 'sentence', 'fr').waitFor({ timeout: 10000 }); }
      catch (error) {
        await page.screenshot({ path: '/tmp/lang-lessons-french-fresh-hydration-failure.png', fullPage: true });
        throw new Error(`Fresh French preference hydration failed: entries=${JSON.stringify(state.entries)} body=${await page.locator('body').innerText()} errors=${errors.join('; ')}`, { cause: error });
      }
      assert.deepEqual(state.entries.map(entry => entry.language), ['fr'], 'Authoritative French hydration precedes direct lesson entry');
      const content = await frenchContentPractice(page, state, origin);
      await verifyQuiet(page, state, errors);
      console.log(JSON.stringify({ status: 'passed', port, scripts: await loadedScripts(page), evidence: 'actual Chromium with server-only French preferences; HTTP fixture', ...content,
        checks: ['fresh-device French direct-link hydration', 'six French tense filters and accepted translations', 'six-choice keyboard tense picker', 'accent-sensitive spelling', 'French dictionary after written completion', 'previous picture retains photograph and writing', 'every authored French photograph decodes'] }));
      await context.close();
      await activeCallLanguageSwitch(browser, origin, port);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
