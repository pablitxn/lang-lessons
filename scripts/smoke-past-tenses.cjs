const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');
const { installBrowserTransport } = require('../tests/helpers/browser-transport.cjs');
const authored = require('../content/en-wp-03/sentences.json');

// Actual production UI and protocol with explicit injected media/provider verdicts.
// Every non-loopback request is aborted by the shared fixture boundary.
(async () => {
  const port = process.argv[2] || '5187'; assert.match(port, /^\d{4,5}$/);
  const output = process.env.EVIDENCE_DIR || '/tmp/en-wp08-browser'; mkdirSync(output, { recursive: true });
  const origin = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/en-wp08-browser-config', XDG_CACHE_HOME: '/tmp/en-wp08-browser-cache' } });
  async function assess(page, text, obligations, item) {
    const count = await page.evaluate(() => window.__voiceTransportFixture.messages.filter(m => m.type === 'response.create').length);
    await page.evaluate(({ text, item }) => {
      const channel = window.__voiceTransportFixture.peers.at(-1).channel;
      const receive = event => channel.onmessage({ data: JSON.stringify(event) });
      receive({ type: 'input_audio_buffer.speech_started', item_id: item });
      receive({ type: 'input_audio_buffer.speech_stopped', item_id: item });
      receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: item, transcript: text });
    }, { text, item });
    await page.waitForFunction(count => window.__voiceTransportFixture.messages.filter(m => m.type === 'response.create').length > count, count);
    await page.evaluate(obligations => {
      const fixture = window.__voiceTransportFixture;
      const requestId = fixture.messages.filter(m => m.type === 'response.create').at(-1).response.metadata.request_id;
      fixture.peers.at(-1).channel.onmessage({ data: JSON.stringify({ type: 'response.done', response: {
        id: `response-${requestId}`, metadata: { request_id: requestId }, status: 'completed',
        output: [{ type: 'message', content: [{ type: 'text', text: JSON.stringify({ requestId,
          results: obligations.map(obligation => ({ obligation, status: 'accepted', audioClear: true, feedback: 'Injected browser fixture verdict.' })), intent: 'practice' }) }] }],
      } }) });
    }, obligations);
  }
  try {
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1024, height: 768 }]) {
      for (const tense of authored.scope) {
        const choice = tense.replaceAll('_', '-');
        const expected = authored.sentences.find(s => s.difficulty.grammar === 1 && s.difficulty.vocabulary === 1 && s.accepted_examples.some(a => a.tense === tense));
        const context = await browser.newContext({ viewport }); const transport = await installBrowserTransport(context, origin);
        const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(origin, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Preferences', exact: true }).click();
        await page.getByRole('navigation', { name: 'Preferences sections' }).getByRole('button', { name: 'Learning', exact: true }).click();
        const selector = page.getByLabel('Sentence tenses', { exact: true });
        assert.equal(await selector.locator('option').count(), 9);
        await selector.selectOption(choice);
        if (tense === 'past_perfect_continuous' && viewport.width === 390) await page.screenshot({ path: join(output, 'preferences-past-perfect-continuous.png'), fullPage: true });
        await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lang-lessons.account-settings.v1:browser-fixture-student')).settings.sentenceTense), choice);
        await page.getByRole('link', { name: 'Start Sentence practice', exact: true }).click();
        await page.locator('header').getByRole('button', { name: 'Start tutor', exact: true }).click();
        await page.waitForFunction(() => window.__voiceTransportFixture.peers.at(-1)?.channel?.readyState === 'open');
        const lesson = page.locator('.ll-sentences[data-exercise-id]'); const identity = await lesson.getAttribute('data-exercise-id');
        assert.equal(await lesson.locator('.ll-spanish').innerText(), expected.prompt_es);
        assert.equal(await page.getByRole('button', { name: 'Preferences', exact: true }).isEnabled(), true);
        assert.equal(await page.getByRole('button', { name: 'Next sentence', exact: true }).innerText(), '→');
        const dock = page.locator('footer.ll-dock[aria-label="Lesson tools"]');
        assert.equal(await dock.getByRole('button', { name: 'Your progress', exact: true }).count(), 0);
        assert.equal(await dock.getByRole('button', { name: 'Reference table', exact: true }).count(), 0);
        assert.equal(transport.sessionRequests, 1);
        if (tense === 'past_perfect_continuous' && viewport.width === 390) await page.screenshot({ path: join(output, 'sentence-past-perfect-continuous.png'), fullPage: true });
        await assess(page, expected.accepted_examples[0].text, ['translation'], 'translation-audio');
        await page.waitForFunction(() => document.querySelector('.ll-sentences').dataset.stage === 'explanation');
        assert.equal(await lesson.getAttribute('data-exercise-id'), identity);
        // Changing a preference must not replace accepted translation or its explanation stage.
        const nextTense = choice === 'past-simple' ? 'present-simple' : 'past-simple';
        await page.getByRole('button', { name: 'Preferences', exact: true }).click();
        await page.getByRole('navigation', { name: 'Preferences sections' }).getByRole('button', { name: 'Learning', exact: true }).click();
        await page.getByLabel('Sentence tenses', { exact: true }).selectOption(nextTense);
        await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
        assert.equal(await lesson.getAttribute('data-exercise-id'), identity); assert.equal(await lesson.getAttribute('data-stage'), 'explanation');
        await assess(page, expected.accepted_examples[0].structure, ['tense', 'structure', 'meaning-fit'], 'explanation-audio');
        await page.getByRole('button', { name: 'Next exercise', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Next exercise', exact: true }).innerText(), '→');
        await page.getByRole('button', { name: 'Next exercise', exact: true }).click();
        await page.waitForFunction(id => document.querySelector('.ll-sentences').dataset.exerciseId !== id, identity);
        const next = authored.sentences.find(s => s.difficulty.grammar === 1 && s.difficulty.vocabulary === 1 && s.accepted_examples.some(a => a.tense.replaceAll('_', '-') === nextTense));
        assert.equal(await lesson.locator('.ll-spanish').innerText(), next.prompt_es);
        assert.equal(await lesson.getAttribute('data-stage'), 'translation');
        assert.equal(transport.sessionRequests, 1, 'Preference and exercise changes keep one continuous session');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
        console.log(JSON.stringify({ status: 'passed', tense: choice, viewport, checks: ['persisted selection', 'no pre-translation spoilers', 'translation/explanation', 'tools home-only', 'preference preserves progress', 'next prompt applies selection', 'same call'], evidence: 'actual Chromium; injected media and verdicts only' }));
        await context.close();
      }
    }
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1024, height: 768 }]) {
      for (const tense of authored.scope.filter(tense => tense.startsWith('past_'))) {
        const choice = tense.replaceAll('_', '-');
        const expected = authored.sentences.find(s => s.difficulty.grammar === 1 && s.difficulty.vocabulary === 1 && s.accepted_examples.some(a => a.tense === tense));
        const context = await browser.newContext({ viewport });
        const transport = await installBrowserTransport(context, origin, { enabled: false });
        const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(`${origin}/#/sentence`, { waitUntil: 'networkidle' });
        const badge = page.getByRole('button', { name: 'Voice unavailable', exact: true });
        await badge.waitFor();
        assert.ok(transport.statusRequests >= 1); assert.equal(await badge.isDisabled(), true);
        const lesson = page.locator('.ll-sentences[data-exercise-id]'); const before = await lesson.getAttribute('data-exercise-id');
        await page.getByRole('button', { name: 'Preferences', exact: true }).click();
        await page.getByRole('navigation', { name: 'Preferences sections' }).getByRole('button', { name: 'Learning', exact: true }).click();
        await page.getByLabel('Sentence tenses', { exact: true }).selectOption(choice);
        await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
        assert.equal(await lesson.getAttribute('data-exercise-id'), before);
        const next = page.getByRole('button', { name: 'Next sentence', exact: true });
        assert.equal(await next.innerText(), '→'); await next.click();
        await page.waitForFunction(id => document.querySelector('.ll-sentences').dataset.exerciseId !== id, before);
        assert.equal(await lesson.locator('.ll-spanish').innerText(), expected.prompt_es);
        assert.equal(await page.locator('.voice-call-bar').count(), 0);
        assert.doesNotMatch(await lesson.innerText(), /Voice is unavailable/);
        const dock = page.locator('footer.ll-dock[aria-label="Lesson tools"]');
        assert.equal(await dock.getByRole('button', { name: 'Your progress', exact: true }).count(), 0);
        assert.equal(await dock.getByRole('button', { name: 'Reference table', exact: true }).count(), 0);
        assert.match(await page.locator('.voice-call-error').innerText(), /Voice is unavailable right now\. You can keep practicing here\./);
        assert.equal(await page.getByRole('button', { name: 'Unmute microphone', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Start tutor', exact: true }).count(), 0);
        assert.equal(await page.getByRole('dialog', { name: 'Voice call details', exact: true }).count(), 0);
        assert.equal(transport.learningCalls.includes('/api/learning/session/start-call'), false);
        assert.equal(transport.sessionRequests, 0); assert.deepEqual(transport.externalRequests, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
        if (tense === 'past_perfect_continuous' && viewport.width === 390) await page.screenshot({ path: join(output, 'sentence-offline-compact.png'), fullPage: true });
        console.log(JSON.stringify({ status: 'passed', tense: choice, viewport, checks: ['offline arrow navigation', 'sentence-only prompt', 'disabled header call button', 'no lesson tools', 'no paid request'], evidence: 'actual Chromium; disabled-service fixture' }));
        await context.close();
      }
    }
    // The shared eight-tense reference is available only from home.
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const transport = await installBrowserTransport(context, origin);
      const page = await context.newPage(); await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Reference table', exact: true }).click();
      const guide = page.getByRole('dialog', { name: 'Reference', exact: true });
      assert.equal(await guide.locator('tbody tr').count(), 8);
      for (const label of ['Past simple', 'Past continuous', 'Past perfect', 'Past perfect continuous']) {
        assert.equal(await guide.getByRole('rowheader', { name: label, exact: true }).count(), 1);
      }
      await page.getByRole('button', { name: 'Close table', exact: true }).click();
      assert.equal(transport.sessionRequests, 0); assert.deepEqual(transport.externalRequests, []);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
