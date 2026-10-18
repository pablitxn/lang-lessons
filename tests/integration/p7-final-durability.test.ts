import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
test('P7 F5 remediation: later results and usage persist across reload despite stalled network', { timeout: 60000 }, async () => {
 const { chromium } = createRequire(import.meta.url)('playwright');
 const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--port','5208','--strictPort']);
 let log = ''; server.stdout.on('data', c => log += c); server.stderr.on('data', c => log += c);
 let browser: any;
 try {
  for(let i=0;i<100&&!log.includes('Local:');i++) await new Promise(r=>setTimeout(r,50));
  assert.match(log,/Local:/);
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
  const page=await browser.newPage();
  await page.addInitScript('globalThis.__name = value => value');
  await page.route('**/api/**', (r:any)=>r.fulfill({json:{accountsEnabled:false}}));
  await page.goto('http://127.0.0.1:5208');
  const before=await page.evaluate(async()=>{
   const progressPath='/src/features/progress/pending-progress-store.ts';
   const queuePath='/src/features/progress/queued-progress-sink.ts';
   const usagePath='/src/features/progress/written-usage-store.ts';
   const usageQueuePath='/src/features/progress/written-usage-queue.ts';
   const {createIndexedDbProgressStore}=await import(progressPath);
   const {createQueuedProgressSink}=await import(queuePath);
   const {createIndexedDbWrittenUsageStore}=await import(usagePath);
   const {createWrittenUsageQueue}=await import(usageQueuePath);
   const scope={userId:'reviewer',sessionId:'session'};
   const store=createIndexedDbProgressStore(); const usageStore=createIndexedDbWrittenUsageStore();
   let sent=false, usageSent=false;
   const q=createQueuedProgressSink({scope,store,isCurrentUser:()=>true,send:()=>{sent=true;return new Promise(()=>{});},readFence:async()=>({sessionId:'session',journalRevision:0})});
   const u=createWrittenUsageQueue({scope,store:usageStore,streamId:'stream',isCurrentUser:()=>true,written:()=>{usageSent=true;return new Promise(()=>{});}});
   const event=(n:number)=>({schemaVersion:1,eventId:`e${n}`,kind:'attempt-result',source:'typed',trust:'client-reported',result:'accepted',ref:{sessionId:'session',exerciseId:'exercise',generation:0,obligation:'spelling:past',attemptId:`a${n}`,revision:n}});
   void q.submit([event(1)]); void u.record('visible');
   while(!sent||!usageSent) await new Promise(r=>setTimeout(r,10));
   void q.submit([event(2)]); void u.record('input');
   await new Promise(r=>setTimeout(r,100));
   return {persisted:(await store.list(scope)).map((e:any)=>e.eventId),usage:(await usageStore.list(scope)).map((r:any)=>r.kind),unsaved:q.getSnapshot().unsaved,usageUnsaved:u.getSnapshot().unsaved};
  });
  assert.deepEqual(before,{persisted:['e1','e2'],usage:['visible','input'],unsaved:0,usageUnsaved:0});
  await page.reload();
  const after=await page.evaluate(async()=>{
   const p='/src/features/progress/pending-progress-store.ts';const u='/src/features/progress/written-usage-store.ts';
   const {createIndexedDbProgressStore}=await import(p);const {createIndexedDbWrittenUsageStore}=await import(u);
   const scope={userId:'reviewer',sessionId:'session'};const store=createIndexedDbProgressStore(), usageStore=createIndexedDbWrittenUsageStore();
   const result={persisted:(await store.list(scope)).map((e:any)=>e.eventId),usage:(await usageStore.list(scope)).map((r:any)=>r.kind)};
   await store.close();await usageStore.close();return result;
  });
  assert.deepEqual(after,{persisted:['e1','e2'],usage:['visible','input']});
  console.log('Observed durable recovery:',JSON.stringify({before,after}));
 } finally {await browser?.close();if(server.exitCode===null)await new Promise<void>(r=>{server.once('exit',()=>r());server.kill('SIGTERM');});}
});
