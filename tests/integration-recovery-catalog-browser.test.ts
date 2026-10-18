import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('recovery catalog retains local candidates when server discovery fails and aborts pagination on unmount',
  { skip: process.env.RECOVERY_BROWSER !== '1', timeout: 60000 }, async () => {
    const { chromium } = createRequire(import.meta.url)('playwright');
    const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5209', '--strictPort']);
    let output = ''; server.stdout.on('data', chunk => output += chunk); server.stderr.on('data', chunk => output += chunk);
    let browser: any;
    try {
      for (let i = 0; i < 100 && !output.includes('Local:'); i++) await new Promise(resolve => setTimeout(resolve, 50));
      assert.match(output, /Local:/);
      browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
        env: { ...process.env, XDG_CONFIG_HOME: '/tmp/root-recovery-config', XDG_CACHE_HOME: '/tmp/root-recovery-cache' } });
      const page = await browser.newPage(); const errors: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      await page.addInitScript('globalThis.__name = value => value');
      await page.route('**/api/**', (route: any) => route.fulfill({ json: { accountsEnabled: false } }));
      await page.goto('http://127.0.0.1:5209');
      await page.evaluate(async () => {
        const reactPath = '/node_modules/.vite/deps/react.js'; const rootPath = '/node_modules/.vite/deps/react-dom_client.js';
        const catalogPath = '/src/app/RecoveryCatalog.tsx'; const recoveryPath = '/src/app/session-recovery.ts';
        const { createElement } = (await import(reactPath)).default; const { createRoot } = (await import(rootPath)).default;
        const { RecoveryCatalog } = await import(catalogPath); const { createSessionRecovery } = await import(recoveryPath);
        const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
        const fixture = window as unknown as { recoveryFixture: { serverFails: boolean; moreSignal: AbortSignal | null; unmount(): void; render(): void } };
        const state: typeof fixture.recoveryFixture = fixture.recoveryFixture = { serverFails: true, moreSignal: null, unmount: () => root.unmount(), render: () => {} };
        state.render = () => root.render(createElement(RecoveryCatalog, { ports: {
          list: async (cursor: string | null, signal: AbortSignal) => {
            if (state.serverFails) throw new Error('Synthetic offline discovery');
            if (cursor) { state.moreSignal = signal; return new Promise(() => {}); }
            return { items: [{ sessionId: 'local', mode: 'sentence', status: 'open', revision: 0 }], nextCursor: 'more' };
          },
          pending: async () => ['local'],
          controller: (sessionId: string) => createSessionRecovery({
            identity: { accountId: 'fixture', sessionId }, isCurrent: () => true, subscribeInvalidation: () => () => {},
            read: async () => ({ accountId: 'fixture', sessionId, session: { sessionId, mode: 'sentence', status: 'open', revision: 0 }, hadConnectedCall: false, feedback: 'not-requested' }),
            preparePractice: async () => { throw new Error('Unused fixture action'); }, resume: () => {},
            retryFeedback: async () => { throw new Error('Unused fixture action'); }, operationId: () => 'fixture-operation',
          }),
        } }));
        state.render();
      });
      await page.getByText('Saved practice could not be loaded.', { exact: false }).waitFor();
      await page.getByRole('button', { name: 'Resume session', exact: true }).waitFor();
      assert.equal(await page.getByText('No unfinished sessions or pending device results found.').count(), 0);
      await page.evaluate(() => { const state = (window as any).recoveryFixture; state.serverFails = false; state.render(); });
      const more = page.getByRole('button', { name: 'More saved sessions', exact: true }); await more.waitFor();
      assert.equal(await page.getByRole('region', { name: 'Interrupted session recovery', exact: true }).count(), 1, 'server/local overlap is deduplicated');
      await more.click();
      await page.waitForFunction(() => Boolean((window as any).recoveryFixture.moreSignal));
      const aborted = await page.evaluate(() => { const state = (window as any).recoveryFixture; state.unmount(); return state.moreSignal.aborted; });
      assert.equal(aborted, true); assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      if (server.exitCode === null) await new Promise<void>(resolve => { server.once('exit', () => resolve()); server.kill('SIGTERM'); });
    }
  });
