const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// Same supplied Playwright/Chromium entry point as the current foundation helper.
// Real local SVG fetch/decode/render checks; no microphone, provider or TLS bypass.
(async () => {
  const verbs = JSON.parse(fs.readFileSync(path.join(__dirname, 'verbs.json'), 'utf8')).verbs;
  const ports = process.argv.slice(2);
  assert.ok(ports.length > 0);
  for (const port of ports) assert.match(port, /^\d{4,5}$/);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    env: { ...process.env, XDG_CONFIG_HOME: '/tmp/en-wp03-cues-browser-config', XDG_CACHE_HOME: '/tmp/en-wp03-cues-browser-cache' },
  });
  try {
    for (const port of ports) {
      const origin = `http://127.0.0.1:${port}`;
      const context = await browser.newContext();
      const page = await context.newPage();
      const failures = [];
      const externalRequests = [];
      page.on('pageerror', error => failures.push(error.message));
      page.on('request', request => { if (!request.url().startsWith(origin + '/')) externalRequests.push(request.url()); });
      await page.goto(origin + '/', { waitUntil: 'networkidle' });
      for (const verb of verbs) {
        const response = await context.request.get(origin + verb.image_cue.src);
        assert.equal(response.status(), 200, verb.id);
        assert.match(response.headers()['content-type'], /image\/svg\+xml/, verb.id);
        assert.equal(await response.text(), fs.readFileSync(path.join(__dirname, '../..', verb.image_cue.file), 'utf8'));
      }
      const render = async (width, columns) => {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(({ items, columns }) => {
          const style = document.createElement('style');
          style.textContent = `body{margin:0;background:#ecefe9;color:#173f48;font:14px system-ui}main{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:12px;padding:16px}figure{margin:0;min-width:0}img{display:block;width:100%;height:auto}figcaption{padding:6px 3px;line-height:1.4}`;
          document.head.replaceChildren(style);
          const main = document.createElement('main');
          for (const [index, item] of items.entries()) {
            const figure = document.createElement('figure');
            const img = document.createElement('img');
            img.src = item.image_cue.src;
            img.alt = item.image_cue.nonvisual_cue_es + ' ' + item.image_cue.context_es;
            const caption = document.createElement('figcaption');
            caption.textContent = `${index + 1}. ${item.image_cue.context_es}${item.image_cue.ambiguous ? ' (Contexto necesario.)' : ''}`;
            figure.append(img, caption);
            main.append(figure);
          }
          document.body.replaceChildren(main);
        }, { items: verbs, columns });
        await page.evaluate(async () => {
          await Promise.all([...document.images].map(image => image.decode()));
          for (const image of document.images) {
            if (image.naturalWidth !== 320 || image.naturalHeight !== 240) throw new Error('Unexpected SVG intrinsic dimensions');
            if (!image.alt) throw new Error('Missing nonvisual cue');
          }
          if (document.documentElement.scrollWidth > innerWidth) throw new Error('Asset review grid overflows viewport');
        });
      };
      for (const width of [320, 390, 844, 1024]) await render(width, width < 600 ? 1 : 3);
      if (process.env.SCREENSHOT_PATH && port === ports[0]) {
        await render(1280, 5);
        await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
      }
      assert.deepEqual(failures, []);
      assert.deepEqual(externalRequests, []);
      console.log(JSON.stringify({ status: 'passed', port, assets: verbs.length, checks: ['HTTP 200 and SVG MIME', 'served source equality', 'all SVG image decodes', '320/390/844/1024 viewport reflow', 'nonempty Spanish nonvisual cues', 'no external requests'], pageErrors: failures.length }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
