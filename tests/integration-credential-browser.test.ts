import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
test('shipped credential page clears fragment, honors policy, redeems synthetic input and never persists it', { skip: process.env.PERSISTED_BROWSER !== '1', timeout: 60000 }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright'); const port = 5213; const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort']); let output = '';
  server.stdout.on('data', c => output += c); server.stderr.on('data', c => output += c); let browser: any;
  try {
    for (let i=0;i<100&&!output.includes('Local:');i++) await new Promise(resolve=>setTimeout(resolve,50)); assert.match(output,/Local:/);
    browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true}); const context = await browser.newContext();
    const token = randomBytes(32).toString('base64url'); const password = randomUUID(); let redeemed = 0; const requests: string[] = [];
    await context.route('**/*',async (route: any) => {
      const request=route.request(); const url=new URL(request.url()); requests.push(request.url()); assert.equal(url.origin,origin);
      if (url.pathname==='/api/learning/credential-links/policy') return route.fulfill({status:200,json:{min:12,max:128}});
      if (url.pathname==='/api/learning/credential-links/redeem') {
        redeemed++; const body=request.postDataJSON(); assert.equal(body.token,token); assert.equal(body.password,password);
        return route.fulfill({status:200,json:{ok:true}});
      }
      return route.continue();
    });
    const page=await context.newPage(); const errors: string[]=[]; page.on('pageerror',(error:Error)=>errors.push(error.message));
    await page.goto(`${origin}/account/credentials#token=${token}`); await page.getByRole('heading',{name:'Set your password'}).waitFor();
    assert.equal(new URL(page.url()).hash,'');
    await page.getByLabel('New password',{exact:true}).fill(password); await page.getByLabel('Confirm password',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Save password',exact:true}).click(); await page.getByRole('status').filter({hasText:'Password saved'}).waitFor();
    assert.equal(redeemed,1); assert.ok(requests.every(url=>!url.includes(token)&&!url.includes(password)));
    assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
    assert.deepEqual(errors,[]);
    await page.reload(); await page.getByRole('alert').filter({hasText:'link is missing or invalid'}).waitFor();
    await context.close();
  } finally {await browser?.close(); if(server.exitCode===null) await new Promise<void>(resolve=>{server.once('exit',()=>resolve());server.kill('SIGTERM');});}
});
