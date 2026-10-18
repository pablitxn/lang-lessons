import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createSessionRecovery } from '../../src/app/session-recovery';
import { createRealtimeServer } from '../../server/realtime';
import type { BrokerAuthority } from '../../server/broker/authority';
const tick = () => new Promise<void>(r => setImmediate(r));
test('P7 reproduction: asynchronous resume is marked complete before reconciliation and rejection is not surfaced', async () => {
 let reject!: (e: Error) => void;
 const reconciliation = new Promise<void>((_,r) => { reject=r; });
 // Observe externally so the test process does not receive an unhandled rejection.
 const observed = reconciliation.catch(() => {});
 const recovery=createSessionRecovery({identity:{accountId:'actor',sessionId:'s'},isCurrent:()=>true,subscribeInvalidation:()=>()=>{},
 read:async()=>({accountId:'actor',sessionId:'s',session:{sessionId:'s',mode:'verb-image',status:'open',revision:0},hadConnectedCall:false,feedback:'not-requested'}),
 preparePractice:async()=>({lifecycle:{dispose(){},getSnapshot:()=>({frozen:false})} as any,release(){}}),
 resume:()=>reconciliation,retryFeedback:async()=>{throw new Error('unused');},operationId:()=> 'op'});
 await recovery.load(); await recovery.resume();
 assert.equal(recovery.getSnapshot().phase,'resumed');
 reject(new Error('Server denied reconcile')); await observed; await tick();
 assert.equal(recovery.getSnapshot().phase,'resumed'); assert.equal(recovery.getSnapshot().error,''); recovery.dispose();
});
test('P7 reproduction: cancel during awaited broker reservation still dispatches provider creation', async()=>{
 let release!:()=>void;let reserved!:()=>void;const entered=new Promise<void>(r=>reserved=r);
 const barrier=new Promise<void>(r=>release=r);let calls=0;
 const authority:BrokerAuthority={authenticate:async()=>({userId:'actor'}),
 reserve:async(identity,segment,token)=>{reserved();await barrier;return {identity,segment:segment as any,tokenDigest:token};},
 isEnded:async()=>false,created:async()=>{},ended:async()=>{},rejected:async()=>{},authorizeRelease:async()=>{throw new Error('unused');}};
 const provider:typeof fetch=async input=>{if(String(input).endsWith('/hangup'))return new Response(null,{status:200});calls++;return new Response('v=0\r\n',{status:201,headers:{location:'/v1/realtime/calls/mock-call'}});};
 const origin='http://127.0.0.1:5200';const server=createRealtimeServer({enabled:true,apiKey:'mock-only',model:'fixture',allowedOrigins:[origin],maxDurationSeconds:600},provider,undefined,undefined,authority);
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
 let serverSawClose!:()=>void;const closed=new Promise<void>(r=>serverSawClose=r);
 server.on('request',(_req,res)=>res.once('close',serverSawClose));
 try{
  const abort=new AbortController();const response=fetch(`http://127.0.0.1:${address.port}/api/realtime/session`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({sdp:'v=0\r\n',segment:{sessionId:'s',segmentId:'c',connectionEpoch:1}}),signal:abort.signal}).catch(()=>null);
  await entered;abort.abort();await response;await closed;assert.equal(calls,0);release();
  for(let i=0;i<50&&calls===0;i++)await tick();assert.equal(calls,1);
 }finally{release();await tick();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
