import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
test('held network does not block durable progress/usage appends and reload replays original identities', { skip: process.env.P5_BROWSER !== '1', timeout: 60000 }, async () => {
 const { chromium } = createRequire(import.meta.url)('playwright');
 const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--port','5208','--strictPort']);
 let log = ''; server.stdout.on('data', c => log += c); server.stderr.on('data', c => log += c);
 let browser: any;
 try {
  for(let i=0;i<100&&!log.includes('Local:');i++) await new Promise(r=>setTimeout(r,50));
  assert.match(log,/Local:/);
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,env:{...process.env,XDG_CONFIG_HOME:'/tmp/p5-f5-config',XDG_CACHE_HOME:'/tmp/p5-f5-cache'}});
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
   let sent=false, usageSent=false, progressAcknowledged=false, usageAcknowledged=false;
   const q=createQueuedProgressSink({scope,store,isCurrentUser:()=>true,send:()=>{sent=true;return new Promise(()=>{});},readFence:async()=>({sessionId:'session',journalRevision:0})});
   const u=createWrittenUsageQueue({scope,store:usageStore,streamId:'stream',isCurrentUser:()=>true,written:()=>{usageSent=true;return new Promise(()=>{});}});
   const event=(n:number)=>({schemaVersion:1,eventId:`e${n}`,kind:'attempt-result',source:'typed',trust:'client-reported',result:'accepted',ref:{sessionId:'session',exerciseId:'exercise',generation:0,obligation:'spelling:past',attemptId:`a${n}`,revision:n}});
   void q.submit([event(1)]); void u.record('visible');
   while(!sent||!usageSent) await new Promise(r=>setTimeout(r,10));
   void q.submit([event(2)]).then(()=>{progressAcknowledged=true;}); void u.record('input').then(()=>{usageAcknowledged=true;});
   for(let i=0;i<200;i++){if((await store.list(scope)).length===2&&(await usageStore.list(scope)).length===2&&q.getSnapshot().unsaved===0&&u.getSnapshot().unsaved===0)break;await new Promise(r=>setTimeout(r,10));}
   return {progressAcknowledged,usageAcknowledged,persisted:(await store.list(scope)).map((e:any)=>e.eventId),usage:(await usageStore.list(scope)).map((r:any)=>r.kind),unsaved:q.getSnapshot().unsaved,usageUnsaved:u.getSnapshot().unsaved};
  });
  assert.deepEqual(before,{progressAcknowledged:false,usageAcknowledged:false,persisted:['e1','e2'],usage:['visible','input'],unsaved:0,usageUnsaved:0});
  await page.reload();
  const after=await page.evaluate(async()=>{
   const p='/src/features/progress/pending-progress-store.ts';const u='/src/features/progress/written-usage-store.ts';
   const {createIndexedDbProgressStore}=await import(p);const {createIndexedDbWrittenUsageStore}=await import(u);
   const scope={userId:'reviewer',sessionId:'session'};const store=createIndexedDbProgressStore(), usageStore=createIndexedDbWrittenUsageStore();
   const pending=await store.list(scope), observations=await usageStore.list(scope);
   const qp='/src/features/progress/queued-progress-sink.ts', uq='/src/features/progress/written-usage-queue.ts';
   const {createQueuedProgressSink}=await import(qp), {createWrittenUsageQueue}=await import(uq);
   const sent:string[]=[], usageSent:string[]=[];
   const queue=createQueuedProgressSink({scope,store,isCurrentUser:()=>true,
    send:async(events:any[])=>{sent.push(...events.map(e=>e.eventId));return {status:'committed',acknowledgments:events.map(e=>({eventId:e.eventId,status:e.eventId==='e1'?'duplicate':'accepted',committedRevision:e.eventId==='e1'?1:2})),current:{sessionId:'session',journalRevision:2}};},
    readFence:async()=>({sessionId:'session',journalRevision:2})});
   const usage=createWrittenUsageQueue({scope,store:usageStore,streamId:'stream',isCurrentUser:()=>true,
    written:async(row:any)=>{usageSent.push(row.eventId);return {eventId:row.eventId,sequence:row.sequence,intervalId:null,observedAt:'2026-10-18T12:00:00Z',status:row.sequence===1?'duplicate':'recorded'};}});
   await queue.flush();await usage.flush();
   const result={persisted:pending.map((e:any)=>e.eventId),usage:observations.map((r:any)=>r.kind),sequences:observations.map((r:any)=>r.sequence),sent,
    sameUsageIds:JSON.stringify(usageSent)===JSON.stringify(observations.map((r:any)=>r.eventId)),remaining:(await store.list(scope)).length,usageRemaining:(await usageStore.list(scope)).length};
   await store.close();await usageStore.close();return result;
  });
  assert.deepEqual(after,{persisted:['e1','e2'],usage:['visible','input'],sequences:[1,2],sent:['e1','e2'],sameUsageIds:true,remaining:0,usageRemaining:0});
  console.log('Durable held-network replay verified:',JSON.stringify({before,after}));
 } finally {await browser?.close();if(server.exitCode===null)await new Promise<void>(r=>{server.once('exit',()=>r());server.kill('SIGTERM');});}
});
