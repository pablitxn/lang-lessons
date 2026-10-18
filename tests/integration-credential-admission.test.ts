import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearningHttpHandler } from '../server/learning-http';
test('root bounds combined login/reset admissions and releases capacity after errors', async () => {
  const origin='http://127.0.0.1:5174';let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let entered=0;
  const handler=createLearningHttpHandler({origin,allowRequest:async()=>true,auth:{handle:async()=>{entered++;await held;return new Response('{}');}},credentialLinks:{redeem:async()=>{entered++;await held;throw new Error('fixture');}}} as any);
  const request=(path:string)=>handler(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}),'127.0.0.1');
  const pending=Array.from({length:8},(_,i)=>request(i%2?'/api/learning/credential-links/redeem':'/api/auth/sign-in/email'));
  for(let i=0;i<20&&entered<8;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(entered,8);
  assert.equal((await request('/api/auth/sign-in/email'))!.status,429);assert.equal(entered,8);
  release();await Promise.all(pending);assert.equal((await request('/api/auth/sign-in/email'))!.status,200);
});
