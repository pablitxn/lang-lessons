import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { sentencesForLanguage } from '../src/content';
import { matchingSentences } from '../src/features/sentences/session';
import type { LearningLanguage, Tense } from '../src/contracts';
import type { WrittenTranslationReview } from '../src/contracts/written-translation-review';

const futureDraft = 'Tomorrow at this time, the kids will be playing in the yard.';
const futureGrammar = 'Will + be + playing forma el futuro continuo. La acción estará en curso mañana a esta hora.';
const accepted = (tense: Tense, grammar: string): WrittenTranslationReview => ({ status: 'accepted', tense, grammar, hint: '', issues: [] });
const revision = (text: string, hint: string): WrittenTranslationReview => ({ status: 'needs-revision', tense: null, grammar: '', hint: '', issues: [{ text, hint }] });

async function assertNoOralEvidence(page: any, writtenTense?: 'checked' | 'retry' | 'empty') {
  assert.equal(await page.getByTestId('completion-count').innerText(), '0');
  assert.equal(await page.locator('.ll-sentences').getAttribute('data-stage'), 'translation');
  await page.getByRole('button', { name: /^(Your progress|Tu progreso)$/ }).click();
  assert.match(await page.locator('.ll-progress-count').innerText(), /^0\s+(?:of|de) 4\b/);
  if (writtenTense) assert.match(await page.locator('.ll-written-progress').nth(1).innerText(), writtenTense === 'checked'
    ? /Written tense: Checked|Tiempo escrito: Comprobado/
    : writtenTense === 'retry' ? /Written tense: Try another tense|Tiempo escrito: Probá otro tiempo/
      : /Written tense: Not checked|Tiempo escrito: Sin comprobar/);
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(() => ({ inputs: window.sentenceFixture.voice.inputs.length,
    hints: window.sentenceFixture.voice.hints.length, connects: window.sentenceFixture.voice.connects })), { inputs: 0, hints: 0, connects: 0 });
}

async function assertNeutral(page: any) {
  const written = page.locator('.sentences-written');
  assert.equal(await written.locator('.ll-incorrect, .sentences-error-trigger, [data-gap], .ll-correct').count(), 0);
  assert.doesNotMatch(await written.innerText(), /Falta|▴/);
  assert.equal(await page.locator('.sentences-reviewed-practice').count(), 0);
}

test('translation review accepts natural variants and annotates only model-validated learner text', {
  skip: process.env.SENTENCE_REVIEW_BROWSER !== '1', timeout: 90000,
}, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5205; const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', chunk => { logs += String(chunk); }); server.stderr.on('data', chunk => { logs += String(chunk); });
  let browser: any;
  try {
    for (let index = 0; index < 100 && !logs.includes('Local:'); index++) { assert.equal(server.exitCode, null, logs); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.match(logs, /Local:/, logs);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
    for (const scenario of [
      { language: 'en' as const, tense: 'future-continuous' as const, sentenceId: 'sentence-future-continuous-playground', viewport: { width: 390, height: 844 }, help: true },
      { language: 'en' as const, tense: 'future-continuous' as const, sentenceId: 'sentence-future-continuous-playground', viewport: { width: 1024, height: 768 }, help: true },
      { language: 'fr' as const, tense: 'fr-futur-simple' as const, sentenceId: 'fr-sentence-futur-simple-g1-v1', viewport: { width: 390, height: 844 }, help: true },
      { language: 'en' as const, tense: 'future-continuous' as const, sentenceId: 'sentence-future-continuous-playground', viewport: { width: 390, height: 844 }, help: false },
    ]) {
      const context = await browser.newContext({ viewport: scenario.viewport }); const page = await context.newPage();
      const errors: string[] = []; const external: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      page.on('request', (request: any) => { if (!request.url().startsWith(origin)) external.push(request.url()); });
      const requests: { body: any; reply: (review: WrittenTranslationReview | { invalid: true }) => void }[] = [];
      await page.route('**/api/realtime/sentence-hint', async (route: any) => {
        let reply!: (review: WrittenTranslationReview | { invalid: true }) => void;
        const pending = new Promise<WrittenTranslationReview | { invalid: true }>(resolve => { reply = resolve; });
        requests.push({ body: route.request().postDataJSON(), reply });
        await route.fulfill({ json: await pending }).catch(() => {});
      });
      const pool = matchingSentences({ grammar: 1, vocabulary: 1 }, sentencesForLanguage(scenario.language as LearningLanguage), scenario.tense);
      const target = pool.findIndex(sentence => sentence.id === scenario.sentenceId); assert.ok(target >= 0);
      await page.addInitScript((sample: number) => { Math.random = () => sample; }, (target + .5) / pool.length);
      await page.goto(`${origin}/src/features/sentences/__fixtures__/preview.html?language=${scenario.language}&grammar=1&tense=${scenario.tense}&help=${scenario.help ? '1' : '0'}`, { waitUntil: 'networkidle' });
      const lesson = page.locator('.ll-sentences[data-exercise-id]'); await lesson.waitFor();
      const field = lesson.getByRole('textbox', { name: scenario.language === 'fr' ? 'Traducción al francés' : 'English translation', exact: true });
      const grammar = lesson.locator('.sentences-explanation');
      const choice = lesson.getByRole('combobox');
      const annotation = lesson.locator('.ll-spelling');
      const draft = scenario.language === 'fr' ? 'Demain, c’est au marché que j’irai.' : futureDraft;
      async function submit(text: string) {
        const count = requests.length;
        await field.fill(text); await field.press('Enter');
        for (let attempt = 0; attempt < 100 && requests.length === count; attempt++) await page.waitForTimeout(20);
        assert.equal(requests.length, count + 1); return requests[count]!;
      }
      if (!scenario.help) {
        await field.fill(draft); await field.press('Enter'); await annotation.waitFor();
        await page.waitForTimeout(850); await assertNeutral(page); assert.equal(requests.length, 0);
      } else {
        const first = await submit(draft); await annotation.waitFor(); await assertNeutral(page);
        assert.equal(await annotation.innerText(), draft);
        assert.equal(first.body.sentenceId, scenario.sentenceId); assert.equal(first.body.draft, draft);
        const grammarText = scenario.language === 'fr' ? 'Irai es el futuro simple de aller con je. La expresión c’est au marché que destaca el destino sin cambiar el momento futuro.' : futureGrammar;
        first.reply(accepted(scenario.tense, grammarText));
        await lesson.locator('.ll-spelling.ll-correct').waitFor();
        assert.equal(await annotation.innerText(), `✓${draft}`);
        assert.equal(await lesson.locator('.ll-incorrect, [data-gap], .sentences-error-trigger').count(), 0);
        await choice.waitFor(); assert.equal(await grammar.count(), 0, 'The learner must still identify the actual tense');
        await lesson.getByRole('button', { name: 'Escribe otros ejemplos', exact: true }).waitFor();
        await choice.click(); await page.getByRole('option', { name: scenario.language === 'fr' ? 'Présent · presente' : 'Future simple · will', exact: true }).click();
        assert.equal(await lesson.locator('.sentences-tense').getAttribute('data-status'), 'incorrect'); assert.equal(await grammar.count(), 0);
        await assertNoOralEvidence(page, 'retry');
        await choice.click(); await page.getByRole('option', { name: scenario.language === 'fr' ? 'Futur simple · futuro' : 'Future continuous', exact: true }).click();
        await grammar.waitFor(); assert.equal(await grammar.locator('blockquote').innerText(), draft);
        assert.equal(await grammar.getByText(grammarText, { exact: true }).count(), 1);
        await assertNoOralEvidence(page, 'checked');
        if (scenario.language === 'en') {
          if (scenario.viewport.width === 390) {
            const height = await lesson.evaluate((element: HTMLElement) => Math.ceil(element.getBoundingClientRect().height) + 300);
            await page.setViewportSize({ width: scenario.viewport.width, height });
            await lesson.screenshot({ path: '/tmp/lang-lessons-reviewed-future-mobile.png' });
            await page.setViewportSize(scenario.viewport);
          }
          const beforeCachedReturn = requests.length;
          await field.fill('An interim draft.'); await field.fill(draft); await field.press('Enter');
          await choice.waitFor(); assert.equal(await choice.getAttribute('data-value'), '');
          assert.equal(await grammar.count(), 0, 'Editing resets the transient tense even when the accepted review is cached');
          assert.equal(requests.length, beforeCachedReturn);
          await assertNoOralEvidence(page, 'empty');
          const incomplete = await submit('Tomorrow at this time, the kids will be playing in the.');
          await assertNeutral(page); assert.equal(await grammar.count(), 0);
          incomplete.reply(revision('in the', 'Después de «in the» falta indicar el lugar donde estarán jugando.'));
          const issues = lesson.locator('.sentences-error-trigger'); await issues.first().waitFor();
          assert.deepEqual(await issues.allTextContents(), ['in the']);
          assert.deepEqual(await lesson.locator('.ll-incorrect').allTextContents(), ['in the']);
          assert.equal(await lesson.locator('[data-gap]').count(), 0, 'A missing place is anchored to actual learner text');
          await issues.first().focus();
          await page.getByRole('tooltip').getByText('Después de «in the» falta indicar el lugar donde estarán jugando.', { exact: true }).waitFor();
          if (scenario.viewport.width === 390) await page.screenshot({ path: '/tmp/lang-lessons-reviewed-missing-place-mobile.png' });
          await page.keyboard.press('Escape');
          const incorrect = await submit('Tomorrow at this time, the kids will playing in the yard.');
          await assertNeutral(page);
          incorrect.reply(revision('will playing', 'La acción está en curso: revisá si la construcción verbal está completa.'));
          await issues.first().waitFor(); assert.deepEqual(await issues.allTextContents(), ['will playing']);
          await issues.first().focus();
          await page.getByRole('tooltip').getByText('La acción está en curso: revisá si la construcción verbal está completa.', { exact: true }).waitFor();
          await page.keyboard.press('Escape');
          const multiple = await submit('Tomorrow at this time, the kids will playing in the.');
          multiple.reply({ status: 'needs-revision', tense: null, grammar: '', hint: '', issues: [
            { text: 'will playing', hint: 'Revisá el auxiliar de esta construcción.' },
            { text: 'in the', hint: 'Todavía falta el lugar de la acción.' },
          ] });
          await issues.nth(1).waitFor();
          for (const [index, text] of ['Revisá el auxiliar de esta construcción.', 'Todavía falta el lugar de la acción.'].entries()) {
            await issues.nth(index).focus(); await page.getByRole('tooltip').getByText(text, { exact: true }).waitFor();
            assert.equal(await lesson.locator('.sentences-error-trigger[aria-expanded="true"]').count(), 1);
            assert.equal(await issues.nth(index).getAttribute('aria-expanded'), 'true');
            await page.keyboard.press('Escape');
          }
          const sameHint = await submit('Tomorrow at this time, kids will playing in the.');
          sameHint.reply({ status: 'needs-revision', tense: null, grammar: '', hint: '', issues: [
            { text: 'will playing', hint: 'Revisá esta parte de la frase.' },
            { text: 'in the', hint: 'Revisá esta parte de la frase.' },
          ] });
          await issues.nth(1).waitFor();
          for (const index of [0, 1]) {
            await issues.nth(index).focus(); await page.getByRole('tooltip').getByText('Revisá esta parte de la frase.', { exact: true }).waitFor();
            assert.equal(await lesson.locator('.sentences-error-trigger[aria-expanded="true"]').count(), 1, 'Identical hint text does not expand both issue controls');
            assert.equal(await issues.nth(index).getAttribute('aria-expanded'), 'true');
            await page.keyboard.press('Escape');
          }
          const uncertain = await submit('Tomorrow the kids play somewhere.');
          uncertain.reply({ status: 'uncertain', tense: null, grammar: '', hint: 'Revisá qué momento y lugar querés expresar.', issues: [] });
          await field.press('Alt+ArrowDown'); await page.getByRole('tooltip').getByText('Revisá qué momento y lugar querés expresar.', { exact: true }).waitFor();
          await assertNeutral(page); await page.keyboard.press('Escape');
          const malformed = await submit('Tomorrow, the kids will be playing outdoors.'); malformed.reply({ invalid: true });
          await field.press('Alt+ArrowDown'); await page.getByRole('tooltip').getByText('No se pudo generar una pista válida. Podés volver a intentarlo.', { exact: true }).waitFor();
          await assertNeutral(page); await page.keyboard.press('Escape');

          const old = await submit('Tomorrow at this time, kids will be playing in the yard.');
          const replacement = await submit('Tomorrow at this time, the kids will playing in the yard!');
          old.reply(accepted('future-continuous', 'This stale grammar must not appear.'));
          await page.waitForTimeout(80); await assertNeutral(page); assert.doesNotMatch(await lesson.innerText(), /stale grammar/);
          replacement.reply(revision('will playing', 'Revisá la forma verbal antes de continuar.'));
          await issues.first().waitFor(); assert.deepEqual(await issues.allTextContents(), ['will playing']);

          const repeatedDraft = 'Tomorrow at this time, the kids will be playing in our yard.';
          const oldIdentity = await submit(repeatedDraft); const oldExercise = await lesson.getAttribute('data-exercise-id');
          await lesson.getByRole('button', { name: 'Next sentence', exact: true }).click();
          await page.waitForFunction((id: string) => document.querySelector('.ll-sentences')?.getAttribute('data-exercise-id') !== id, oldExercise);
          const intermediateExercise = await lesson.getAttribute('data-exercise-id');
          await lesson.getByRole('button', { name: 'Next sentence', exact: true }).click();
          await page.waitForFunction((id: string) => document.querySelector('.ll-sentences')?.getAttribute('data-exercise-id') !== id, intermediateExercise);
          const newIdentity = await submit(repeatedDraft); oldIdentity.reply(accepted('future-continuous', 'Old exercise grammar must not appear.'));
          await page.waitForTimeout(80); await assertNeutral(page); assert.doesNotMatch(await lesson.innerText(), /Old exercise grammar/);
          assert.equal(newIdentity.body.sentenceId, oldIdentity.body.sentenceId, 'A repeated curriculum sentence still has a new exercise identity');
          assert.notEqual(await lesson.getAttribute('data-exercise-id'), oldExercise);
          newIdentity.reply({ status: 'uncertain', tense: null, grammar: '', hint: 'Revisá el significado de la nueva consigna.', issues: [] });
          await field.press('Alt+ArrowDown'); await page.getByRole('tooltip').getByText('Revisá el significado de la nueva consigna.', { exact: true }).waitFor();
          await assertNeutral(page); await page.keyboard.press('Escape');
        }
      }
      await assertNoOralEvidence(page); assert.deepEqual(errors, []); assert.deepEqual(external, []);
      await context.close();
      console.log(JSON.stringify({ scenario, status: 'passed', evidence: 'actual SentenceLesson rendering; mocked structured translation reviews only' }));
    }
  } finally { await browser?.close(); server.kill('SIGTERM'); }
});
