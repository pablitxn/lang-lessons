import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createUsageRepository, readUsageForWindow } from '../server/data/usage';
import { createLearningRepository } from '../server/data/repository';
import { createRecoveryRepository } from '../server/data/recovery';
import { createFeedbackRepository } from '../server/data/feedback-repository';
import { transaction } from '../server/data/database';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
const isolated = { skip: !database };
const policy = { allowStructuredStorage: true, access: { grants: () => ['practice:own'] }, evaluateClose: async () => 'pending' as const };
async function fixture() {
  assert.ok(database); const url = new URL(database); assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.pathname === '/p2_test');
  const admin = new Pool({ connectionString: database });
  // Better Auth introspects every accessible schema; serialize fixture lifetimes, not tested operations.
  const guard = await admin.connect(); await guard.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))"); const schema = `p2_usage_${randomUUID().replaceAll('-','')}`;
  await admin.query(`CREATE SCHEMA ${schema}`); const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  for (const name of ['p2-learning','p2-day-projection','p2-usage','p2-recovery', 'learning-language']) await pool.query(await readFile(new URL(`../server/data/migrations/${name}.sql`,import.meta.url),'utf8'));
  await pool.query("INSERT INTO learning_users(id,role) VALUES ('student','student'),('other','student')");
  const identity = { userId: 'student' }; const repo = createLearningRepository(pool,identity,policy);
  const session = await repo.commands.create({mode:'verb-image',operationId:'create'});
  const base = Date.parse('2026-01-01T12:00:00Z'); let seconds = 0;
  const usage = createUsageRepository(pool,identity,policy,{now:()=>new Date(base+seconds*1000),verifyTutorTransition:async()=>true});
  return { pool,repo,session,usage,identity,base,set:(value:number)=>{seconds=value;},
    summary:()=>transaction(pool,client=>readUsageForWindow(client,'student',new Date(base),new Date(base+86_400_000),new Date(base+seconds*1000))),
    cleanup:async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await guard.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); guard.release(); await admin.end();} };
}

test('P2 written intervals require visible interaction, stop at idle/hidden, resume on tap and deduplicate replay',isolated,async()=>{
  const f=await fixture();try{
    const streamId=await f.usage.openWrittenStream(f.session.sessionId);let sequence=0;
    const send=(kind:'visible'|'hidden'|'input'|'tap')=>f.usage.written({schemaVersion:1,sessionId:f.session.sessionId,streamId,eventId:randomUUID(),sequence:++sequence,kind});
    await send('input');f.set(10);assert.equal((await f.summary()).writtenMs,0);
    await send('visible');await send('input');f.set(40);await send('input');f.set(70);await send('hidden');
    f.set(100);assert.equal((await f.summary()).writtenMs,60_000);await send('tap');assert.equal((await f.summary()).writtenMs,60_000);
    await send('visible');await send('tap');f.set(300);assert.equal((await f.summary()).writtenMs,180_000);
    const input={schemaVersion:1 as const,sessionId:f.session.sessionId,streamId,eventId:'last-tap',sequence:++sequence,kind:'tap' as const};
    const result=await f.usage.written(input);f.set(400);const replay=await f.usage.written(input);assert.equal(replay.status,'duplicate');assert.equal(replay.intervalId,result.intervalId);
    f.set(450);assert.equal((await f.summary()).writtenMs,300_000);
    await assert.rejects(f.usage.written({...input,kind:'input'}),/conflict/);
    await assert.rejects(f.usage.written({...input,eventId:'gap',sequence:sequence+2}),/conflict/);
    assert.throws(()=>f.usage.written({...input,totalMs:999999} as typeof input),/invalid-input/);
    assert.equal((await f.pool.query('SELECT * FROM learning_time_intervals')).rowCount,3);
  }finally{await f.cleanup();}
});

test('P2 connected tutor time includes listening, excludes disconnect gaps, and unions cross-source overlap',isolated,async()=>{
  const f=await fixture();try{
    const started=await f.repo.commands.startCall({sessionId:f.session.sessionId,operationId:'call',expectedRevision:0});
    const tutor=(kind:'connected'|'disconnected',sequence:number)=>f.usage.tutor({schemaVersion:1,segment:started.segment,eventId:`tutor-${sequence}`,sequence,kind});
    await tutor('connected',1);const streamId=await f.usage.openWrittenStream(f.session.sessionId);
    const written=(kind:'visible'|'input',sequence:number)=>f.usage.written({schemaVersion:1,sessionId:f.session.sessionId,streamId,eventId:`written-${sequence}`,sequence,kind});
    await written('visible',1);await written('input',2);f.set(180);assert.equal((await f.summary()).tutorConnectedMs,180_000);await tutor('disconnected',2);
    f.set(200);await written('input',3);f.set(300);await tutor('connected',3);f.set(360);await tutor('disconnected',4);
    const totals=await f.summary();assert.equal(totals.writtenMs,240_000);assert.equal(totals.tutorConnectedMs,240_000);assert.equal(totals.totalMs,340_000);
    const absent=createUsageRepository(f.pool,f.identity,policy);await assert.rejects(absent.tutor({schemaVersion:1,segment:started.segment,eventId:'unverified',sequence:5,kind:'connected'}),/policy-unresolved/);
    await assert.rejects(f.usage.tutor({schemaVersion:1,segment:{...started.segment,connectionEpoch:99},eventId:'wrong-epoch',sequence:5,kind:'connected'}),/not-found/);
  }finally{await f.cleanup();}
});

test('P2 usage unions simultaneous tabs and session stop/close fences end only the intended streams',isolated,async()=>{
  const f=await fixture();try{
    const streams=await Promise.all([f.usage.openWrittenStream(f.session.sessionId),f.usage.openWrittenStream(f.session.sessionId)]);
    for(const streamId of streams){await f.usage.written({schemaVersion:1,sessionId:f.session.sessionId,streamId,eventId:randomUUID(),sequence:1,kind:'visible'});await f.usage.written({schemaVersion:1,sessionId:f.session.sessionId,streamId,eventId:randomUUID(),sequence:2,kind:'input'});}
    f.set(60);assert.equal((await f.summary()).writtenMs,60_000);
    const started=await f.repo.commands.startCall({sessionId:f.session.sessionId,operationId:'call',expectedRevision:0});
    await f.usage.tutor({schemaVersion:1,segment:started.segment,eventId:'connected',sequence:1,kind:'connected'});
    await f.repo.commands.stopCall({sessionId:f.session.sessionId,operationId:'stop',expectedRevision:1,segment:started.segment});
    assert.equal((await f.pool.query("SELECT * FROM learning_time_streams WHERE source='written' AND active_interval_id IS NOT NULL")).rowCount,2);
    assert.equal((await f.pool.query("SELECT * FROM learning_time_streams WHERE source='tutor' AND active_interval_id IS NOT NULL")).rowCount,0);
    await f.repo.commands.confirmClose({sessionId:f.session.sessionId,operationId:'close',expectedRevision:2,finalProgress:{sessionId:f.session.sessionId,journalRevision:0}});
    assert.equal((await f.pool.query('SELECT * FROM learning_time_streams WHERE active_interval_id IS NOT NULL')).rowCount,0);
    await assert.rejects(f.usage.openWrittenStream(f.session.sessionId),/conflict/);
    await assert.rejects(createUsageRepository(f.pool,{userId:'other'},policy).openWrittenStream(f.session.sessionId),/not-found/);
  }finally{await f.cleanup();}
});

test('P2 recovery reuses open identity and manual failed-feedback retry preserves one job and fences old workers',isolated,async()=>{
  const f=await fixture();try{
    const recovery=createRecoveryRepository(f.pool,f.identity,policy);
    assert.equal((await recovery.listOpen()).items[0]?.sessionId,f.session.sessionId);
    const started=await f.repo.commands.startCall({sessionId:f.session.sessionId,operationId:'call',expectedRevision:0});
    const open=await recovery.read(f.session.sessionId);assert.equal(open.session.revision,1);assert.deepEqual(open.activeSegments,[started.segment]);assert.equal(open.progress.journalRevision,0);
    await f.repo.commands.confirmClose({sessionId:f.session.sessionId,operationId:'close',expectedRevision:1,finalProgress:{sessionId:f.session.sessionId,journalRevision:0}});
    const feedback=createFeedbackRepository(f.pool,{acceptComment:()=>true});const snapshot=await recovery.read(f.session.sessionId);const jobId=snapshot.feedback!.jobId;
    const old=(await feedback.claim(jobId))!;await feedback.fail(old);
    const request={sessionId:f.session.sessionId,jobId,operationId:'manual-retry',expectedRetryRevision:0};
    const results=await Promise.all([recovery.retryFailedFeedback(request),recovery.retryFailedFeedback(request)]);assert.deepEqual(results[0],results[1]);assert.equal(results[0]!.retryRevision,1);
    const current=(await feedback.claim(jobId))!;assert.notEqual(current.claimToken,old.claimToken);
    const comment={sessionId:f.session.sessionId,text:'Fixture grounded comment',provenanceVersion:'fixture'};
    assert.equal(await feedback.complete(old,comment),'stale');assert.equal(await feedback.complete(current,comment),'stored');
    await assert.rejects(recovery.retryFailedFeedback({...request,operationId:'another',expectedRetryRevision:1}),/conflict/);
    assert.equal((await f.pool.query('SELECT * FROM learning_feedback_jobs')).rowCount,1);assert.equal((await f.pool.query('SELECT * FROM learning_comments')).rowCount,1);
    assert.equal((await recovery.listOpen()).items.length,0);
    await assert.rejects(createRecoveryRepository(f.pool,{userId:'other'},policy).read(f.session.sessionId),/not-found/);
  }finally{await f.cleanup();}
});
