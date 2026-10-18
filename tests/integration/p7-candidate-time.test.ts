import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRuntime } from '../../src/app/session-runtime';
import { createSessionLifecycle } from '../../src/app/session-lifecycle';
import { createMockVoiceAdapter } from '../../src/voice/mock';

test('P7 reproduction: cleanup and reactivation loses orientative timing subscription', async () => {
 async function run(reactivate:boolean) {
  const runtime=createSessionRuntime(createMockVoiceAdapter(),'s');let reported:any;
  const snapshot=()=>({sessionId:'s',mode:'verb-image' as const,status:'open' as const,revision:0});
  const lifecycle=createSessionLifecycle(runtime,{sessions:{create:async()=>snapshot(),read:async()=>snapshot(),startCall:async()=>({session:snapshot(),segment:{sessionId:'s',segmentId:'c',connectionEpoch:1}}),stopCall:async()=>snapshot(),confirmClose:async()=>{throw new Error('unused');},readClose:async()=>null},progress:{flush:async()=>({sessionId:'s',journalRevision:0})},reportCall:async(_segment,intervals)=>{reported=intervals;},freezeWrites(){},releasePreparation(){},operationId:()=>crypto.randomUUID(),isCurrent:()=>true,navigate(){}});
  if(reactivate){lifecycle.dispose();lifecycle.activate();}
  await lifecycle.start();assert.equal(runtime.getSnapshot().state,'ready');
  await new Promise(r=>setTimeout(r,10));await lifecycle.stop();lifecycle.dispose();return reported;
 }
 assert.equal((await run(false)).length,1);
 assert.deepEqual(await run(true),[],'the same mounted lifecycle reports zero after StrictMode effect cleanup/setup');
});
