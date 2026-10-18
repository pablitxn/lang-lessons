const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');
const { installBrowserTransport, inspectTransport } = require('../tests/helpers/browser-transport.cjs');

// Actual application rendering with intercepted media, WebRTC and provider verdicts.
// No physical microphone, live model response or pronunciation evidence is used.
(async () => {
  const port = process.argv[2] || '5174'; assert.match(port, /^\d{4,5}$/);
  const origin = `http://127.0.0.1:${port}`;
  const output = process.env.EVIDENCE_DIR || '/tmp/lang-lessons-written-browser';
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-written-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-written-browser-cache' } });
  const viewports = [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }];
  const answer = 'He buys bread every morning.';
  const typo = 'He bux bread every morning.';
  const tenseLabels = ['Present simple', 'Present continuous', 'Present perfect', 'Present perfect continuous',
    'Past simple', 'Past continuous', 'Past perfect', 'Past perfect continuous'];
  const responseCount = page => page.evaluate(() => window.__voiceTransportFixture.messages.filter(message => message.type === 'response.create').length);

  async function chooseTense(page, label) {
    await page.getByRole('combobox', { name: 'Verb tense', exact: true }).click();
    await page.getByRole('listbox').getByRole('option', { name: label, exact: true }).click();
    await page.getByRole('listbox').waitFor({ state: 'hidden' });
  }

  async function installHintFixture(context) {
    const requests = []; const waiters = [];
    await context.route(`${origin}/api/realtime/sentence-hint`, async route => {
      const request = route.request();
      assert.equal(request.method(), 'POST');
      const body = request.postDataJSON(); assert.equal(body.helpEnabled, true);
      let reply;
      const response = new Promise(resolve => { reply = resolve; });
      requests.push({ ...body, reply });
      waiters.splice(0).forEach(resolve => resolve());
      const result = await response;
      await route.fulfill({ status: result.status, json: result.status === 200 ? { hint: result.hint } : { error: 'Injected hint service failure.' } }).catch(() => {});
    });
    return {
      requests,
      async waitForCount(count) {
        while (requests.length < count) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Expected hint request ${count}; received ${requests.length}`)), 5000);
            waiters.push(() => { clearTimeout(timer); resolve(); });
          });
        }
        return requests[count - 1];
      },
    };
  }

  async function setHelp(page, enabled) {
    await page.getByRole('button', { name: 'Preferences', exact: true }).click();
    await page.getByRole('navigation', { name: 'Preferences sections', exact: true }).getByRole('button', { name: 'Learning', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Offer help after written corrections', exact: true }).setChecked(enabled);
    await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
  }

  async function assessSpeech(page, text, obligations, item) {
    const count = await responseCount(page);
    await page.evaluate(({ text, item }) => {
      const channel = window.__voiceTransportFixture.peers.at(-1).channel;
      const receive = event => channel.onmessage({ data: JSON.stringify(event) });
      receive({ type: 'input_audio_buffer.speech_started', item_id: item });
      receive({ type: 'input_audio_buffer.speech_stopped', item_id: item });
      receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: item, transcript: text });
    }, { text, item });
    await page.waitForFunction(count => window.__voiceTransportFixture.messages.filter(message => message.type === 'response.create').length > count, count);
    await page.evaluate(obligations => {
      const fixture = window.__voiceTransportFixture;
      const requestId = fixture.messages.filter(message => message.type === 'response.create').at(-1).response.metadata.request_id;
      fixture.peers.at(-1).channel.onmessage({ data: JSON.stringify({ type: 'response.done', response: {
        id: `written-smoke-${requestId}`, metadata: { request_id: requestId }, status: 'completed',
        output: [{ type: 'message', content: [{ type: 'text', text: JSON.stringify({ requestId,
          results: obligations.map(obligation => ({ obligation, status: 'accepted', audioClear: true, feedback: 'Injected browser fixture verdict.' })),
          intent: 'practice' }) }] }],
      } }) });
    }, obligations);
  }

  async function assertLayout(page) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'The translation field must not create horizontal overflow');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    assert.equal(await page.evaluate(() => document.querySelector('.ll-exercise').getBoundingClientRect().bottom <= innerHeight), true,
      'The exercise remains reachable at the bottom of the page');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Written practice must reflow at 200% text size');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    assert.equal(await page.evaluate(() => document.querySelector('.ll-exercise').getBoundingClientRect().bottom <= innerHeight), true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; window.scrollTo(0, 0); });
  }

  try {
    for (const viewport of viewports) {
      for (const enabled of [false, true]) {
        const context = await browser.newContext({ viewport, colorScheme: viewport.width === 390 ? 'dark' : 'light' });
        const transport = await installBrowserTransport(context, origin, { enabled });
        const hints = await installHintFixture(context);
        const page = await context.newPage(); const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${origin}/#/sentence`, { waitUntil: 'networkidle' });
        if (enabled) { await page.locator('header').getByRole('button', { name: 'Start tutor', exact: true }).click(); await page.waitForFunction(() => window.__voiceTransportFixture.peers.at(-1)?.channel?.readyState === 'open'); }
        else { await page.locator('header').getByRole('button', { name: 'Start tutor', exact: true }).waitFor(); assert.equal(transport.statusRequests, 0); }
        const lesson = page.locator('.ll-sentences[data-exercise-id]');
        const exerciseId = await lesson.getAttribute('data-exercise-id');
        const field = page.getByRole('textbox', { name: 'English translation', exact: true });
        const written = page.locator('.sentences-written');
        const tense = page.locator('.sentences-tense');
        const tenseChoice = page.getByRole('combobox', { name: 'Verb tense', exact: true });
        const feedback = page.getByRole('status', { name: 'Written translation feedback', exact: true });
        assert.equal(await lesson.locator('.ll-spanish').innerText(), 'Él compra pan cada mañana.');
        assert.equal(await field.isEnabled(), true, 'Written practice remains available with or without voice');
        assert.equal(await page.getByRole('button', { name: 'Check translation', exact: true }).count(), 0, 'Written feedback is automatic without a redundant check button');
        assert.equal(await page.getByRole('button', { name: /^(?:Write|Speak)$/ }).count(), 0, 'Written and spoken practice share the exercise');
        assert.equal(await page.getByRole('button', { name: /pronunciation|sound help/i }).count(), 0);
        assert.equal(await page.getByRole('tooltip').count(), 0);
        assert.equal(await tenseChoice.count(), 0, 'The tense exercise appears only after a matched translation');
        assert.equal(await lesson.locator('.ll-kicker').count(), 0, 'The Spanish cue does not repeat an instruction heading');
        const before = await responseCount(page);

        await field.fill(typo);
        await written.locator('.ll-incorrect').first().waitFor();
        assert.ok(await written.locator('[data-gap]').count(), 'Missing characters are represented by gaps');
        assert.doesNotMatch(await written.innerText(), /He buys bread every morning\./, 'A correction must not reveal the full expected translation');
        assert.doesNotMatch(await written.innerText(), /Phonetics:|Pronunciation/i, 'Written help must not become pronunciation guidance');
        assert.doesNotMatch(await written.innerText(), /Check the highlighted differences\.|Other translations may also be valid\./, 'Static correction instructions must not remain below the error markers');
        assert.equal(await page.getByRole('button', { name: 'Translation hint', exact: true }).count(), 0, 'Help off leaves plain error markers');
        assert.equal(await field.inputValue(), typo, 'Feedback must not replace the learner draft');
        assert.equal(await tenseChoice.count(), 0, 'An unmatched draft must not expose the tense exercise');
        if (viewport.width === 390) await page.screenshot({ path: join(output, `sentence-written-${enabled ? 'call' : 'offline'}-errors.png`), fullPage: true });

        await field.fill(answer); await field.press('Enter');
        await written.locator('.ll-correct').first().waitFor();
        await tenseChoice.waitFor();
        assert.equal(await page.getByRole('listbox').count(), 0);
        await tenseChoice.click();
        const tenseOptions = page.getByRole('listbox');
        await tenseOptions.waitFor({ state: 'visible' });
        assert.equal(await tenseOptions.getByRole('option').count(), 8);
        for (const label of tenseLabels) assert.equal(await tenseOptions.getByRole('option', { name: label, exact: true }).count(), 1);
        assert.equal(await tenseOptions.getByRole('group', { name: 'Present', exact: true }).count(), 1);
        assert.equal(await tenseOptions.getByRole('group', { name: 'Past', exact: true }).count(), 1);
        await tenseChoice.press('Escape'); await tenseOptions.waitFor({ state: 'hidden' });
        assert.equal(await page.getByText('Matches a reference translation.', { exact: true }).count(), 0);
        assert.equal(await tense.getAttribute('data-status'), 'empty');
        await chooseTense(page, 'Past simple');
        assert.equal(await tense.getAttribute('data-status'), 'incorrect');
        assert.equal(await tenseChoice.getAttribute('aria-invalid'), 'true');
        assert.equal(await tenseChoice.getAttribute('data-value'), 'past-simple', 'An incorrect selection remains available to retry');
        await chooseTense(page, 'Present simple');
        assert.equal(await tense.getAttribute('data-status'), 'correct');
        assert.equal(await tenseChoice.getAttribute('aria-invalid'), null);
        assert.equal(await lesson.getAttribute('data-stage'), 'translation', 'Written comparison must not manufacture oral evidence');
        assert.equal(await responseCount(page), before, 'Typing and local checks do not request a voice response');
        assert.equal(await page.getByRole('button', { name: 'Your progress', exact: true }).count(), 0);
        assert.equal(await field.inputValue(), answer);

        // IME confirmation is not an explicit Enter submission.
        await field.fill('');
        await tenseChoice.waitFor({ state: 'detached' });
        assert.equal(await tenseChoice.count(), 0, 'Editing invalidates the earlier tense selection');
        await field.dispatchEvent('compositionstart', { data: '' });
        await field.fill(answer);
        await field.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true });
        await page.waitForTimeout(850);
        assert.equal(await feedback.count(), 0, 'An unfinished IME composition must not show processed feedback');
        await field.dispatchEvent('compositionend', { data: answer });
        await written.locator('.ll-correct').first().waitFor();
        assert.equal(await tenseChoice.getAttribute('data-value'), '', 'A new matched attempt starts with no tense selected');
        assert.equal(await page.getByRole('button', { name: 'Your progress', exact: true }).count(), 0);
        await chooseTense(page, 'Present simple');
        assert.equal(await responseCount(page), before);
        if (viewport.width === 390) await page.screenshot({ path: join(output, `sentence-written-${enabled ? 'call' : 'offline'}-tense.png`), fullPage: true });

        if (enabled) {
          // Keep the text field focused while the independent oral turn is assessed.
          await field.focus();
          await assessSpeech(page, answer, ['translation'], 'written-smoke-translation');
          await page.waitForFunction(() => document.querySelector('.ll-sentences').dataset.stage === 'explanation');
          assert.equal(await field.inputValue(), answer, 'Oral acceptance preserves the written draft');
          assert.equal(await tenseChoice.getAttribute('data-value'), 'present-simple', 'Oral acceptance preserves the independent written tense answer');
          assert.equal(await lesson.getAttribute('data-exercise-id'), exerciseId);
          await assessSpeech(page, 'Present simple: buys agrees with he, and the sentence describes his routine.', ['tense', 'structure', 'meaning-fit'], 'written-smoke-explanation');
          await page.waitForFunction(() => document.querySelector('.ll-sentences').dataset.stage === 'complete');
          assert.equal(await field.inputValue(), answer, 'The independent oral explanation preserves written work');
          assert.equal(await tense.getAttribute('data-status'), 'correct');
          const connection = await inspectTransport(page);
          assert.equal(transport.sessionRequests, 1); assert.equal(connection.mediaCalls, 1);
          assert.equal(connection.peers.length, 1); assert.equal(connection.peers[0].closed, false);
          assert.equal(connection.peers[0].channel, 'open'); assert.equal(connection.tracks[0].stopped, false);
          await field.blur();
        } else {
          assert.equal(transport.sessionRequests, 0);
          assert.equal((await inspectTransport(page)).mediaCalls, 0);
        }

        await assertLayout(page);
        await page.getByRole('button', { name: enabled ? 'Next exercise' : 'Next sentence', exact: true }).click();
        await page.waitForFunction(id => document.querySelector('.ll-sentences').dataset.exerciseId !== id, exerciseId);
        assert.equal(await field.inputValue(), '', 'Changing the exercise clears its old written draft');
        assert.equal(await feedback.count(), 0, 'Changing the exercise clears its old written feedback');
        assert.equal(await tenseChoice.count(), 0, 'Changing the exercise clears its old tense answer');
        assert.equal(await lesson.getAttribute('data-stage'), 'translation');
        assert.equal(transport.sessionRequests, enabled ? 1 : 0);
        assert.equal(hints.requests.length, 0, 'Global help off prevents written-hint requests');
        assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
        console.log(JSON.stringify({ status: 'passed', viewport, voice: enabled ? 'mocked active call' : 'disabled service',
          checks: ['inline input', 'automatic feedback without a check button', 'Enter finalization', 'local error markers', 'no answer disclosure', 'local tense retry and correction', 'no invented oral evidence', 'IME', 'draft and tense lifecycle', '200% reflow',
            ...(enabled ? ['independent spoken stages', 'same call'] : ['no voice session or media request'])],
          evidence: 'actual Chromium rendering; injected media and verdicts; no physical microphone or provider' }));
        await context.close();
      }
    }

    {
      const context = await browser.newContext({ viewport: { width: 607, height: 924 }, colorScheme: 'dark' });
      const transport = await installBrowserTransport(context, origin, { enabled: false });
      const hints = await installHintFixture(context);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/#/sentence`, { waitUntil: 'networkidle' });
      await page.locator('header').getByRole('button', { name: 'Start tutor', exact: true }).waitFor();
      await page.getByRole('textbox', { name: 'English translation', exact: true }).fill(answer);
      const choice = page.getByRole('combobox', { name: 'Verb tense', exact: true });
      const listbox = page.getByRole('listbox');
      await choice.waitFor(); await choice.focus();
      await choice.press('ArrowDown'); await listbox.waitFor();
      assert.equal(await choice.getAttribute('aria-expanded'), 'true');
      const firstActive = await choice.getAttribute('aria-activedescendant');
      assert.ok(firstActive);
      await choice.press('ArrowDown');
      assert.notEqual(await choice.getAttribute('aria-activedescendant'), firstActive, 'Arrow navigation changes the active option');
      assert.equal(await choice.getAttribute('data-value'), '', 'Arrow navigation must not commit a tense');
      await choice.press('Escape'); await listbox.waitFor({ state: 'hidden' });
      assert.equal(await choice.getAttribute('data-value'), '');
      assert.equal(await choice.evaluate(element => element === document.activeElement), true, 'Escape returns to the tense combobox');
      await choice.press('Enter'); await listbox.waitFor();
      await choice.press('Home'); await choice.press('ArrowDown'); await choice.press('Enter');
      await listbox.waitFor({ state: 'hidden' });
      assert.equal(await choice.getAttribute('data-value'), 'present-continuous');
      assert.equal(await page.locator('.sentences-tense').getAttribute('data-status'), 'incorrect');
      await choice.press('Enter'); await listbox.waitFor();
      await choice.press('Home'); await choice.press('Enter');
      assert.equal(await choice.getAttribute('data-value'), 'present-simple');
      assert.equal(await page.locator('.sentences-tense').getAttribute('data-status'), 'correct');
      await choice.click(); await listbox.waitFor();
      await choice.press('ArrowDown');
      await page.locator('.ll-cue').click(); await listbox.waitFor({ state: 'hidden' });
      assert.equal(await choice.getAttribute('data-value'), 'present-simple', 'Clicking outside dismisses uncommitted navigation');
      await choice.focus();
      for (const key of 'past perfect') await choice.press(key === ' ' ? 'Space' : key);
      await listbox.waitFor();
      const activeOption = await choice.getAttribute('aria-activedescendant');
      assert.equal(await page.evaluate(id => document.getElementById(id)?.getAttribute('aria-label'), activeOption), 'Past perfect');
      assert.equal(await choice.getAttribute('data-value'), 'present-simple', 'A space in typeahead continues searching without committing');
      await choice.press('Escape'); await listbox.waitFor({ state: 'hidden' });
      await page.setViewportSize({ width: 607, height: 390 });
      await choice.scrollIntoViewIfNeeded(); await choice.click(); await listbox.waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      await listbox.waitFor({ state: 'hidden' });
      assert.equal(await choice.getAttribute('data-value'), 'present-simple', 'Scrolling the trigger out of view dismisses without changing selection');
      assert.equal(transport.sessionRequests, 0); assert.equal(hints.requests.length, 0);
      assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
      console.log(JSON.stringify({ status: 'passed', checks: ['keyboard opens listbox', 'arrow navigation does not commit', 'Escape cancels', 'Enter commits', 'outside click dismisses without changing selection', 'full-label typeahead preserves spaces', 'offscreen trigger dismisses listbox'],
        evidence: 'actual Chromium rendering; disabled-service fixture; no model requests' }));
      await context.close();
    }

    // Tense follows the actual matched wording, even when the curriculum filter differs.
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
      const transport = await installBrowserTransport(context, origin);
      const hints = await installHintFixture(context);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/#/sentence`, { waitUntil: 'networkidle' });
      await page.locator('header').getByRole('button', { name: 'Start tutor', exact: true }).click();
      await page.waitForFunction(() => window.__voiceTransportFixture.peers.at(-1)?.channel?.readyState === 'open');
      const lesson = page.locator('.ll-sentences[data-exercise-id]');
      const previous = await lesson.getAttribute('data-exercise-id');
      await page.getByRole('button', { name: 'Preferences', exact: true }).click();
      await page.getByRole('navigation', { name: 'Preferences sections', exact: true }).getByRole('button', { name: 'Learning', exact: true }).click();
      await page.getByLabel('Grammar difficulty', { exact: true }).selectOption('2');
      await page.getByLabel('Sentence tenses', { exact: true }).selectOption('present-perfect');
      await page.getByRole('button', { name: 'Close preferences', exact: true }).click();
      await page.getByRole('button', { name: 'Next sentence', exact: true }).click();
      await page.waitForFunction(id => document.querySelector('.ll-sentences').dataset.exerciseId !== id, previous);
      assert.equal(await lesson.locator('.ll-spanish').innerText(), 'Vivimos aquí desde 2020.');
      const field = page.getByRole('textbox', { name: 'English translation', exact: true });
      const tense = page.locator('.sentences-tense');
      const choice = page.getByRole('combobox', { name: 'Verb tense', exact: true });
      const before = await responseCount(page);
      await field.fill("We've been living here since 2020.");
      await choice.waitFor();
      await chooseTense(page, 'Present perfect');
      assert.equal(await tense.getAttribute('data-status'), 'incorrect', 'The global curriculum filter must not determine the answer');
      await chooseTense(page, 'Present perfect continuous');
      assert.equal(await tense.getAttribute('data-status'), 'correct');
      await field.fill('We have lived here since 2020.');
      await choice.waitFor({ state: 'detached' });
      assert.equal(await choice.count(), 0);
      await choice.waitFor();
      assert.equal(await choice.getAttribute('data-value'), '');
      await chooseTense(page, 'Present perfect continuous');
      assert.equal(await tense.getAttribute('data-status'), 'incorrect', 'Replacing a translation changes its expected tense');
      await chooseTense(page, 'Present perfect');
      assert.equal(await tense.getAttribute('data-status'), 'correct');
      assert.equal(await lesson.getAttribute('data-stage'), 'translation');
      assert.equal(await page.getByRole('button', { name: 'Your progress', exact: true }).count(), 0);
      assert.equal(await responseCount(page), before); assert.equal(hints.requests.length, 0);
      assert.equal(transport.sessionRequests, 1); assert.equal((await inspectTransport(page)).peers.length, 1);
      assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
      console.log(JSON.stringify({ status: 'passed', checks: ['tense follows matched alternative', 'curriculum filter is not the answer', 'edit resets tense', 'oral evidence unchanged', 'same call', 'no model requests'],
        evidence: 'actual Chromium rendering; injected voice transport; deterministic local tense comparison' }));
      await context.close();
    }

    // Hint races are independent of viewport and use a fully intercepted text endpoint.
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
      const transport = await installBrowserTransport(context, origin, { enabled: false });
      const hints = await installHintFixture(context);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/#/sentence`, { waitUntil: 'networkidle' });
      await page.locator('header').getByRole('button', { name: 'Start tutor', exact: true }).waitFor();
      const lesson = page.locator('.ll-sentences[data-exercise-id]');
      const field = page.getByRole('textbox', { name: 'English translation', exact: true });
      const written = page.locator('.sentences-written');
      const hint = page.getByRole('tooltip');
      const errorTrigger = page.getByRole('button', { name: 'Translation hint', exact: true }).first();
      await setHelp(page, true);

      for (const casing of [answer.toUpperCase(), answer.toLowerCase()]) {
        await field.fill(casing);
        await written.locator('.ll-correct').first().waitFor();
        await page.waitForTimeout(750);
        assert.equal(hints.requests.length, 0, 'Case-only differences match locally without requesting a model');
        assert.equal(await errorTrigger.count(), 0); assert.equal(await hint.count(), 0);
      }

      await field.fill('He buy'); await page.waitForTimeout(200);
      await field.fill('He buy bread'); await page.waitForTimeout(200);
      const draft = 'He buy bread every morning.';
      await field.fill(draft); await page.waitForTimeout(400);
      assert.equal(hints.requests.length, 0, 'A burst of typing must not trigger premature hint requests');
      const first = await hints.waitForCount(1);
      assert.equal(first.draft, draft); assert.equal(first.sentenceId, 'sentence-ps-bread');
      await page.waitForTimeout(100); assert.equal(hints.requests.length, 1, 'Only the finalized draft is sent');
      assert.equal(await hint.count(), 0, 'A generated hint must not create a persistent panel');
      first.reply({ status: 200, hint: 'Revisa la concordancia entre el sujeto y el verbo principal.' });
      await errorTrigger.hover();
      await hint.waitFor();
      await page.getByText('Revisa la concordancia entre el sujeto y el verbo principal.', { exact: true }).waitFor();
      const triggerBox = await errorTrigger.boundingBox(); const hintBox = await hint.boundingBox();
      assert.ok(triggerBox && hintBox);
      const hoverX = triggerBox.x + triggerBox.width / 2;
      await page.mouse.move(hoverX, hintBox.y + hintBox.height + 2, { steps: 12 });
      assert.equal(await hint.isVisible(), true, 'The hint stays open while crossing the space above the error');
      await page.mouse.move(hoverX, hintBox.y + hintBox.height / 2, { steps: 12 });
      assert.equal(await hint.isVisible(), true, 'A pointer can reach the tooltip without dismissing it');
      await page.screenshot({ path: join(output, 'sentence-written-mocked-hint.png'), fullPage: true });
      await page.mouse.move(0, 0); await hint.waitFor({ state: 'hidden' });
      await errorTrigger.focus(); await hint.waitFor();
      await page.keyboard.press('Escape'); await hint.waitFor({ state: 'hidden' });
      assert.equal(await errorTrigger.evaluate(element => element === document.activeElement), true, 'Escape closes help without moving keyboard focus');

      await field.fill('He buys bread morning.');
      assert.equal(await hint.count(), 0, 'Editing immediately hides a hint for the previous draft');
      const second = await hints.waitForCount(2);
      await errorTrigger.hover(); await hint.waitFor();
      const editedAbort = page.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/api/realtime/sentence-hint') && request.postDataJSON().draft === second.draft });
      await field.fill('He buys bread each mornin.');
      assert.equal(await hint.count(), 0, 'Editing immediately hides pending help');
      await editedAbort;
      second.reply({ status: 200, hint: 'Pista anterior a la edición.' });
      const third = await hints.waitForCount(3);
      assert.doesNotMatch(await lesson.innerText(), /Pista anterior a la edición/);
      await errorTrigger.focus(); await hint.waitFor();

      const exerciseId = await lesson.getAttribute('data-exercise-id');
      const nextAbort = page.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/api/realtime/sentence-hint') && request.postDataJSON().draft === third.draft });
      await page.getByRole('button', { name: 'Next sentence', exact: true }).click();
      await nextAbort;
      third.reply({ status: 200, hint: 'Pista anterior al cambio de ejercicio.' });
      await page.waitForFunction(id => document.querySelector('.ll-sentences').dataset.exerciseId !== id, exerciseId);
      assert.equal(await hint.count(), 0); assert.equal(await field.inputValue(), '');
      assert.doesNotMatch(await lesson.innerText(), /Pista anterior/);

      await field.fill('A fresh different draft.');
      const fourth = await hints.waitForCount(4);
      await errorTrigger.focus(); await hint.waitFor();
      const disabledAbort = page.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/api/realtime/sentence-hint') && request.postDataJSON().draft === fourth.draft });
      await setHelp(page, false);
      await disabledAbort;
      fourth.reply({ status: 200, hint: 'Pista anterior a desactivar la ayuda.' });
      assert.equal(await hint.count(), 0);
      assert.equal(await errorTrigger.count(), 0);
      await field.fill('A second different draft.');
      await page.waitForTimeout(850); assert.equal(hints.requests.length, 4, 'Disabling help prevents subsequent requests');
      assert.doesNotMatch(await lesson.innerText(), /Pista anterior/);

      await setHelp(page, true);
      const failed = await hints.waitForCount(5);
      failed.reply({ status: 503 });
      assert.equal(await hint.count(), 0, 'Hint failure is not a persistent error panel');
      await errorTrigger.hover();
      await page.getByText('Hint unavailable right now.', { exact: true }).waitFor();
      assert.equal(await written.getAttribute('data-status'), 'different');
      assert.equal(await field.inputValue(), 'A second different draft.');
      assert.equal(await lesson.getAttribute('data-stage'), 'translation');
      assert.equal(await field.getAttribute('aria-invalid'), null, 'Provider failure must not turn the written field into a learner error');

      // Clicking Next must not finalize the outgoing draft through its blur handler.
      const beforeQuickSkip = await lesson.getAttribute('data-exercise-id');
      await field.fill('A new unprocessed draft to skip.');
      await page.getByRole('button', { name: 'Next sentence', exact: true }).click();
      await page.waitForFunction(id => document.querySelector('.ll-sentences').dataset.exerciseId !== id, beforeQuickSkip);
      await page.waitForTimeout(850);
      assert.equal(hints.requests.length, 5, 'Skipping before the debounce must not dispatch a hint through blur');
      assert.equal(await field.inputValue(), ''); assert.equal(await hint.count(), 0);

      assert.equal(await responseCount(page), 0);
      assert.equal(transport.sessionRequests, 0); assert.equal((await inspectTransport(page)).mediaCalls, 0);
      assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
      console.log(JSON.stringify({ status: 'passed', voice: 'disabled service', checks: ['global hint setting', 'case-insensitive local match', '700ms draft debounce', 'one request per typing burst', 'hover/focus tooltip', 'pointer crosses gap into tooltip', 'pointer-leave and Escape dismissal', 'no persistent hint panel', 'edit abort', 'next abort', 'help-disabled abort', 'stale hint suppression', 'provider failure preserves work', 'skip bypasses blur finalization'],
        evidence: 'actual Chromium rendering; intercepted text endpoint; no real model request' }));
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
      const transport = await installBrowserTransport(context, origin, { enabled: false });
      const hints = await installHintFixture(context);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/#/sentence`, { waitUntil: 'networkidle' });
      await page.locator('header').getByRole('button', { name: 'Start tutor', exact: true }).waitFor();
      await setHelp(page, true);
      await page.getByRole('textbox', { name: 'English translation', exact: true }).fill(typo);
      const request = await hints.waitForCount(1);
      const hint = page.getByRole('tooltip');
      assert.equal(await hint.count(), 0);
      request.reply({ status: 200, hint: 'Revisa el verbo que acompaña al sujeto.' });
      const trigger = page.getByRole('button', { name: 'Translation hint', exact: true }).first();
      await trigger.tap();
      await page.getByText('Revisa el verbo que acompaña al sujeto.', { exact: true }).waitFor();
      await page.screenshot({ path: join(output, 'sentence-written-mobile-tooltip.png'), fullPage: true });
      await page.locator('.ll-cue').tap(); await hint.waitFor({ state: 'hidden' });
      await trigger.tap(); await hint.waitFor();
      await page.getByRole('textbox', { name: 'English translation', exact: true }).fill(answer);
      await hint.waitFor({ state: 'hidden' });
      const tenseChoice = page.getByRole('combobox', { name: 'Verb tense', exact: true });
      const tenseOptions = page.getByRole('listbox');
      await tenseChoice.waitFor(); await tenseChoice.tap(); await tenseOptions.waitFor();
      await page.getByRole('heading', { name: 'Sentence practice', exact: true }).tap(); await tenseOptions.waitFor({ state: 'hidden' });
      assert.equal(await tenseChoice.getAttribute('data-value'), '', 'An outside tap dismisses the tense choices without selecting');
      await tenseChoice.tap();
      await tenseOptions.getByRole('option', { name: 'Present simple', exact: true }).tap();
      await tenseOptions.waitFor({ state: 'hidden' });
      assert.equal(await tenseChoice.getAttribute('data-value'), 'present-simple');
      assert.equal(transport.sessionRequests, 0); assert.equal(hints.requests.length, 1);
      assert.deepEqual(errors, []); assert.deepEqual(transport.externalRequests, []);
      console.log(JSON.stringify({ status: 'passed', checks: ['mobile tap tooltip', 'outside tap dismisses', 'edit closes tooltip', 'mobile tense listbox dismissal and selection'],
        evidence: 'actual Chromium touch emulation; intercepted text endpoint; no physical device or provider' }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
