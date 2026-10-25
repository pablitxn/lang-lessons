import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import type { VerbWritingFeedback } from '../src/contracts';

const corrected: VerbWritingFeedback = { status: 'needs-revision', correctedSentence: 'She is betting on her team.', explanation: 'Para una acción en curso, is acompaña a betting. La idea de tu frase se mantiene.' };
const correct: VerbWritingFeedback = { status: 'correct', correctedSentence: null, explanation: 'Tu frase usa el verbo de forma natural.' };
const edited: VerbWritingFeedback = { status: 'needs-revision', correctedSentence: 'I have a book.', explanation: 'I lleva mayúscula; have concuerda con I. Book se escribe con dos oes y la frase termina con un punto.' };

async function assertCorrection(result: any, original: string, correctedText: string) {
  const correction = result.locator('.writing-correction'); await correction.waitFor();
  const text = await correction.evaluate((element: HTMLElement) => {
    const before = element.cloneNode(true) as HTMLElement; before.querySelectorAll('ins').forEach(item => item.remove());
    const after = element.cloneNode(true) as HTMLElement; after.querySelectorAll('del').forEach(item => item.remove());
    return { before: before.textContent, after: after.textContent };
  });
  assert.deepEqual(text, { before: original, after: correctedText });
  assert.equal(await result.locator('h3, .verb-practice-result-label').count(), 0, 'Corrections have no tutor label or extra title');
}

test('optional verb writing renders accessible feedback and rejects stale requests without real provider calls', {
  skip: process.env.VERB_WRITING_BROWSER !== '1', timeout: 90000,
}, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5201;
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', chunk => { logs += String(chunk); }); server.stderr.on('data', chunk => { logs += String(chunk); });
  let browser: any;
  try {
    for (let index = 0; index < 100 && !logs.includes('Local:'); index++) { assert.equal(server.exitCode, null, logs); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.match(logs, /Local:/, logs);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage(); const errors: string[] = []; const external: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      page.on('request', (request: any) => { if (!request.url().startsWith(origin)) external.push(request.url()); });
      let status = 200; let body: unknown = corrected; let wait: Promise<void> | undefined;
      const requests: any[] = [];
      await page.route('**/api/realtime/verb-writing', async (route: any) => {
        requests.push(route.request().postDataJSON());
        const answer = { status, json: body };
        if (wait) await wait;
        await route.fulfill(answer).catch(() => {});
      });
      await page.goto(`${origin}/src/features/verbs/__fixtures__/writing-preview.html?theme=${viewport.width === 390 ? 'dark' : 'light'}`, { waitUntil: 'networkidle' });
      const toggle = page.getByRole('button', { name: 'Escribe otros ejemplos', exact: true });
      const field = page.getByRole('textbox', { name: 'Tu frase con bet', exact: true });
      const result = page.locator('.verb-practice-result');
      assert.equal(await field.count(), 0); assert.equal(requests.length, 0);
      await toggle.click(); await field.waitFor(); assert.equal(await field.evaluate((element: HTMLElement) => element === document.activeElement), true);
      assert.equal(await field.getAttribute('lang'), 'en');
      const submit = page.locator('.verb-practice-submit');
      assert.equal(await submit.isDisabled(), true);
      assert.equal(await page.locator('.writing-practice').count(), 1, 'Verb practice uses the shared composer');
      assert.equal(await submit.innerText(), 'Corregir'); assert.equal(await submit.locator('svg').count(), 0);
      assert.equal(await page.locator('.verb-practice-optional, .verb-practice-subtitle, .verb-practice-guidance').count(), 0);
      const count = page.locator('.writing-character-count'); assert.equal(await count.count(), 0);
      const initialHeight = await field.evaluate((element: HTMLTextAreaElement) => element.getBoundingClientRect().height);
      const fieldStyle = await field.evaluate((element: HTMLTextAreaElement) => {
        const style = getComputedStyle(element);
        return { rows: element.rows, radius: style.borderRadius, border: style.borderTopWidth, background: style.backgroundColor,
          underline: Number.parseFloat(getComputedStyle(element.closest('.writing-line-field')!).borderBottomWidth) > 0 };
      });
      assert.deepEqual(fieldStyle, { rows: 1, radius: '0px', border: '0px', background: 'rgba(0, 0, 0, 0)', underline: true });
      await field.fill('First line.'); await field.press('Enter'); await field.pressSequentially('Second line.');
      assert.equal(await field.inputValue(), 'First line.\nSecond line.');
      assert.ok(await field.evaluate((element: HTMLTextAreaElement) => element.getBoundingClientRect().height) > initialHeight, 'The writing line grows for multiline input');
      await field.fill('Short.');
      assert.equal(await field.evaluate((element: HTMLTextAreaElement) => element.getBoundingClientRect().height), initialHeight);
      const colors = new Map<string, string>();
      for (const [length, level] of [[799, null], [800, 'normal'], [899, 'normal'], [900, 'warning'], [949, 'warning'], [950, 'danger']] as const) {
        await field.fill('word '.repeat(Math.ceil(length / 5)).slice(0, length));
        assert.equal((await field.inputValue()).length, length);
        if (!level) assert.equal(await count.count(), 0, 'The character count remains hidden below 800');
        else {
          assert.equal(await count.innerText(), `${length}/1000`); assert.equal(await count.getAttribute('data-level'), level);
          const color = await count.evaluate((element: HTMLElement) => getComputedStyle(element).color);
          if (colors.has(level)) assert.equal(color, colors.get(level)); else colors.set(level, color);
        }
        assert.equal(await field.evaluate((element: HTMLTextAreaElement) => element.scrollHeight <= element.clientHeight + 1), true);
        assert.equal(requests.length, 0, 'Length changes never dispatch coaching');
      }
      assert.equal(new Set(colors.values()).size, 3, 'Normal, warning and danger counts have distinct colors');
      await field.fill('x'.repeat(1001)); assert.equal((await field.inputValue()).length, 1000);
      await field.fill('She betting on her team.');
      assert.equal(await count.count(), 0, 'A shorter draft hides the counter again');
      await page.waitForTimeout(800); assert.equal(requests.length, 0, 'Typing never requests a correction');
      await submit.click(); await result.waitFor();
      assert.equal(await result.getAttribute('data-status'), 'needs-revision');
      assert.equal(await field.inputValue(), 'She betting on her team.', 'Model suggestions never overwrite the learner draft');
      await assertCorrection(result, 'She betting on her team.', corrected.correctedSentence!);
      assert.equal(await submit.isDisabled(), true, 'Unchanged successful drafts cannot make repeated paid requests');
      assert.deepEqual(requests[0], { identity: { sessionId: 'writing-session-1', exerciseId: 'writing-exercise-1', generation: 0 }, verbId: 'bet', draft: 'She betting on her team.' });
      await field.fill('She is betting on her team.'); await result.waitFor({ state: 'detached' }); body = correct;
      await field.press('Control+Enter'); await result.waitFor();
      assert.equal(await result.getAttribute('data-status'), 'correct'); assert.equal(await result.locator('.writing-correction').count(), 0);
      assert.equal(requests.length, 2);
      await field.fill('She betting on her team.'); await submit.click(); await result.waitFor();
      assert.equal(requests.length, 2, 'Returning to a previously reviewed draft reuses only local feedback');
      assert.equal(await result.getAttribute('data-status'), 'needs-revision');
      const geometry = await page.evaluate(() => {
        const input = document.querySelector('textarea')!.getBoundingClientRect();
        const output = document.querySelector('.verb-practice-result')!.getBoundingClientRect();
        return { below: output.top >= input.bottom, fits: document.documentElement.scrollWidth <= innerWidth };
      });
      assert.deepEqual(geometry, { below: true, fits: true });
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Writing practice reflows at enlarged text size');
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      body = edited; await field.fill('i has a bok'); await submit.click(); await result.waitFor();
      await assertCorrection(result, 'i has a bok', 'I have a book.');
      assert.ok(await result.locator('.writing-correction del').count() > 0);
      assert.ok(await result.locator('.writing-correction ins').count() > 0);
      assert.equal(await result.getByText(edited.explanation, { exact: true }).count(), 1);
      assert.equal(await field.inputValue(), 'i has a bok', 'Case, agreement, spelling and punctuation suggestions leave the original draft editable');
      if (viewport.width === 390) await page.screenshot({ path: '/tmp/lang-lessons-verb-writing-mobile.png', fullPage: true });

      // A delayed correction cannot attach to an edited draft or a replacement identity.
      let release!: () => void;
      wait = new Promise<void>(resolve => { release = resolve; }); body = corrected;
      await field.fill('I bet yesterday.'); await submit.click(); await page.waitForFunction(() => document.querySelector('.verb-practice-submit')?.textContent?.includes('Corrigiendo'));
      const pendingCount = requests.length;
      await field.fill('We bet yesterday.'); release(); wait = undefined;
      await page.waitForTimeout(100); assert.equal(await result.count(), 0); assert.equal(await field.inputValue(), 'We bet yesterday.');
      assert.equal(requests.length, pendingCount);

      status = 503; await submit.click(); await page.getByRole('alert').waitFor();
      assert.equal(await field.inputValue(), 'We bet yesterday.');
      const failedCount = requests.length; await page.waitForTimeout(150); assert.equal(requests.length, failedCount, 'Failures are never automatically retried');
      status = 200; body = { status: 'off-topic', correctedSentence: null, explanation: 'Probá usar bet en tu propia frase.' };
      await page.getByRole('button', { name: 'Corregir', exact: true }).click(); await result.waitFor();
      assert.equal(await result.getAttribute('data-status'), 'off-topic');

      wait = new Promise<void>(resolve => { release = resolve; }); body = corrected;
      await field.fill('Another draft with bet.'); await submit.click();
      await page.locator('.verb-practice-announcement').getByText('Revisando tu frase…').waitFor();
      await toggle.click(); release(); wait = undefined;
      await toggle.click(); await field.waitFor(); await page.waitForTimeout(80);
      assert.equal(await result.count(), 0, 'Closing the optional practice invalidates its pending response');
      assert.equal(await field.inputValue(), 'Another draft with bet.');

      await page.getByText('Fixture controls', { exact: true }).click();
      for (const action of ['Next exercise', 'Switch account', 'Advance generation']) {
        wait = new Promise<void>(resolve => { release = resolve; });
        await field.fill(`Pending ${action} with bet.`); await submit.click();
        await page.locator('.verb-practice-announcement').getByText('Revisando tu frase…').waitFor();
        await page.getByRole('button', { name: action, exact: true }).click(); release(); wait = undefined;
        assert.equal(await field.count(), 0, 'Replacement identity collapses optional practice');
        await toggle.click(); await field.waitFor(); await page.waitForTimeout(80);
        assert.equal(await field.inputValue(), ''); assert.equal(await result.count(), 0);
      }

      // Composition cannot trigger a shortcut request before the IME commits.
      const beforeComposition = requests.length;
      await field.dispatchEvent('compositionstart'); await field.fill('I bet again.');
      await field.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, keyCode: 229 });
      assert.equal(await submit.isDisabled(), true); assert.equal(requests.length, beforeComposition);
      await field.dispatchEvent('compositionend');
      body = { status: 'uncertain', correctedSentence: null, explanation: 'Agregá un poco más de contexto para que pueda orientarte.' };
      await submit.click(); await result.waitFor(); assert.equal(await result.getAttribute('data-status'), 'uncertain');
      await field.fill('Malformed coaching.'); body = { status: 'correct', correctedSentence: 'Invented rewrite', explanation: 'Invalid response.' };
      await submit.click(); await page.getByRole('alert').waitFor(); assert.equal(await result.count(), 0, 'Malformed model output is not displayed');
      await page.getByRole('button', { name: 'Unmount practice', exact: true }).click(); assert.equal(await toggle.count(), 0);
      await page.getByRole('button', { name: 'Mount practice', exact: true }).click(); await toggle.click(); assert.equal(await field.inputValue(), '');

      await page.getByRole('button', { name: 'Switch language', exact: true }).click();
      await toggle.click(); const frenchField = page.getByRole('textbox');
      assert.equal(await frenchField.getAttribute('lang'), 'fr'); assert.equal(await frenchField.getAttribute('placeholder'), 'Écris ta propre phrase…');
      await frenchField.fill('Je suis chez moi.'); body = correct; await submit.click(); await result.waitFor();
      assert.equal(requests.at(-1).verbId.startsWith('fr-'), true);
      assert.equal(requests.at(-1).draft, 'Je suis chez moi.');
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      await context.close();
      console.log(JSON.stringify({ viewport, status: 'passed', evidence: 'actual Chromium rendering; mocked coaching responses only' }));
    }
  } finally {
    await browser?.close(); server.kill('SIGTERM');
    await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', () => resolve()); });
  }
});
