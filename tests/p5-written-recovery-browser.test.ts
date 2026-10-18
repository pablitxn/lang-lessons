import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

test('Chromium reload restores local written work and replays exact pending events after held network', {skip:process.env.P5_BROWSER!=='1',timeout:60000},async()=>{
 const {chromium}=createRequire(import.meta.url)('playwright');
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port','5218','--strictPort']);let log='';let browser:any;
 server.stdout.on('data',c=>log+=c);server.stderr.on('data',c=>log+=c);
 try {
  for(let i=0;i<100&&!log.includes('Local:');i++)await new Promise(r=>setTimeout(r,50));assert.match(log,/Local:/);
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,env:{...process.env,XDG_CONFIG_HOME:'/tmp/p5-recovery-config',XDG_CACHE_HOME:'/tmp/p5-recovery-cache'}});
  const page=await browser.newPage();await page.addInitScript('globalThis.__name=value=>value');
  await page.route('**/api/**',(r:any)=>r.fulfill({json:{accountsEnabled:false}}));await page.goto('http://127.0.0.1:5218');
  const before=await page.evaluate(async()=>{
   const sp='/src/features/progress/written-snapshot-store.ts', pp='/src/features/progress/pending-progress-store.ts',qp='/src/features/progress/queued-progress-sink.ts',ss='/src/features/sentences/session.ts',vp='/src/voice/index.ts';
   const {createIndexedDbWrittenSnapshotStore}=await import(sp),{createIndexedDbProgressStore}=await import(pp),{createQueuedProgressSink}=await import(qp),{createSentenceSession}=await import(ss),{createRealtimeVoiceAdapter}=await import(vp);
   const scope={userId:'user',sessionId:'session'};const store=createIndexedDbWrittenSnapshotStore();const pending=createIndexedDbProgressStore();
   let started=false;const queue=createQueuedProgressSink({scope,store:pending,isCurrentUser:()=>true,send:()=>{started=true;return new Promise(()=>{});},readFence:async()=>({sessionId:'session',journalRevision:0})});
   const session=createSentenceSession({voice:createRealtimeVoiceAdapter(),sessionId:scope.sessionId,writtenPracticeUserId:scope.userId,difficulty:{grammar:1,vocabulary:1},random:()=>0,progressSink:queue,onComplete:()=>{}});
   const answer=session.getSnapshot().assessment.context.sentence.alternatives[0];session.editWritten(answer.text);session.finalizeWritten();
   while(!started)await new Promise(r=>setTimeout(r,10));session.selectWrittenTense(answer.tense);
   const snapshot=session.snapshotWrittenPractice();await store.save(scope,snapshot);
   for(let i=0;i<200&&(await pending.list(scope)).length!==2;i++)await new Promise(r=>setTimeout(r,10));
   const events=await pending.list(scope);const wrongUser=await store.load({...scope,userId:'other'},'sentence'),wrongSession=await store.load({...scope,sessionId:'other'},'sentence');
   const result={snapshot,events,wrongUser,wrongSession,unsaved:queue.getSnapshot().unsaved};session.dispose();await store.close();return result;
  });
  assert.equal(before.events.length,2);assert.equal(before.unsaved,0);assert.equal(before.wrongUser,null);assert.equal(before.wrongSession,null);
  await page.reload();
  const after=await page.evaluate(async()=>{
   const sp='/src/features/progress/written-snapshot-store.ts', pp='/src/features/progress/pending-progress-store.ts',qp='/src/features/progress/queued-progress-sink.ts',ss='/src/features/sentences/session.ts',vp='/src/voice/index.ts';
   const {createIndexedDbWrittenSnapshotStore}=await import(sp),{createIndexedDbProgressStore}=await import(pp),{createQueuedProgressSink}=await import(qp),{createSentenceSession}=await import(ss),{createRealtimeVoiceAdapter}=await import(vp);
   const scope={userId:'user',sessionId:'session'},store=createIndexedDbWrittenSnapshotStore(),pending=createIndexedDbProgressStore();const sent:any[]=[];
   const queue=createQueuedProgressSink({scope,store:pending,isCurrentUser:()=>true,send:async(events:any[])=>{sent.push(...events);return {status:'committed',acknowledgments:events.map((e,i)=>({eventId:e.eventId,status:'accepted',committedRevision:i+1})),current:{sessionId:'session',journalRevision:events.length}};},readFence:async()=>({sessionId:'session',journalRevision:2})});
   const session=createSentenceSession({voice:createRealtimeVoiceAdapter(),sessionId:scope.sessionId,writtenPracticeUserId:scope.userId,difficulty:{grammar:1,vocabulary:1},progressSink:queue,onComplete:()=>{}});
   const saved=await store.load(scope,'sentence'),restored=session.restoreWrittenPractice(saved),snapshot=session.snapshotWrittenPractice();
   await queue.flush();const remaining=(await pending.list(scope)).length;
   const result={restored,snapshot,sent,remaining,evidence:session.getSnapshot().assessment.evidence,muted:session.getSnapshot().muted};session.dispose();await store.close();await pending.close();return result;
  });
  assert.equal(after.restored,true);assert.deepEqual(after.snapshot,before.snapshot);assert.deepEqual(after.sent,before.events);assert.equal(after.remaining,0);assert.deepEqual(after.evidence,{});assert.equal(after.muted,true);
  await page.evaluate(async()=>{
   const rp='/node_modules/.vite/deps/react.js',dp='/node_modules/.vite/deps/react-dom_client.js',lp='/src/features/sentences/SentenceLesson.tsx',cp='/src/contracts/index.ts',vp='/src/voice/index.ts',sp='/src/features/progress/written-snapshot-store.ts';
   const {default:React}=await import(rp),{default:ReactDOM}=await import(dp),{SentenceLesson}=await import(lp),{DEFAULT_SETTINGS}=await import(cp),{createRealtimeVoiceAdapter}=await import(vp),{createIndexedDbWrittenSnapshotStore}=await import(sp);
   const store=createIndexedDbWrittenSnapshotStore();const saved=await store.load({userId:'user',sessionId:'session'},'sentence');await store.close();
   const target=document.createElement('div');target.id='p5-recovery-render';document.body.append(target);
   ReactDOM.createRoot(target).render(React.createElement(SentenceLesson,{voice:createRealtimeVoiceAdapter(),sessionId:'session',settings:{...DEFAULT_SETTINGS,difficulty:{grammar:1,vocabulary:1}},onComplete:()=>{},writtenPractice:{userId:'user',initialSnapshot:saved,register:()=>()=>{}}}));
  });
  const field=page.locator('#p5-recovery-render').getByRole('textbox',{name:'English translation',exact:true});await field.waitFor();
  assert.equal(await field.inputValue(),before.snapshot.draft);
  assert.equal(await page.locator('#p5-recovery-render [data-exercise-id]').getAttribute('data-exercise-id'),before.snapshot.identity.exerciseId);
  await page.locator('#p5-recovery-render').getByText('Translation checked.',{exact:true}).waitFor();
 } finally {await browser?.close();if(server.exitCode===null)await new Promise<void>(r=>{server.once('exit',()=>r());server.kill('SIGTERM');});}
});
