const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');
const { installBrowserTransport, inspectTransport } = require('../tests/helpers/browser-transport.cjs');
const english = require('../content/en-wp-03/sentences.json').sentences;
const french = require('../content/fr/sentences.json').sentences;

// Actual shipped UI and local recovery; all authenticated HTTP is simulated.
// The shared boundary aborts external traffic. No database, provider or microphone.
const tenses = {
  en: ['present-simple', 'present-continuous', 'present-perfect', 'present-perfect-continuous',
    'past-simple', 'past-continuous', 'past-perfect', 'past-perfect-continuous',
    'future-simple', 'future-going-to', 'future-continuous', 'future-perfect', 'future-perfect-continuous'],
  fr: ['fr-present', 'fr-passe-compose', 'fr-imparfait', 'fr-futur-proche', 'fr-futur-simple', 'fr-conditionnel-present',
    'fr-passe-recent', 'fr-plus-que-parfait', 'fr-futur-anterieur'],
};
const newTenses = new Set([...tenses.en.slice(8), ...tenses.fr.slice(6)]);
const userId = 'browser-fixture-student';
const accountKey = `lang-lessons.account-settings.v1:${userId}`;

async function installWrittenSession(context, origin, language) {
  const transport = await installBrowserTransport(context, origin, { enabled: false, settings: {
    schemaVersion: 1, learningLanguage: language, theme: 'system', helpEnabled: false, untimedHelp: false,
    difficulty: { grammar: 1, vocabulary: 1 }, preferredMode: 'sentence', sentenceTense: 'all',
  } });
  const sessionId = `tense-expansion-${language}`;
  const session = { sessionId, language, mode: 'sentence', status: 'open', revision: 0 };
  let entered = false; let journalRevision = 0; let sequence = 0;
  const failures = []; const events = []; const receipts = new Map(); const instances = new Map();
  await context.route(/\/api\/learning\/(?:session(?:\/|\?|$)|recovery(?:\?|$)|progress(?:\?|$)|usage\/|instance\/issue)/, async route => {
    try {
      const request = route.request(); const url = new URL(request.url());
      assert.equal(url.origin, origin);
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      let result;
      switch (url.pathname) {
        case '/api/learning/session/enter':
          assert.equal(body.language, language); assert.equal(body.mode, 'sentence'); entered = true;
          result = { session, callState: 'none' }; break;
        case '/api/learning/session/current': result = entered ? { session, callState: 'none' } : null; break;
        case '/api/learning/session': result = session; break;
        case '/api/learning/session/history': result = { sessionId, hadConnectedCall: false }; break;
        case '/api/learning/recovery': result = { session, progress: { sessionId, journalRevision }, activeSegments: [], feedback: null }; break;
        case '/api/learning/usage/open': result = { streamId: `tense-stream-${++sequence}` }; break;
        case '/api/learning/usage/written': result = { eventId: body.eventId, sequence: body.sequence, intervalId: null, observedAt: new Date().toISOString(), status: 'recorded' }; break;
        case '/api/learning/instance/issue':
          result = instances.get(body.operationId) ?? { sessionId, exerciseId: `tense-instance-${++sequence}`, generation: 0 };
          instances.set(body.operationId, result); break;
        case '/api/learning/progress': {
          assert.ok(Array.isArray(body));
          const acknowledgments = body.map(event => {
            assert.equal(event.ref.sessionId, sessionId); events.push(event);
            const previous = receipts.get(event.eventId);
            if (previous) return { ...previous, status: 'duplicate' };
            const receipt = { eventId: event.eventId, status: 'accepted', committedRevision: ++journalRevision };
            receipts.set(event.eventId, receipt); return receipt;
          });
          result = { status: 'committed', acknowledgments, current: { sessionId, journalRevision } }; break;
        }
        default: throw new Error(`Unexpected written-only endpoint ${url.pathname}`);
      }
      await route.fulfill({ status: 200, json: result });
    } catch (error) { failures.push(error.message); await route.fulfill({ status: 500, json: { error: 'Fixture failure' } }); }
  });
  return { transport, sessionId, failures, events };
}

async function savedPractice(page, sessionId, expectedDraft, expectedTense = null, expectedExerciseId = null) {
  const handle = await page.waitForFunction(async ({ sessionId, expectedDraft, expectedTense, expectedExerciseId, userId }) => new Promise(resolve => {
    const request = indexedDB.open('lang-lessons.written-snapshots.v1', 1);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('snapshots')) { database.close(); resolve(null); return; }
      const tx = database.transaction('snapshots');
      const read = tx.objectStore('snapshots').get([userId, sessionId, 'sentence']);
      read.onsuccess = () => {
        const value = read.result;
        resolve(value?.draft === expectedDraft && value.selectedTense === expectedTense
          && (expectedExerciseId === null || value.identity.exerciseId === expectedExerciseId) ? value : null);
      };
      tx.oncomplete = tx.onabort = () => database.close();
    };
  }), { sessionId, expectedDraft, expectedTense, expectedExerciseId, userId });
  const result = await handle.jsonValue(); await handle.dispose(); return result;
}

(async () => {
  const port = process.argv[2] || '5187'; assert.match(port, /^\d{4,5}$/);
  const origin = `http://127.0.0.1:${port}`;
  const output = process.env.EVIDENCE_DIR || '/tmp/lang-lessons-tense-expansion'; mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/tense-expansion-browser-config', XDG_CACHE_HOME: '/tmp/tense-expansion-browser-cache' } });
  try {
    for (const width of [390, 1024]) for (const language of ['en', 'fr']) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const fixture = await installWrittenSession(context, origin, language);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const input = page.getByRole('textbox', { name: language === 'fr' ? 'Traducción al francés' : 'English translation', exact: true });
      const chooser = page.getByRole('combobox', { name: language === 'fr' ? 'Tiempo verbal' : 'Verb tense', exact: true });
      const next = page.getByRole('button', { name: language === 'fr' ? 'Siguiente frase' : 'Next sentence', exact: true });
      try {
        await page.goto(`${origin}/#/sentence`, { waitUntil: 'networkidle' }); await input.waitFor();
        for (const tense of tenses[language]) {
          await page.getByRole('button', { name: 'Preferences', exact: true }).click();
          await page.getByRole('button', { name: 'Learning', exact: true }).click();
          const filter = page.getByRole('combobox', { name: 'Sentence tenses', exact: true });
          const options = await filter.locator('option').evaluateAll(items => items.map(item => ({ value: item.value, label: item.textContent })));
          assert.deepEqual(options.map(item => item.value), ['all', ...tenses[language]]);
          await filter.selectOption(tense);
          await page.waitForFunction(({ key, tense }) => {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value?.settings.sentenceTense === tense && value.dirty.length === 0;
          }, { key: accountKey, tense });
          await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
          const previousExerciseId = await page.locator('.ll-sentences').getAttribute('data-exercise-id');
          await next.click();
          await page.waitForFunction(previous => document.querySelector('.ll-sentences')?.getAttribute('data-exercise-id') !== previous, previousExerciseId);
          const expectedExerciseId = await page.locator('.ll-sentences').getAttribute('data-exercise-id');
          const saved = await savedPractice(page, fixture.sessionId, '', null, expectedExerciseId);
          const entry = (language === 'fr' ? french : english).find(item => item.id === saved.sentenceId);
          assert.ok(entry);
          const alternatives = language === 'fr' ? entry.alternatives : entry.accepted_examples.map(item => ({ ...item, tense: item.tense.replaceAll('_', '-') }));
          const answer = alternatives.find(item => item.tense === tense); assert.ok(answer);
          assert.equal(await input.getAttribute('lang'), language);
          await input.fill(answer.text); await input.press('Enter');
          await page.locator('.sentences-written[data-status="matched"]').waitFor();
          await chooser.click();
          const list = page.getByRole('listbox');
          assert.equal(await list.getByRole('option').count(), tenses[language].length);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          if (language === 'en' && tense === 'future-perfect-continuous') {
            await chooser.press('End');
            assert.equal(await list.locator('[data-active="true"]').getAttribute('data-tense-index'), '12');
            await chooser.press('ArrowLeft');
            assert.equal(await list.locator('[data-active="true"]').getAttribute('data-tense-index'), '7', 'The fifth Future row clamps to the fourth Past row');
            await chooser.press('ArrowRight');
            assert.equal(await list.locator('[data-active="true"]').getAttribute('data-tense-index'), '11');
            await chooser.press('ArrowDown');
            assert.equal(await list.locator('[data-active="true"]').getAttribute('data-tense-index'), '12');
            await page.screenshot({ path: join(output, `future-picker-${width}.png`), fullPage: true });
          } else {
            await chooser.press('Home');
            for (let step = 0; step < tenses[language].indexOf(tense); step++) await chooser.press('ArrowDown');
          }
          await chooser.press('Enter');
          assert.equal(await chooser.getAttribute('data-value'), tense);
          await page.locator('.sentences-tense[data-status="correct"]').waitFor();
          const recognized = await savedPractice(page, fixture.sessionId, answer.text, tense);
          if (newTenses.has(tense)) {
            await page.reload({ waitUntil: 'networkidle' }); await input.waitFor();
            assert.equal(await input.inputValue(), answer.text);
            assert.equal(await chooser.getAttribute('data-value'), tense);
            const restored = await savedPractice(page, fixture.sessionId, answer.text, tense);
            assert.deepEqual(restored.identity, recognized.identity);
            assert.equal(restored.sentenceId, recognized.sentenceId);
            assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).settings.sentenceTense, accountKey), tense);
          }
        }
        assert.deepEqual(errors, []); assert.deepEqual(fixture.failures, []);
        assert.deepEqual(fixture.transport.externalRequests, []); assert.equal(fixture.transport.sessionRequests, 0);
        assert.equal((await inspectTransport(page)).mediaCalls, 0);
        assert.ok(fixture.events.every(event => event.source === 'typed'));
        console.log(JSON.stringify({ status: 'passed', language, width, tenses: tenses[language].length,
          scripts: await page.locator('script[src]').evaluateAll(items => items.map(item => new URL(item.src).pathname)),
          evidence: 'actual Chromium; simulated authenticated HTTP; no provider/audio/database',
          checks: ['every filter selects matching content', 'all tense choices reachable by keyboard', 'new construction drafts and selected tenses survive reload', 'no cross-language choices', 'no external requests'] }));
      } catch (error) {
        await page.screenshot({ path: join(output, `failure-${language}-${width}.png`), fullPage: true });
        throw new Error(`${language}/${width}: ${error.message}; fixture=${JSON.stringify(fixture.failures)}; errors=${JSON.stringify(errors)}`, { cause: error });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
