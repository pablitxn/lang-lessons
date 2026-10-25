import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { SENTENCES } from '../src/content';
import { matchingSentences } from '../src/features/sentences/session';
import type { WordDictionaryResponse } from '../src/contracts';

function dictionary(word: string): WordDictionaryResponse {
  const source = { url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`, snapshotId: 'browser-fixture', retrievedOn: '2026-10-25',
    contentHash: 'mock-browser-content', license: 'CC BY-SA 4.0', attribution: 'English Wiktionary contributors' };
  return { status: 'found', word, language: 'en', definitionLanguage: 'en', entry: {
    lemma: word.toLowerCase(), pronunciations: [], senses: [{ id: 'mock-sense', partOfSpeech: { text: word.includes("'") ? 'contraction' : 'verb', source },
      definition: { text: word.includes("'") ? 'Contraction of we have.' : 'Present participle of live.', source }, examples: [] }],
  } };
}

async function exerciseLayout(page: any) {
  return page.evaluate(() => {
    const cue = document.querySelector('.sentence-cue-help')!.getBoundingClientRect();
    const controls = document.querySelector('.sentences-written-controls')!.getBoundingClientRect();
    return { cueWidth: cue.width, cueHeight: cue.height, controlsWidth: controls.width, controlsHeight: controls.height,
      controlsOffset: controls.top - cue.top };
  });
}

async function assertTooltipGeometry(page: any, anchor: 'cue' | 'annotation' | 'input') {
  const geometry = await page.getByRole('tooltip').evaluate((tooltip: HTMLElement) => {
    const box = tooltip.getBoundingClientRect();
    const cue = document.querySelector('.sentence-cue-help')!.getBoundingClientRect();
    const controls = document.querySelector('.sentences-written-controls')!.getBoundingClientRect();
    const annotation = document.querySelector('.sentences-written .ll-spelling')?.getBoundingClientRect();
    const active = document.activeElement instanceof HTMLElement ? document.activeElement.getBoundingClientRect() : undefined;
    const dock = document.querySelector('.ll-dock')?.getBoundingClientRect();
    return { portal: !tooltip.closest('.ll-sentences'), floating: getComputedStyle(tooltip).position === 'fixed',
      fits: box.left >= 0 && box.top >= 0 && box.right <= innerWidth + .5 && box.bottom <= innerHeight + .5,
      overlaps: [cue, controls, annotation, active].map(other => Boolean(other && box.left < other.right - .5 && box.right > other.left + .5
        && box.top < other.bottom - .5 && box.bottom > other.top + .5)), aboveCue: box.bottom <= cue.top + .5,
      belowAnnotation: Boolean(annotation && box.top >= annotation.bottom - .5),
      roomBelowAnnotation: Boolean(annotation && annotation.bottom + 8 + tooltip.scrollHeight <= Math.min(innerHeight - 8, (dock?.top ?? innerHeight) - 8)),
      width: box.width, height: box.height };
  });
  assert.equal(geometry.portal, true, 'Help escapes the scrolling lesson without altering its layout');
  assert.equal(geometry.floating, true); assert.equal(geometry.fits, true, JSON.stringify(geometry));
  assert.equal(geometry.overlaps[0], false); assert.equal(geometry.overlaps[1], false);
  assert.ok(geometry.width > 0 && geometry.height > 0);
  if (anchor === 'cue') assert.equal(geometry.aboveCue, true, JSON.stringify(geometry));
  else {
    assert.equal(geometry.overlaps[2], false, JSON.stringify(geometry));
    assert.equal(geometry.overlaps[3], false, JSON.stringify(geometry));
    if (anchor === 'annotation' && geometry.roomBelowAnnotation) assert.equal(geometry.belowAnnotation, true, JSON.stringify(geometry));
  }
}

test('sentence tools keep help in the cue and support scoped dictionary and optional rewrite without provider calls', {
  skip: process.env.SENTENCE_TOOLS_BROWSER !== '1', timeout: 90000,
}, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5203; const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', chunk => { logs += String(chunk); }); server.stderr.on('data', chunk => { logs += String(chunk); });
  let browser: any;
  try {
    for (let index = 0; index < 100 && !logs.includes('Local:'); index++) { assert.equal(server.exitCode, null, logs); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.match(logs, /Local:/, logs);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage(); const errors: string[] = []; const external: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      page.on('request', (request: any) => { if (!request.url().startsWith(origin)) external.push(request.url()); });
      const dictionaryRequests: any[] = []; const rewriteRequests: any[] = []; const hintRequests: any[] = [];
      let dictionaryWait: Promise<void> | undefined; let rewriteWait: Promise<void> | undefined; let hintWait: Promise<void> | undefined;
      let hintFailure: { status: number; reason: string } | undefined;
      await page.route('**/api/realtime/sentence-hint', async (route: any) => {
        const payload = route.request().postDataJSON(); hintRequests.push(payload);
        const failure = hintFailure; const wait = hintWait; if (wait) await wait;
        if (failure) { await route.fulfill({ status: failure.status, json: { reason: failure.reason, error: 'Private upstream detail must never be displayed.' } }).catch(() => {}); return; }
        await route.fulfill({ json: { status: 'needs-revision', tense: null, grammar: '', hint: '', issues: [{ text: payload.draft.includes('living') ? 'living' : 'different', hint: wait ? 'Esta pista pertenece a la frase anterior.' : 'Revisá si falta el lugar de la acción.' }] } }).catch(() => {});
      });
      await page.route('**/api/realtime/word-dictionary', async (route: any) => {
        const payload = route.request().postDataJSON(); dictionaryRequests.push(payload);
        const wait = dictionaryWait; if (wait) await wait;
        await route.fulfill({ json: dictionary(payload.word) }).catch(() => {});
      });
      await page.route('**/api/realtime/sentence-rewrite', async (route: any) => {
        rewriteRequests.push(route.request().postDataJSON());
        const wait = rewriteWait; if (wait) await wait;
        await route.fulfill({ json: { status: 'correct', correctedSentence: null, explanation: 'Usás have + lived para formar el presente perfecto. Since 2020 indica cuándo empezó una situación que continúa en el presente.' } }).catch(() => {});
      });
      const pool = matchingSentences({ grammar: 2, vocabulary: 1 }, SENTENCES, 'present-perfect');
      const target = pool.findIndex(sentence => sentence.id === 'sentence-since-2020');
      assert.ok(target >= 0);
      await page.addInitScript((sample: number) => { Math.random = () => sample; }, (target + .5) / pool.length);
      await page.goto(`${origin}/src/features/sentences/__fixtures__/preview.html`, { waitUntil: 'networkidle' });
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      const lesson = page.locator('.ll-sentences[data-exercise-id]'); await lesson.waitFor();
      const answer = lesson.getByRole('textbox', { name: 'English translation', exact: true });
      const help = lesson.getByRole('button', { name: 'Ayuda para traducir', exact: true });
      const dictionaryToggle = lesson.getByRole('button', { name: 'Diccionario', exact: true });
      const dictionaryCard = lesson.locator('.sentence-dictionary');
      const rewriteToggle = lesson.getByRole('button', { name: 'Escribe otros ejemplos', exact: true });
      const rewriteField = lesson.getByRole('textbox', { name: 'Tu ejemplo', exact: true });
      const rewriteResult = lesson.locator('.verb-practice-result');
      const next = lesson.getByRole('button', { name: 'Next sentence', exact: true });
      assert.equal(await rewriteToggle.count(), 0);
      assert.equal(await help.evaluate((element: HTMLElement) => Boolean(element.closest('.ll-cue'))), true);
      const beforeHelp = await exerciseLayout(page);
      await help.click(); await page.getByRole('tooltip').waitFor();
      assert.deepEqual(await exerciseLayout(page), beforeHelp, 'Opening cue help does not resize or move exercise content');
      await assertTooltipGeometry(page, 'cue');
      await page.keyboard.press('Escape');
      await answer.fill("We've been living here since 2020."); await answer.press('Enter');
      await rewriteToggle.waitFor();
      const controls = await page.evaluate(() => {
        const dictionary = document.querySelector('.sentences-dictionary-toggle')!.getBoundingClientRect();
        const next = document.querySelector('[aria-label="Next sentence"]')!.getBoundingClientRect();
        return Math.abs(dictionary.right - next.right);
      });
      assert.ok(controls < 1, 'Dictionary and navigation align with the exercise edge');
      const dictionaryBounds = await dictionaryToggle.boundingBox();
      assert.equal(dictionaryBounds.width, 44); assert.equal(dictionaryBounds.height, 44);
      assert.equal(await dictionaryToggle.innerText(), '', 'Dictionary is an icon-only control with an accessible name');
      assert.equal(await lesson.locator('.sentences-feedback-label, .sentences-comparison-note').count(), 0);
      assert.equal(await lesson.locator('.sentences-dictionary-instruction').count(), 0);
      assert.equal(await dictionaryToggle.getAttribute('aria-pressed'), 'false');
      assert.equal(await lesson.locator('.sentence-dictionary-word').count(), 0);
      assert.equal(await dictionaryCard.count(), 0);
      await dictionaryToggle.click();
      assert.equal(dictionaryRequests.length, 0, 'Dictionary mode alone does not request a definition');
      await lesson.getByRole('button', { name: "Consultar We've", exact: true }).click();
      await dictionaryCard.getByRole('heading', { name: "we've", exact: true }).waitFor();
      assert.equal(await lesson.getByRole('button', { name: 'Consultar We', exact: true }).count(), 0, 'Contractions are one dictionary control');
      const identity = await page.evaluate(() => {
        const current = window.sentenceFixture.voice.context;
        return { sessionId: current.sessionId, exerciseId: current.exerciseId, generation: current.generation };
      });
      assert.deepEqual(dictionaryRequests.at(-1), { identity, sentenceId: 'sentence-since-2020', word: "We've" });
      assert.equal(await dictionaryCard.locator('.dictionary-sources, .sentence-dictionary-note').count(), 0);
      await page.getByText('Fixture credits', { exact: true }).click();
      const credits = page.getByRole('region', { name: 'Consulted dictionary entries', exact: true });
      assert.equal(await credits.getByRole('link', { name: 'English Wiktionary contributors', exact: true }).getAttribute('href'), "https://en.wiktionary.org/wiki/We've");
      assert.equal(await credits.getByRole('link', { name: 'CC BY-SA 4.0', exact: true }).getAttribute('href'), 'https://creativecommons.org/licenses/by-sa/4.0/');
      assert.match(await credits.innerText(), /Formatting adapted/);
      await page.getByText('Fixture credits', { exact: true }).click();
      const beforeLocal = dictionaryRequests.length;
      await lesson.getByRole('button', { name: 'Consultar been', exact: true }).click();
      await dictionaryCard.getByRole('heading', { name: 'be', exact: true }).waitFor();
      assert.equal(dictionaryRequests.length, beforeLocal, 'A reviewed local verb form uses the existing dictionary snapshot');
      assert.match(await dictionaryCard.locator('.dictionary-forms').innerText(), /was \/ were/);
      await lesson.getByRole('button', { name: 'Consultar living', exact: true }).click();
      await dictionaryCard.getByRole('heading', { name: 'living', exact: true }).waitFor();
      assert.equal(dictionaryRequests.at(-1).word, 'living');
      await rewriteToggle.click(); await rewriteField.fill('We have lived here since 2020.');
      assert.equal(await lesson.locator('.writing-practice').count(), 1);
      assert.equal(await lesson.locator('.verb-practice-submit svg, .verb-practice-optional, .verb-practice-subtitle, .verb-practice-guidance').count(), 0);
      await page.waitForTimeout(800); assert.equal(rewriteRequests.length, 0, 'Opening and typing optional practice never requests coaching');
      await lesson.getByRole('button', { name: 'Corregir', exact: true }).click(); await rewriteResult.waitFor();
      assert.equal(await rewriteResult.locator('h3, .verb-practice-result-label, .writing-correction').count(), 0, 'An accepted version has only plain feedback');
      assert.equal(await rewriteResult.getByText('Usás have + lived para formar el presente perfecto. Since 2020 indica cuándo empezó una situación que continúa en el presente.', { exact: true }).count(), 1);
      assert.deepEqual(rewriteRequests[0], { identity, sentenceId: 'sentence-since-2020', draft: 'We have lived here since 2020.' });
      assert.equal(await answer.inputValue(), "We've been living here since 2020.");
      assert.equal(await lesson.getAttribute('data-stage'), 'translation');
      assert.equal(await page.getByTestId('completion-count').innerText(), '0');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (viewport.width === 390) {
        // A tall capture viewport keeps the fixture's fixed dock below the component.
        const captureHeight = await lesson.evaluate((element: HTMLElement) => Math.ceil(element.getBoundingClientRect().height) + 300);
        await page.setViewportSize({ width: viewport.width, height: captureHeight });
        await lesson.evaluate((element: HTMLElement) => element.scrollIntoView({ block: 'start' }));
        await lesson.screenshot({ path: '/tmp/lang-lessons-sentence-tools-mobile.png' });
        await page.setViewportSize(viewport);
      }

      // Closed or replaced dictionary cards never receive the old response.
      let release!: () => void;
      dictionaryWait = new Promise<void>(resolve => { release = resolve; });
      await lesson.getByRole('button', { name: "Consultar We've", exact: true }).click();
      await dictionaryCard.getByText('Buscando la palabra…').waitFor();
      await lesson.getByRole('button', { name: 'Cerrar diccionario', exact: true }).click();
      release(); dictionaryWait = undefined;
      await page.waitForTimeout(80); assert.equal(await dictionaryCard.count(), 0);
      dictionaryWait = new Promise<void>(resolve => { release = resolve; });
      await lesson.getByRole('button', { name: 'Consultar living', exact: true }).click();
      await dictionaryCard.getByText('Buscando la palabra…').waitFor();
      await answer.fill("We've been living since 2020."); release(); dictionaryWait = undefined;
      await answer.press('Enter');
      assert.equal(await dictionaryCard.count(), 0); assert.equal(await rewriteToggle.count(), 0, 'Editing the main translation removes optional practice');
      await lesson.locator('.ll-incorrect').first().waitFor();
      assert.equal(await lesson.locator('[data-gap], .sentences-feedback-label, .sentences-comparison-note').count(), 0);
      await dictionaryToggle.click();
      assert.equal(await dictionaryToggle.getAttribute('aria-pressed'), 'false');
      const issue = lesson.locator('.sentences-error-trigger').first(); await issue.waitFor();
      assert.equal(await issue.innerText(), 'living', 'Only the exact model-reviewed learner text is annotated');
      const beforeIssue = dictionaryRequests.length; const beforeMarker = await exerciseLayout(page);
      await issue.click();
      const hintTooltip = page.getByRole('tooltip');
      await hintTooltip.getByText('Revisá si falta el lugar de la acción.', { exact: true }).waitFor();
      assert.equal(dictionaryRequests.length, beforeIssue, 'An issue hint never dispatches a dictionary lookup');
      assert.deepEqual(await exerciseLayout(page), beforeMarker, 'Marker help does not change cue or input geometry');
      await assertTooltipGeometry(page, 'annotation');
      if (viewport.width === 390) await page.screenshot({ path: '/tmp/lang-lessons-sentence-error-tooltip-mobile.png' });
      await page.keyboard.press('Escape'); await hintTooltip.waitFor({ state: 'hidden' });
      hintFailure = { status: 502, reason: 'invalid-response' };
      await answer.fill("We've living here since 2020."); await answer.press('Enter');
      await answer.press('Alt+ArrowDown');
      await hintTooltip.getByText('No se pudo generar una pista válida. Podés volver a intentarlo.', { exact: true }).waitFor();
      assert.equal(await lesson.locator('.ll-incorrect, .sentences-error-trigger, [data-gap]').count(), 0, 'Provider failure leaves the annotation neutral');
      assert.doesNotMatch(await hintTooltip.innerText(), /Private upstream|invalid-response|502/);
      await page.keyboard.press('Escape'); await hintTooltip.waitFor({ state: 'hidden' });
      await answer.focus(); const beforeShortcut = await exerciseLayout(page);
      await answer.press('Alt+ArrowDown'); await hintTooltip.waitFor();
      assert.deepEqual(await exerciseLayout(page), beforeShortcut, 'Keyboard help does not change cue or input geometry');
      await assertTooltipGeometry(page, 'input');
      const shortcutTooltipId = await hintTooltip.getAttribute('id');
      assert.ok((await answer.getAttribute('aria-describedby'))?.split(' ').includes(shortcutTooltipId));
      await page.keyboard.press('Escape'); await hintTooltip.waitFor({ state: 'hidden' });
      hintFailure = undefined;
      await answer.fill("We've been living here since 2020."); await answer.press('Enter'); await rewriteToggle.waitFor();
      await dictionaryToggle.click();
      await rewriteToggle.click(); assert.equal(await rewriteField.inputValue(), ''); assert.equal(await rewriteResult.count(), 0);

      // Next replaces both pending tools without writing completion or leaking results.
      let releaseDictionary!: () => void; let releaseRewrite!: () => void;
      dictionaryWait = new Promise<void>(resolve => { releaseDictionary = resolve; });
      rewriteWait = new Promise<void>(resolve => { releaseRewrite = resolve; });
      await lesson.getByRole('button', { name: 'Consultar living', exact: true }).click();
      await dictionaryCard.getByText('Buscando la palabra…').waitFor();
      await rewriteField.fill('We have lived here since 2020.');
      await lesson.getByRole('button', { name: 'Corregir', exact: true }).click();
      await lesson.getByText('Revisando tu frase…', { exact: true }).waitFor();
      const oldId = await lesson.getAttribute('data-exercise-id');
      await next.click(); releaseDictionary(); releaseRewrite(); dictionaryWait = undefined; rewriteWait = undefined;
      await page.waitForFunction((id: string) => document.querySelector('.ll-sentences')?.getAttribute('data-exercise-id') !== id, oldId);
      await page.waitForTimeout(80);
      assert.equal(await dictionaryCard.count(), 0); assert.equal(await rewriteToggle.count(), 0); assert.equal(await rewriteResult.count(), 0);
      assert.equal(await answer.inputValue(), ''); assert.equal(await page.getByTestId('completion-count').innerText(), '0');

      // Dismissing in-cue help must not move Next between pointerdown and pointerup.
      const cueHelpId = await lesson.getAttribute('data-exercise-id');
      await help.focus(); await page.getByRole('tooltip').waitFor();
      const cueTooltipId = await page.getByRole('tooltip').getAttribute('id');
      assert.equal(await help.evaluate((element: HTMLElement) => element === document.activeElement), true);
      await next.click();
      await page.waitForFunction((id: string) => document.querySelector('.ll-sentences')?.getAttribute('data-exercise-id') !== id, cueHelpId);
      assert.equal(await page.locator(`[id="${cueTooltipId}"]`).count(), 0, 'One Next click dismisses the old cue help and advances');

      // Pending input help also preserves one-click navigation and cancels its review.
      const errorHelpId = await lesson.getAttribute('data-exercise-id');
      let releaseHint!: () => void;
      hintWait = new Promise<void>(resolve => { releaseHint = resolve; });
      const beforeHint = hintRequests.length;
      await answer.fill('This is a different phrase.'); await answer.press('Enter');
      assert.equal(await lesson.locator('.sentences-error-trigger').count(), 0, 'Pending review does not invent error markers');
      await answer.press('Alt+ArrowDown'); await page.getByRole('tooltip').waitFor();
      const errorTooltipId = await page.getByRole('tooltip').getAttribute('id');
      assert.equal(await answer.evaluate((element: HTMLElement) => element === document.activeElement), true);
      for (let index = 0; index < 50 && hintRequests.length === beforeHint; index++) await page.waitForTimeout(20);
      assert.ok(hintRequests.length > beforeHint, 'The old hint request is pending before navigation');
      const abortedHint = page.waitForEvent('requestfailed', { timeout: 5000, predicate: (request: any) => request.url().endsWith('/api/realtime/sentence-hint') });
      await next.click();
      await page.waitForFunction((id: string) => document.querySelector('.ll-sentences')?.getAttribute('data-exercise-id') !== id, errorHelpId);
      assert.match((await abortedHint).failure()?.errorText ?? '', /ABORTED/);
      releaseHint(); hintWait = undefined;
      await page.waitForTimeout(80);
      assert.equal(await page.locator(`[id="${errorTooltipId}"]`).count(), 0, 'The previous exercise tooltip is removed even if the pointer hovers the new cue');
      assert.doesNotMatch(await lesson.innerText(), /Esta pista pertenece a la frase anterior/);
      assert.equal(await answer.inputValue(), ''); assert.equal(await page.getByTestId('completion-count').innerText(), '0');
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      await context.close();
      console.log(JSON.stringify({ viewport, status: 'passed', evidence: 'actual SentenceLesson rendering; mocked dictionary and coaching transport only' }));
    }
  } finally {
    await browser?.close(); server.kill('SIGTERM');
    await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', () => resolve()); });
  }
});
