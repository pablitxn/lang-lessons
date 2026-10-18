import test from 'node:test';
import assert from 'node:assert/strict';
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
test('P7 reproduction: JSON password and Basic authorization survive the live-enabled redaction path',async()=>{
 const exporter=new InMemorySpanExporter(); const telemetry=new PhoenixTelemetry({endpoint:'http://127.0.0.1:9999/v1/traces',project:'synthetic'},exporter);
 const socket=new Socket();const capture=createProviderCapture({policy,synthetic:true,sink:telemetry.debugSink()!,connect:()=>socket});
 const handle=capture.start(binding,'rtc_synthetic');socket.receive(event('e','{"password":"SYNTHETIC_PASSWORD"} Authorization: Basic U1lOVEhFVElDX09OTFk='));
 await handle.stop();await telemetry.flush();
 const text=JSON.stringify(exporter.getFinishedSpans().map(s=>s.attributes));
 assert.match(text,/SYNTHETIC_PASSWORD/);assert.match(text,/U1lOVEhFVElDX09OTFk=/);
 await capture.shutdown();await telemetry.shutdown();
});
test('P7 reproduction: shutdown omits a previously stopped observer that is still draining',async()=>{
 const socket=new Socket();let release!:()=>void;const held=new Promise<void>(r=>release=r);let delivered=0;let entered!:()=>void;const started=new Promise<void>(r=>entered=r);
 const capture=createProviderCapture({policy,synthetic:true,connect:()=>socket,sink:{async record(){entered();await held;delivered++;}}});
 const handle=capture.start(binding,'rtc_synthetic');socket.receive(event('e','Synthetic text'));await started;
 const stopping=handle.stop();await capture.shutdown();assert.equal(delivered,0,'shutdown has resolved while accepted work is pending');
 release();await stopping;assert.equal(delivered,1);
});
test('P7 destination config rejects remote plaintext and URL credentials and respects SDK disable',()=>{
 assert.throws(()=>readPhoenixConfig({PHOENIX_COLLECTOR_ENDPOINT:'http://example.invalid'}));
 assert.throws(()=>readPhoenixConfig({PHOENIX_COLLECTOR_ENDPOINT:'https://user:pass@example.invalid'}));
 assert.equal(readPhoenixConfig({PHOENIX_COLLECTOR_ENDPOINT:'https://example.invalid',OTEL_SDK_DISABLED:'true'}),null);
 assert.equal(readPhoenixConfig({PHOENIX_COLLECTOR_ENDPOINT:'http://127.0.0.1:9999'})?.endpoint,'http://127.0.0.1:9999/v1/traces');
});
test('P7 reproduction: observer close followed by composed shutdown loses queued Phoenix spans',async()=>{
 const exporter=new InMemorySpanExporter(); const exported:any[]=[];
 const collector={export(spans:any[],done:any){exported.push(...spans);done({code:0});},async shutdown(){}};
 const telemetry=new PhoenixTelemetry({endpoint:'http://127.0.0.1:9999/v1/traces',project:'synthetic'},collector);
 const socket=new Socket(); const capture=createProviderCapture({policy,synthetic:true,sink:telemetry.debugSink()!,connect:()=>socket});
 const handle=capture.start(binding,'rtc_synthetic');
 for(let i=0;i<10;i++)socket.receive(event(`e${i}`,'Synthetic text'));
 socket.emit('close');await capture.shutdown();await telemetry.shutdown();await handle.stop();
 assert.ok(exported.length<10,`only ${exported.length} of 10 accepted spans exported`);
 console.log(`P7 shutdown reproduction: ${exported.length}/10 accepted transcript spans exported`);
});
