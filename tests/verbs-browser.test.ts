import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('both verb lessons render real images and enforce their shared-controller gate in Chromium', { skip: process.env.VERBS_BROWSER !== '1', timeout: 90000 }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5193;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', data => { log += String(data); });
  server.stderr.on('data', data => { log += String(data); });
  // Optional environment-supplied browser types are not a new repository dependency.
  let browser: any;
  try {
    for (let count = 0; count < 100 && !log.includes('Local:'); count++) {
      assert.equal(server.exitCode, null, log);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match(log, /Local:/);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
      env: { ...process.env, XDG_CONFIG_HOME: '/tmp/lang-lessons-browser-config', XDG_CACHE_HOME: '/tmp/lang-lessons-browser-cache' } });
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      for (const mode of ['image', 'visible']) {
        const context: any = await browser.newContext({ viewport, hasTouch: viewport.width < 600, reducedMotion: 'reduce' });
        await context.addInitScript(() => { Math.random = () => 0; });
        const page: any = await context.newPage();
        const errors: string[] = []; const external: string[] = [];
        const writingRequests: unknown[] = [];
        await page.route('**/api/realtime/verb-writing', async (route: any) => {
          writingRequests.push(route.request().postDataJSON());
          await route.fulfill({ status: 200, json: { status: 'correct', correctedSentence: null,
            explanation: 'La frase usa am, una forma del verbo be, de manera natural.' } });
        });
        page.on('pageerror', (error: Error) => errors.push(error.message));
        page.on('request', (request: { url(): string }) => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`)) external.push(request.url()); });
        // Freeze before navigation; a cross-process Date.now() + 10ms can expire in transit.
        await page.clock.install({ time: new Date('2026-10-16T12:00:00Z') });
        await page.clock.pauseAt(new Date('2026-10-16T13:00:00Z'));
        await page.goto(`http://127.0.0.1:${port}/src/features/verbs/__fixtures__/preview.html?mode=${mode}`, { waitUntil: 'networkidle' });
        const lesson = page.locator('.verbs-lesson');
        await lesson.waitFor();
        const original = await lesson.getAttribute('data-exercise');
        assert.equal(await lesson.getAttribute('data-verb'), 'be');
        assert.equal(await lesson.getByRole('region', { name: 'Coach response' }).count(), 0);
        assert.equal(await lesson.getByRole('textbox', { name: 'Ask your coach a question' }).count(), 0);
        assert.equal(await lesson.getByRole('region', { name: 'Your progress' }).count(), 0);
        assert.equal(await lesson.getByRole('button', { name: /^Check / }).count(), 0);
        assert.equal(await lesson.getByRole('button', { name: 'Give me a hint', exact: true }).count(), 0);
        assert.equal(await lesson.locator('.picture-dictionary').count(), 0, 'Dictionary content is hidden before accepted writing');
        assert.equal(await lesson.getByRole('button', { name: 'Escribe otros ejemplos', exact: true }).count(), 0, 'Optional sentence practice is hidden before the written forms pass');
        assert.equal(writingRequests.length, 0);
        if (mode === 'image') assert.equal(await lesson.getByRole('button', { name: 'Previous image', exact: true }).isDisabled(), true);
        else assert.equal(await lesson.getByRole('button', { name: 'Previous word', exact: true }).count(), 0);
        assert.doesNotMatch(await lesson.innerText(), /Mock|simulated|microphone or provider requests/);
        await page.getByRole('button', { name: 'Send uncertain fixture', exact: true }).click();
        await lesson.locator('.verbs-clarification').filter({ hasText: /Please say it again/ }).waitFor();
        assert.equal(await page.getByTestId('observations').getAttribute('data-submissions'), '0');

        assert.equal(await page.getByRole('textbox', { name: 'Base form', exact: true }).count(), mode === 'image' ? 1 : 0);
        if (mode === 'image') {
          assert.equal(await lesson.locator('.ll-cue img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), true);
          const selectedPhoto = await lesson.locator('.ll-cue img').getAttribute('src');
          assert.match(selectedPhoto, /\.jpg$/);
          const picture = lesson.locator('.verbs-picture');
          const geometry = await picture.evaluate((image: HTMLImageElement) => ({
            naturalRatio: image.naturalWidth / image.naturalHeight,
            renderedRatio: image.clientWidth / image.clientHeight,
            width: image.getBoundingClientRect().width,
            frameWidth: image.closest('figure')!.getBoundingClientRect().width,
          }));
          assert.ok(Math.abs(geometry.naturalRatio - geometry.renderedRatio) < .02, 'The complete photograph keeps its natural aspect ratio');
          assert.ok(Math.abs(geometry.width - geometry.frameWidth) < 1, 'The frame hugs the photograph without empty gutters');
          const photoBounds = await picture.boundingBox();
          for (const name of ['Previous image', 'Next image']) {
            const bounds = await lesson.getByRole('button', { name, exact: true }).boundingBox();
            assert.ok(bounds.x >= photoBounds.x && bounds.x + bounds.width <= photoBounds.x + photoBounds.width
              && bounds.y >= photoBounds.y && bounds.y + bounds.height <= photoBounds.y + photoBounds.height, 'Navigation sits inside the photograph');
          }
          const expand = lesson.getByRole('button', { name: 'Expand picture', exact: true });
          assert.equal(await expand.evaluate((button: HTMLElement) => getComputedStyle(button).opacity), '0');
          if (viewport.width < 600) await picture.tap(); else {
            await picture.hover();
            await page.clock.runFor(200);
            assert.equal(await expand.evaluate((button: HTMLElement) => getComputedStyle(button).opacity), '0', 'Hovering the photograph does not reveal controls');
            await expand.hover();
          }
          await page.clock.runFor(200);
          assert.equal(await expand.evaluate((button: HTMLElement) => getComputedStyle(button).opacity), '1');
          await expand.click();
          const enlarged = page.getByRole('dialog', { name: 'Expanded picture', exact: true });
          await enlarged.waitFor();
          const expandedBounds = await enlarged.boundingBox();
          assert.equal(expandedBounds.width, viewport.width);
          assert.equal(expandedBounds.height, viewport.height);
          assert.equal(await enlarged.locator('img').getAttribute('src'), selectedPhoto);
          await page.keyboard.press('Tab');
          assert.equal(await enlarged.evaluate((dialog: HTMLDialogElement) => dialog.contains(document.activeElement)), true, 'Focus remains in the modal');
          await page.keyboard.press('Escape');
          await enlarged.waitFor({ state: 'hidden' });
          assert.equal(await expand.evaluate((button: HTMLElement) => document.activeElement === button), true);
          assert.equal(await page.evaluate(() => document.body.style.overflow), '');
          await page.keyboard.press('Enter');
          await enlarged.waitFor();
          await page.getByRole('button', { name: 'Close expanded picture', exact: true }).click();
          await enlarged.waitFor({ state: 'hidden' });
          await page.keyboard.press('Tab');
          assert.equal(await lesson.getByRole('button', { name: 'Picture information', exact: true })
            .evaluate((button: HTMLElement) => document.activeElement === button), true, 'Keyboard navigation resumes at the next photo control');
          await page.keyboard.press('Escape');
          await page.locator('h1').click();
          assert.equal(await lesson.locator('.verbs-photo-context').count(), 0);
          assert.equal(await lesson.locator('.verbs-photo-credit').count(), 0);
          const information = lesson.getByRole('button', { name: 'Picture information', exact: true });
          await information.hover();
          await lesson.getByRole('tooltip').waitFor();
          assert.equal(await lesson.getByRole('tooltip').innerText(), 'The sea asks only for your presence.');
          assert.equal(await lesson.getByRole('tooltip').getAttribute('lang'), 'en');
          await lesson.getByRole('tooltip').hover();
          assert.equal(await lesson.getByRole('tooltip').isVisible(), true);
          const tooltipBounds = await lesson.getByRole('tooltip').boundingBox();
          assert.ok(tooltipBounds.x >= 0 && tooltipBounds.x + tooltipBounds.width <= viewport.width);
          await page.mouse.move(0, 0);
          await lesson.getByRole('tooltip').waitFor({ state: 'hidden' });
          await information.focus();
          await lesson.getByRole('tooltip').waitFor();
          await page.keyboard.press('Escape');
          await lesson.getByRole('tooltip').waitFor({ state: 'hidden' });
          if (viewport.width < 600) {
            await information.tap();
            await lesson.getByRole('tooltip').waitFor();
            await page.locator('h1').tap();
            await lesson.getByRole('tooltip').waitFor({ state: 'hidden' });
          }
          assert.equal(await lesson.locator('.ll-cue img').getAttribute('src'), selectedPhoto);
          assert.equal(await lesson.getAttribute('data-exercise'), original);
          const base = page.getByRole('textbox', { name: 'Base form', exact: true });
          await base.fill('zzzz');
          await page.clock.runFor(600);
          assert.equal(await page.locator('.ll-spelling').count(), 0);
          await page.clock.runFor(200);
          await page.locator('.ll-incorrect').first().waitFor();
          assert.equal(await page.getByRole('button', { name: 'Sound help for Base form', exact: true }).count(), 0);
          await page.getByLabel('Enable sound help', { exact: true }).check();
          const soundHelp = page.getByRole('button', { name: 'Sound help for Base form', exact: true });
          await soundHelp.waitFor();
          const nextField = page.getByRole('textbox', { name: 'Past', exact: true });
          const nextFieldBefore = await nextField.evaluate((input: HTMLElement) => input.getBoundingClientRect().top + window.scrollY);
          if (viewport.width < 600) await soundHelp.tap(); else await soundHelp.hover();
          const soundTooltip = page.getByRole('tooltip');
          await soundTooltip.waitFor();
          assert.match(await soundTooltip.innerText(), /Phonetics/);
          assert.equal(await nextField.evaluate((input: HTMLElement) => input.getBoundingClientRect().top + window.scrollY), nextFieldBefore, 'Sound help overlays rather than moving the fields');
          assert.equal(await base.inputValue(), 'zzzz');
          assert.equal(await base.evaluate((input: HTMLElement) => getComputedStyle(input.closest('.ll-field')!.querySelector('.ll-field-status')!).position), 'absolute');
          await page.locator('h1').click();
          await soundTooltip.waitFor({ state: 'hidden' });
          await base.fill('be');
          await page.clock.runFor(800);
          await page.locator('.ll-spelling.ll-correct').waitFor();
        } else {
          const cue = lesson.locator('.verbs-word-cue');
          const nextWord = cue.getByRole('button', { name: 'Next word', exact: true });
          const opacity = () => nextWord.evaluate((button: HTMLElement) => getComputedStyle(button).opacity);
          assert.equal(await opacity(), '0');
          const cueBounds = await cue.boundingBox();
          const nextBounds = await nextWord.boundingBox();
          assert.ok(nextBounds.x >= cueBounds.x && nextBounds.x + nextBounds.width <= cueBounds.x + cueBounds.width
            && nextBounds.y >= cueBounds.y && nextBounds.y + nextBounds.height <= cueBounds.y + cueBounds.height, 'Next word sits inside the supplied-word cue');
          if (viewport.width < 600) {
            await cue.locator('.ll-base').tap();
            assert.equal(await cue.getAttribute('data-revealed'), 'true');
            assert.equal(await lesson.getAttribute('data-exercise'), original, 'Touch reveals navigation without skipping the word');
          } else await cue.hover();
          assert.equal(await opacity(), '1');
          if (viewport.width < 600) await page.clock.runFor(4500); else await page.mouse.move(0, 0);
          assert.equal(await opacity(), '0');
          await nextWord.focus();
          assert.equal(await opacity(), '1', 'Keyboard focus reveals the arrow');
          await page.locator('h1').click();
          await page.mouse.move(0, 0);
          assert.equal(await opacity(), '0');

          const information = cue.getByRole('button', { name: 'Verb information', exact: true });
          assert.equal(await information.isVisible(), true);
          await information.hover();
          const tooltip = cue.getByRole('tooltip');
          await tooltip.waitFor();
          assert.equal(await tooltip.innerText(), 'A name, a place, a feeling: simply existing in the moment.');
          assert.equal(await tooltip.getAttribute('lang'), 'en');
          await tooltip.hover();
          assert.equal(await tooltip.isVisible(), true);
          const tooltipBounds = await tooltip.boundingBox();
          assert.ok(tooltipBounds.x >= 0 && tooltipBounds.x + tooltipBounds.width <= viewport.width);
          await page.mouse.move(0, 0);
          await tooltip.waitFor({ state: 'hidden' });
          await information.focus();
          await tooltip.waitFor();
          await page.keyboard.press('Escape');
          await tooltip.waitFor({ state: 'hidden' });
          if (viewport.width < 600) {
            await information.tap();
            await tooltip.waitFor();
            await page.locator('h1').tap();
            await tooltip.waitFor({ state: 'hidden' });
          }
          assert.equal(await lesson.getAttribute('data-exercise'), original);
        }
        for (const [label, value] of [['Past', 'was'], ['Past participle', 'been']]) {
          await page.getByRole('textbox', { name: label, exact: true }).fill(value);
          await page.clock.runFor(800);
        }
        await page.getByRole('textbox', { name: 'Past participle', exact: true }).blur();
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        const observations = page.getByTestId('observations');
        assert.equal(await observations.getAttribute('data-spelling-submissions'), mode === 'image' ? '4' : '2');
        const card = page.getByRole('region', { name: mode === 'image' ? 'Completed picture dictionary' : 'Completed verb dictionary' });
        await card.waitFor();
        const acceptedPast = page.getByRole('textbox', { name: 'Past', exact: true });
        const practice = card.getByRole('button', { name: 'Escribe otros ejemplos', exact: true });
        await practice.click();
        const ownSentence = card.getByRole('textbox', { name: 'Tu frase con be', exact: true });
        await ownSentence.waitFor();
        assert.equal(writingRequests.length, 0, 'Opening optional practice never calls the model');
        await ownSentence.fill('I am at home.');
        await page.clock.runFor(800);
        assert.equal(writingRequests.length, 0, 'Typing an optional sentence does not dispatch a correction');
        assert.equal(await card.locator('.writing-practice').count(), 1);
        assert.equal(await card.locator('.writing-line-field').count(), 1);
        await card.getByRole('button', { name: 'Corregir', exact: true }).click();
        await card.locator('.verb-practice-result').waitFor();
        assert.equal(writingRequests.length, 1);
        assert.deepEqual(writingRequests[0], { identity: { sessionId: 'verbs-browser', exerciseId: original, generation: 1 }, verbId: 'be', draft: 'I am at home.' });
        assert.equal(await ownSentence.inputValue(), 'I am at home.');
        const completedBeforePracticeEdit = await observations.getAttribute('data-completed');
        await acceptedPast.fill('wa');
        assert.equal(await card.count(), 0, 'Editing an accepted verb form unmounts its dictionary and optional practice');
        assert.equal(await lesson.locator('.verb-practice-result').count(), 0);
        await acceptedPast.fill('was');
        await page.clock.runFor(800);
        await card.waitFor();
        assert.equal(await ownSentence.count(), 0, 'Restored written acceptance starts with optional practice collapsed');
        await practice.click();
        await ownSentence.waitFor();
        assert.equal(await ownSentence.inputValue(), '', 'Restored completion cannot retain a draft from invalidated writing');
        assert.equal(await card.locator('.verb-practice-result').count(), 0);
        assert.equal(await observations.getAttribute('data-completed'), completedBeforePracticeEdit, 'Optional coaching never reports completion');
        await practice.click();
        const spellingSubmissions = Number(await observations.getAttribute('data-spelling-submissions'));
        await page.getByRole('button', { name: 'Send oral then uncertain fixture', exact: true }).click();
        await lesson.locator('.verbs-clarification').filter({ hasText: /Please clarify before we move on/ }).waitFor();
        assert.equal(Number(await observations.getAttribute('data-submissions')), spellingSubmissions + 1);
        await page.getByRole('button', { name: 'Answer question fixture', exact: true }).click();
        assert.equal(await lesson.locator('.verbs-clarification').count(), 0);
        await page.getByRole('button', { name: 'Your progress', exact: true }).click();
        const progress = page.getByRole('dialog', { name: 'Lesson progress', exact: true });
        await progress.waitFor();
        await page.waitForFunction(() => document.querySelector('.ll-progress progress')?.getAttribute('value') === document.querySelector('.ll-progress progress')?.getAttribute('max'));
        assert.equal(await progress.getByRole('button', { name: 'Mock Stop session', exact: true }).count(), 1);
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.keyboard.press('Escape');
        await progress.waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('button', { name: 'Your progress', exact: true }).evaluate((element: HTMLElement) => document.activeElement === element), true);
        await page.getByRole('button', { name: 'Reference table', exact: true }).click();
        const sheet = page.getByRole('dialog', { name: 'Verb practice reference', exact: true });
        await sheet.waitFor();
        assert.equal(await sheet.getByRole('button', { name: 'Mock Stop session', exact: true }).count(), 1);
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Reference table');
        if (mode === 'image') {
          const expand = lesson.getByRole('button', { name: 'Expand picture', exact: true });
          if (viewport.width < 600) await lesson.locator('.verbs-picture').tap(); else await lesson.locator('.verbs-picture').hover();
          await expand.click();
          await page.getByRole('dialog', { name: 'Expanded picture', exact: true }).waitFor();
          await page.clock.runFor(3000);
          assert.equal(await lesson.getAttribute('data-exercise'), original, 'Inspecting the enlarged photo holds automatic advancement');
          assert.equal(await page.getByRole('textbox', { name: 'Past', exact: true }).inputValue(), 'was');
          await page.getByRole('button', { name: 'Close expanded picture', exact: true }).click();
          await lesson.getByRole('button', { name: 'Picture information', exact: true }).click();
          await lesson.getByRole('tooltip').waitFor();
          await page.clock.runFor(3000);
          assert.equal(await lesson.getAttribute('data-exercise'), original, 'Reading picture information holds automatic advancement');
          await page.keyboard.press('Escape');
          await lesson.getByRole('tooltip').waitFor({ state: 'hidden' });
        } else {
          await lesson.getByRole('button', { name: 'Verb information', exact: true }).focus();
          await lesson.getByRole('tooltip').waitFor();
          await page.clock.runFor(3000);
          assert.equal(await lesson.getAttribute('data-exercise'), original, 'Reading verb information holds automatic advancement');
          assert.equal(await page.getByRole('textbox', { name: 'Past', exact: true }).inputValue(), 'was');
          await page.keyboard.press('Escape');
          await lesson.getByRole('tooltip').waitFor({ state: 'hidden' });
        }
        const past = page.getByRole('textbox', { name: 'Past', exact: true });
        assert.equal(await past.inputValue(), 'was');
        await page.getByRole('button', { name: 'Ask question fixture', exact: true }).click();
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.getByRole('button', { name: 'Answer question fixture', exact: true }).click();
        await page.getByRole('button', { name: 'Keep speaking', exact: true }).click();
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.getByRole('button', { name: 'Finish speaking', exact: true }).click();
        await page.getByRole('button', { name: 'Pause fixture', exact: true }).click();
        await page.clock.runFor(3000);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.getByRole('button', { name: 'Resume fixture', exact: true }).click();
        await page.clock.runFor(1799);
        assert.equal(await lesson.getAttribute('data-exercise'), original);
        await page.clock.runFor(1);
        await card.waitFor();
        assert.equal(await card.getByRole('heading', { name: 'be', exact: true }).count(), 1);
        assert.ok((await card.locator('.dictionary-definition').innerText()).length > 0);
        if (viewport.width === 390 && mode === 'visible') {
          await card.evaluate((element: HTMLElement) => element.scrollIntoView({ block: 'center' }));
          await card.screenshot({ path: '/tmp/lang-lessons-verb-completion-mobile.png' });
        }
        await page.clock.runFor(10000);
        assert.equal(await lesson.getAttribute('data-exercise'), original, 'Completed verbs retain the definition until explicit Next');
        await card.getByRole('button', { name: mode === 'image' ? 'Next picture' : 'Next verb', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.verbs-lesson')?.getAttribute('data-generation') === '2');
        assert.equal(await lesson.getAttribute('data-verb'), 'beat');
        assert.equal(await observations.getAttribute('data-completed'), '1');
        assert.equal(await page.getByRole('textbox', { name: 'Past', exact: true }).inputValue(), '');
        assert.equal(await lesson.locator('.verb-sentence-practice').count(), 0, 'Next exercise removes the previous optional practice');
        assert.equal(writingRequests.length, 1, 'Closing and navigating never make additional coaching requests');
        const next = lesson.getByRole('button', { name: mode === 'image' ? 'Next image' : 'Next word', exact: true });
        const secondPhoto = mode === 'image' ? await lesson.locator('.verbs-picture').getAttribute('src') : undefined;
        await past.fill('bea');
        await next.focus();
        await page.keyboard.press('Enter');
        assert.equal(await next.evaluate((button: HTMLElement) => document.activeElement === button), true, 'Keyboard navigation keeps focus on the replacement control');
        assert.equal(await past.inputValue(), '');
        if (mode === 'image') {
          const previous = lesson.getByRole('button', { name: 'Previous image', exact: true });
          await previous.click();
          assert.equal(await lesson.getAttribute('data-verb'), 'beat');
          assert.equal(await past.inputValue(), 'bea', 'Back restores an unfinished answer');
          assert.equal(await lesson.locator('.verbs-picture').getAttribute('src'), secondPhoto);
          await past.fill('beat');
          await page.clock.runFor(800);
          await lesson.locator('.ll-spelling.ll-correct').waitFor();
          await previous.click();
          assert.equal(await lesson.getAttribute('data-verb'), 'be');
          assert.equal(await past.inputValue(), 'was');
          assert.equal(await page.getByRole('textbox', { name: 'Past participle', exact: true }).inputValue(), 'been');
          assert.equal(await page.getByRole('textbox', { name: 'Base form', exact: true }).inputValue(), 'be');
          assert.equal(await lesson.locator('.ll-spelling.ll-correct').count(), 3);
          await page.clock.runFor(3000);
          assert.equal(await lesson.getAttribute('data-verb'), 'be', 'Completed exercises stay available for review');
          assert.equal(await observations.getAttribute('data-completed'), '1');
          assert.equal(await previous.isDisabled(), true);
          assert.equal(await next.evaluate((button: HTMLElement) => document.activeElement === button), true, 'At the start of history, focus moves to the available arrow');
          await next.click();
          assert.equal(await past.inputValue(), 'beat', 'Forward restores edits made on a previous visit');
          assert.equal(await lesson.locator('.verbs-picture').getAttribute('src'), secondPhoto);
        } else {
          assert.equal(await lesson.getByRole('button', { name: 'Previous word', exact: true }).count(), 0);
          assert.equal(await lesson.getByRole('tooltip').count(), 0, 'A new word starts without the old information tooltip');
          const cue = lesson.locator('.verbs-word-cue');
          assert.equal(await cue.getAttribute('data-revealed'), null);
          await lesson.getByRole('button', { name: 'Verb information', exact: true }).focus();
          await lesson.getByRole('tooltip').waitFor();
          await next.focus();
          await page.keyboard.press('Enter');
          assert.equal(await lesson.getByRole('tooltip').count(), 0);
          assert.equal(await observations.getAttribute('data-completed'), '1', 'Manual navigation does not complete missing oral or written work');
          await page.locator('h1').click();
          await page.mouse.move(0, 0);
          await cue.scrollIntoViewIfNeeded();
          assert.equal(await next.evaluate((button: HTMLElement) => getComputedStyle(button).opacity), '0');
          if (viewport.width < 600) {
            const exerciseBeforeTouch = await lesson.getAttribute('data-exercise');
            const arrow = await next.boundingBox();
            await page.touchscreen.tap(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2);
            assert.equal(await lesson.getAttribute('data-exercise'), exerciseBeforeTouch, 'The first tap at a hidden arrow only reveals it');
            assert.equal(await cue.getAttribute('data-revealed'), 'true');
            await next.tap();
            assert.notEqual(await lesson.getAttribute('data-exercise'), exerciseBeforeTouch, 'The second tap advances to the next word');
            assert.equal(await cue.getAttribute('data-revealed'), null, 'The next cue resets touch reveal state');
          }
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (viewport.width === 390) {
          await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
          await page.screenshot({ path: `/tmp/en-wp-05-${mode}.png`, fullPage: true });
        }
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log(JSON.stringify({ mode, viewport, gate: 'shared controller', evidence: 'explicit mock only', checks: ['image/two or three fields', 'stable feedback/help', 'automatic checking without buttons', 'deduplicated finalization', 'full oral/written gate', 'progress/reference/information/question/speech/pause holds', 'quiet completion; dictionary and explicit Next', ...(mode === 'image' ? ['photo overlay navigation', 'back/forward photo and draft restoration', 'completed review'] : ['word cue hover/touch/focus navigation', 'English verb information', 'next-only navigation and reset']), 'reflow', '200% text', 'no external requests'] }));
        await context.close();
      }
    }
  } finally { await browser?.close(); server.kill('SIGTERM'); }
});
