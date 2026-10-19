import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { validateProfileImage } from '../server/accounts/profile';

test('profile settings save and photo lifetimes reject duplicate and stale work in a real browser', { skip: process.env.PROFILE_SETTINGS_BROWSER !== '1', timeout: 60_000 }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const port = 5214; const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort']);
  let output = ''; server.stdout.on('data', chunk => output += chunk); server.stderr.on('data', chunk => output += chunk);
  let browser: any;
  try {
    for (let i = 0; i < 100 && !output.includes('Local:'); i++) { assert.equal(server.exitCode, null, output); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.match(output, /Local:/);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.goto(origin + '/tests/helpers/profile-settings.html');
    const name = page.getByRole('textbox', { name: 'Name', exact: true });
    const save = page.getByRole('button', { name: 'Save profile', exact: true });
    await name.waitFor(); assert.equal(await save.isDisabled(), true);
    assert.equal(await page.getByLabel('Profile photo', { exact: true }).isVisible(), false);
    await page.getByRole('button', { name: 'Choose photo', exact: true }).waitFor();
    await name.fill('  Pablo  '); await save.dblclick();
    assert.equal(await page.evaluate(() => (window as any).profileFixture.saves.length), 1);
    assert.equal(await name.isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Cancel changes' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Choose photo', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => (window as any).profileFixture.saves[0].input.name), 'Pablo');
    await page.evaluate(() => (window as any).profileFixture.resolve());
    await page.getByText('Profile saved.', { exact: true }).waitFor();
    assert.equal(await name.inputValue(), 'Pablo'); assert.equal(await save.isDisabled(), true);
    assert.equal(await page.evaluate(() => (window as any).profileFixture.updates.length), 1);

    const photo = Buffer.from(await page.evaluate(() => (window as any).profileFixture.photo()), 'base64');
    const upload = page.getByLabel('Profile photo', { exact: true });
    await upload.setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: photo });
    const preview = page.getByRole('img', { name: 'Your profile photo', exact: true }); await preview.waitFor();
    await page.getByRole('button', { name: 'Change photo', exact: true }).waitFor();
    const encoded = await preview.getAttribute('src'); assert.equal(validateProfileImage(encoded), encoded);
    assert.equal(await preview.evaluate((element: HTMLImageElement) => element.naturalWidth), 512);
    assert.equal(await preview.evaluate((element: HTMLImageElement) => element.naturalHeight), 256);
    await page.getByRole('button', { name: 'Cancel changes' }).click(); assert.equal(await preview.count(), 0);
    await upload.setInputFiles({ name: 'not-a-photo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await page.getByRole('alert').filter({ hasText: 'Choose a JPG, PNG or WebP photo.' }).waitFor();
    assert.equal(await save.isDisabled(), true);

    await page.evaluate(() => (window as any).profileFixture.holdPhotos());
    await upload.setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: photo });
    await page.getByText('Preparing photo…', { exact: true }).waitFor();
    await page.waitForFunction(() => (window as any).profileFixture.heldCount() > 0);
    await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
    await page.evaluate(() => (window as any).profileFixture.releasePhotos());
    assert.equal(await preview.count(), 0); assert.equal(await save.isDisabled(), true);

    await name.fill('Retry draft'); await save.click(); await page.evaluate(() => (window as any).profileFixture.reject());
    await page.getByRole('alert').filter({ hasText: 'We couldn’t confirm the save.' }).waitFor();
    assert.equal(await name.inputValue(), 'Retry draft'); assert.equal(await name.isEnabled(), true);
    assert.equal(await page.getByText('Private server detail', { exact: false }).count(), 0);
    await save.click();
    await page.evaluate(() => (window as any).profileFixture.unmount());
    assert.equal(await page.evaluate(() => (window as any).profileFixture.saves.at(-1).signal.aborted), true);
    await page.evaluate(() => { (window as any).profileFixture.resolve(); (window as any).profileFixture.mount(); });
    await name.waitFor(); assert.equal(await name.inputValue(), 'Student');
    assert.equal(await page.evaluate(() => (window as any).profileFixture.updates.length), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server.exitCode === null) await new Promise<void>(resolve => { server.once('exit', () => resolve()); server.kill('SIGTERM'); });
  }
});
