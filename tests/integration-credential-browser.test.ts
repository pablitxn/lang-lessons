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

test('administrator issues a manual synthetic setup link and can dismiss it without durable storage', { skip: process.env.PERSISTED_BROWSER !== '1', timeout: 60000 }, async () => {
  const { chromium }=createRequire(import.meta.url)('playwright'); const port=5214; const origin=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort']); let output='';
  server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);let browser:any;
  try {
    for(let i=0;i<100&&!output.includes('Local:');i++)await new Promise(resolve=>setTimeout(resolve,50));assert.match(output,/Local:/);
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});const context=await browser.newContext();
    const token=randomBytes(32).toString('base64url');let issued=0;
    await context.route('**/*',async(route:any)=>{
      const request=route.request();const url=new URL(request.url());assert.equal(url.origin,origin);
      if(url.pathname==='/api/learning/config')return route.fulfill({status:200,json:{accountsEnabled:true}});
      if(url.pathname==='/api/me')return route.fulfill({status:200,json:{id:'admin',role:'administrator',capabilities:{granted:['users:list','users:manage']}}});
      if(url.pathname==='/api/learning/users')return route.fulfill({status:200,json:{items:[{id:'student',role:'student',disabled:false,revision:0}],nextCursor:null}});
      if(url.pathname==='/api/learning/credential-links/issue'){
        issued++;assert.deepEqual(request.postDataJSON(),{userId:'student',purpose:'setup'});
        return route.fulfill({status:200,json:{link:`${origin}/account/credentials#token=${token}`,expiresAt:new Date(Date.now()+1800000).toISOString()}});
      }
      return route.continue();
    });
    const page=await context.newPage();await page.goto(origin);
    const section=page.getByRole('region',{name:'Credential links for student'});
    await section.getByRole('button',{name:'Issue setup link',exact:true}).click();
    await section.getByText('No email was sent.',{exact:false}).waitFor();
    assert.equal(await section.getByLabel('Private credential link').inputValue(),`${origin}/account/credentials#token=${token}`);
    assert.equal(issued,1);await section.getByRole('button',{name:'Dismiss link'}).click();assert.equal(await section.getByLabel('Private credential link').count(),0);
    assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage})).then((s:string)=>s.includes(token)),false);
    await context.close();
  }finally{await browser?.close();if(server.exitCode===null)await new Promise<void>(resolve=>{server.once('exit',()=>resolve());server.kill('SIGTERM');});}
});
