import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { createProviderCapture } from '../../server/provider-capture';
import { PhoenixTelemetry, readPhoenixConfig } from '../../server/telemetry';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
const policy = { version:'p7-synthetic', route:'phoenix', evidence:'authorized-transcripts', maxTextCharacters:16000 } as const;
const binding = { identity:{userId:'actor'}, tokenDigest:'private', segment:{sessionId:'s',segmentId:'seg',connectionEpoch:1} };
const event = (event_id:string, transcript:string) => ({type:'conversation.item.input_audio_transcription.completed',event_id,item_id:'i',content_index:0,transcript});
class Socket extends EventEmitter { terminate(){this.emit('close');} receive(value:unknown){this.emit('message',Buffer.from(JSON.stringify(value)));} }
const tick = () => new Promise<void>(r=>setImmediate(r));
test('P7 realistic loopback WebSocket frames export projected text only and isolate sessions',async()=>{
 const wss = new WebSocketServer({port:0,host:'127.0.0.1'}); await once(wss,'listening'); const address=wss.address(); assert.ok(address&&typeof address!=='string');
 const records:any[]=[]; const sockets:WebSocket[]=[]; const capture=createProviderCapture({policy,synthetic:true,sink:{async record(value){records.push(value);}},connect(){const socket=new WebSocket(`ws://127.0.0.1:${address.port}`,{maxPayload:65536});sockets.push(socket);return socket;}});
 try{
  for(const sessionId of ['s','other']){
   const connected=once(wss,'connection');const handle=capture.start({...binding,segment:{...binding.segment,sessionId}},'rtc_synthetic');const [peer]=await connected;
   peer.send(JSON.stringify({...event('same-id','Synthetic text'),audio:'MUST_NOT_EXPORT',sessionId:'spoofed'}));
   peer.send(JSON.stringify({type:'response.output_audio.delta',event_id:'audio',delta:'MUST_NOT_EXPORT'}));
   for(let i=0;i<100&&records.length<(sessionId==='s'?1:2);i++)await new Promise(r=>setTimeout(r,5));
   await handle.stop();
  }
  assert.deepEqual(records.map(x=>x.segment.sessionId),['s','other']); assert.doesNotMatch(JSON.stringify(records),/MUST_NOT_EXPORT|spoofed|private/);
 }finally{await capture.shutdown();for(const socket of sockets)socket.terminate();await new Promise<void>(r=>wss.close(()=>r()));}
});
test('P7 regression: JSON password and Basic authorization are removed before export',async()=>{
 const exporter=new InMemorySpanExporter(); const telemetry=new PhoenixTelemetry({endpoint:'http://127.0.0.1:9999/v1/traces',project:'synthetic'},exporter);
 const socket=new Socket();const capture=createProviderCapture({policy,synthetic:true,sink:telemetry.debugSink()!,connect:()=>socket});
 const password = `synthetic-${randomUUID()}`;
 const authorizationValue = Buffer.from(`synthetic-user:${randomUUID()}`).toString('base64');
 const transcript = `${JSON.stringify({ password })} Authorization: Basic ${authorizationValue}`;
 const handle=capture.start(binding,'rtc_synthetic');socket.receive(event('e',transcript));
 await handle.stop();await telemetry.flush();
 const text=JSON.stringify(exporter.getFinishedSpans().map(s=>s.attributes));
 assert.equal(text.includes(password),false);assert.equal(text.includes(authorizationValue),false);
 await capture.shutdown();await telemetry.shutdown();
});
test('P7 regression: shutdown waits for a previously stopped observer still draining',async()=>{
 const socket=new Socket();let release!:()=>void;const held=new Promise<void>(r=>release=r);let delivered=0;let entered!:()=>void;const started=new Promise<void>(r=>entered=r);
 const capture=createProviderCapture({policy,synthetic:true,connect:()=>socket,sink:{async record(){entered();await held;delivered++;}}});
 const handle=capture.start(binding,'rtc_synthetic');socket.receive(event('e','Synthetic text'));await started;
 const stopping=handle.stop();let shutdownDone=false;const shuttingDown=capture.shutdown().then(()=>{shutdownDone=true;});await tick();assert.equal(shutdownDone,false);
 release();await stopping;await shuttingDown;assert.equal(delivered,1);
});
test('P7 destination config rejects remote plaintext and URL credentials and respects SDK disable',()=>{
 assert.throws(()=>readPhoenixConfig({PHOENIX_COLLECTOR_ENDPOINT:'http://example.invalid'}));
 assert.throws(()=>readPhoenixConfig({PHOENIX_COLLECTOR_ENDPOINT:'https://user:pass@example.invalid'}));
 assert.equal(readPhoenixConfig({PHOENIX_COLLECTOR_ENDPOINT:'https://example.invalid',OTEL_SDK_DISABLED:'true'}),null);
 assert.equal(readPhoenixConfig({PHOENIX_COLLECTOR_ENDPOINT:'http://127.0.0.1:9999'})?.endpoint,'http://127.0.0.1:9999/v1/traces');
});
test('P7 regression: observer close followed by composed shutdown exports all accepted spans',async()=>{
 const exporter=new InMemorySpanExporter(); const exported:any[]=[];
 const collector={export(spans:any[],done:any){exported.push(...spans);done({code:0});},async shutdown(){}};
 const telemetry=new PhoenixTelemetry({endpoint:'http://127.0.0.1:9999/v1/traces',project:'synthetic'},collector);
 const socket=new Socket(); const capture=createProviderCapture({policy,synthetic:true,sink:telemetry.debugSink()!,connect:()=>socket});
 const handle=capture.start(binding,'rtc_synthetic');
 for(let i=0;i<10;i++)socket.receive(event(`e${i}`,'Synthetic text'));
 socket.emit('close');await capture.shutdown();await telemetry.shutdown();await handle.stop();
 assert.equal(exported.length,10);
 console.log(`P7 shutdown regression: ${exported.length}/10 accepted transcript spans exported`);
});
test('P7 replay window permits 300 sessions and keeps recent dedupe isolated from evicted replay',async()=>{
 const sockets:Socket[]=[];const records:any[]=[];
 const capture=createProviderCapture({policy,synthetic:true,sink:{async record(value){records.push(value);}},connect(){const s=new Socket();sockets.push(s);return s;}});
 async function send(sessionId:string){const h=capture.start({...binding,segment:{...binding.segment,sessionId}},'rtc_synthetic');sockets.at(-1)!.receive(event('same-event','Synthetic text'));await h.stop();}
 for(let i=0;i<300;i++)await send(`s${i}`);
 assert.equal(records.length,300);await send('s299');assert.equal(records.length,300);
 await send('s0');assert.equal(records.length,301,'evicted replay is explicitly best effort');
 sockets[0]!.receive(event('late','Late synthetic text'));await tick();assert.equal(records.length,301);
 assert.equal(records.at(-1).segment.sessionId,'s0');await capture.shutdown();
});
test('P7 timed-out unsettled handles still consume bounded capacity until actual sink settlement',async()=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r);const sockets:Socket[]=[];let calls=0;
 const capture=createProviderCapture({policy,synthetic:true,sink:{async record(){calls++;await held;}},connect(){const s=new Socket();sockets.push(s);return s;}});
 const stops:Promise<void>[]=[];
 try{
  for(let i=0;i<256;i++){
   const h=capture.start({...binding,segment:{...binding.segment,sessionId:`held${i}`}},'rtc_synthetic');sockets.at(-1)!.receive(event('e','Synthetic text'));await tick();stops.push(h.stop());
  }
  assert.equal(calls,256);await Promise.all(stops);
  assert.throws(()=>capture.start({...binding,segment:{...binding.segment,sessionId:'overflow'}},'rtc_synthetic'),/capacity/);
  release();await tick();await tick();
  const next=capture.start({...binding,segment:{...binding.segment,sessionId:'recovered'}},'rtc_synthetic');sockets.at(-1)!.receive(event('e','Synthetic text'));await next.stop();assert.equal(calls,257);
 }finally{release();await capture.shutdown();}
});
