import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createLearningRepository } from '../server/data/repository';
import { createRecoveryRepository } from '../server/data/recovery';
import { createCloseEvaluator, createCallObservationRepository } from '../server/data/call-history';
import { createUsageRepository } from '../server/data/usage';
import { createFeedbackRepository } from '../server/data/feedback-repository';
import { RepositoryError } from '../server/data/database';

const database=process.env.P2_DISPOSABLE_DATABASE_URL;
const isolated={skip:!database};
async function fixture(){
  assert.ok(database);const url=new URL(database);assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/p2_test');
  const admin=new Pool({connectionString:database});const guard=await admin.connect();await guard.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  const schema=`p2_history_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new Pool({connectionString:database,options:`-c search_path=${schema}`});
  for(const name of ['p2-learning','p2-day-projection','p2-usage','p2-recovery','p2-call-history', 'learning-language'])await pool.query(await readFile(new URL(`../server/data/migrations/${name}.sql`,import.meta.url),'utf8'));
  await pool.query("INSERT INTO learning_users(id,role) VALUES ('owner','student'),('other','student')");
  await pool.query('CREATE TABLE p2_broker_fixture(session_id text PRIMARY KEY, unresolved boolean NOT NULL)');
  await pool.query('CREATE TABLE p2_guard_receipts(session_id text, transaction_id text)');
  const identity={userId:'owner'};const access={grants:()=>['practice:own']};
  const evaluateClose=createCloseEvaluator({
    guardBroker:async(client,context)=>{
      await client.query('INSERT INTO p2_guard_receipts VALUES ($1,txid_current()::text)',[context.sessionId]);
      const {rows}=await client.query<{unresolved:boolean}>('SELECT unresolved FROM p2_broker_fixture WHERE session_id=$1',[context.sessionId]);
      if(rows[0]?.unresolved)throw new RepositoryError('conflict');
    },connectedFeedback:async()=> 'pending',
  });
  const policy={allowStructuredStorage:true,access,evaluateClose};const repo=createLearningRepository(pool,identity,policy);
  const recovery=createRecoveryRepository(pool,identity,policy);
  const observations=createCallObservationRepository(pool,identity,{access,verify:async()=>true});
  const usage=createUsageRepository(pool,identity,policy,{verifyTutorTransition:async()=>true});
  const feedback=createFeedbackRepository(pool,{acceptComment:()=>true});
  async function session(){return repo.commands.create({mode:'verb-image',operationId:randomUUID()});}
  async function call(sessionId:string){const current=await repo.commands.read(sessionId);return repo.commands.startCall({sessionId,operationId:randomUUID(),expectedRevision:current.revision});}
  async function close(sessionId:string,operationId=randomUUID()){const current=await repo.commands.read(sessionId);return {sessionId,operationId,expectedRevision:current.revision,finalProgress:{sessionId,journalRevision:0}};}
  return {pool,identity,access,policy,repo,recovery,observations,usage,feedback,session,call,close,cleanup:async()=>{
    await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await guard.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))");guard.release();await admin.end();
  }};
}

test('P2 historical call reads distinguish unknown, never-connected and verified stopped-segment connections',isolated,async()=>{
  const f=await fixture();try{
    const s=await f.session();assert.deepEqual(await f.recovery.readCallHistory(s.sessionId),{sessionId:s.sessionId,hadConnectedCall:false});
    const first=await f.call(s.sessionId);
    await assert.rejects(f.recovery.readCallHistory(s.sessionId),/policy-unresolved/);
    await f.repo.commands.stopCall({sessionId:s.sessionId,operationId:'stop-first',expectedRevision:1,segment:first.segment});
    await assert.rejects(f.recovery.readCallHistory(s.sessionId),/policy-unresolved/);
    const negative={eventId:'never',segment:first.segment,kind:'never-connected' as const};
    assert.equal(await f.observations.record(negative),'recorded');assert.equal(await f.observations.record(negative),'duplicate');
    assert.equal((await f.recovery.readCallHistory(s.sessionId)).hadConnectedCall,false);
    const second=await f.call(s.sessionId);
    await f.usage.tutor({schemaVersion:1,segment:second.segment,eventId:'connected',sequence:1,kind:'connected'});
    await f.repo.commands.stopCall({sessionId:s.sessionId,operationId:'stop-second',expectedRevision:3,segment:second.segment});
    assert.equal((await f.recovery.readCallHistory(s.sessionId)).hadConnectedCall,true);
    // A later unknown segment cannot erase the earlier authoritative positive history.
    await f.call(s.sessionId);assert.equal((await f.recovery.readCallHistory(s.sessionId)).hadConnectedCall,true);
    await assert.rejects(createRecoveryRepository(f.pool,{userId:'other'},f.policy).readCallHistory(s.sessionId),/not-found/);
    await assert.rejects(f.observations.record({...negative,kind:'connected'}),/conflict/);
  }finally{await f.cleanup();}
});

test('P2 no-call and verified never-connected close request no comment; unknown or unverified observations cannot qualify',isolated,async()=>{
  const f=await fixture();try{
    const noCall=await f.session();assert.equal((await f.repo.commands.confirmClose(await f.close(noCall.sessionId))).feedback,'not-requested');
    const s=await f.session();const started=await f.call(s.sessionId);
    const negative={eventId:'terminal-negative',segment:started.segment,kind:'never-connected' as const};
    await assert.rejects(f.observations.record(negative),/conflict/);
    await f.repo.commands.stopCall({sessionId:s.sessionId,operationId:'stop',expectedRevision:1,segment:started.segment});
    const request=await f.close(s.sessionId);
    await assert.rejects(f.repo.commands.confirmClose(request),/policy-unresolved/);
    assert.equal((await f.repo.commands.read(s.sessionId)).status,'open');
    await assert.rejects(createCallObservationRepository(f.pool,f.identity,{access:f.access,verify:async()=>false}).record(negative),/policy-unresolved/);
    await f.observations.record(negative);
    const result=await f.repo.commands.confirmClose(request);assert.equal(result.feedback,'not-requested');
    assert.deepEqual(await f.repo.commands.confirmClose(request),result);
    assert.equal((await f.pool.query('SELECT * FROM learning_feedback_jobs')).rowCount,0);
    assert.equal((await f.pool.query('SELECT * FROM p2_guard_receipts')).rowCount,2);
  }finally{await f.cleanup();}
});

test('P2 close awaits the root broker guard inside its transaction, rolls back guard writes and enqueues once',isolated,async()=>{
  const f=await fixture();try{
    const s=await f.session();const started=await f.call(s.sessionId);
    await f.observations.record({eventId:'observed-connected',segment:started.segment,kind:'connected'});
    await f.pool.query('INSERT INTO p2_broker_fixture VALUES ($1,true)',[s.sessionId]);const request=await f.close(s.sessionId);
    await assert.rejects(f.repo.commands.confirmClose(request),/conflict/);
    assert.equal((await f.pool.query('SELECT * FROM p2_guard_receipts')).rowCount,0);
    assert.equal((await f.pool.query('SELECT * FROM learning_closes')).rowCount,0);
    assert.equal((await f.pool.query('SELECT * FROM learning_feedback_jobs')).rowCount,0);
    assert.equal((await f.repo.commands.read(s.sessionId)).status,'open');
    await f.pool.query('UPDATE p2_broker_fixture SET unresolved=false');
    const result=await Promise.all([f.repo.commands.confirmClose(request),f.repo.commands.confirmClose(request)]);
    assert.deepEqual(result[0],result[1]);assert.equal(result[0]!.feedback,'pending');
    assert.equal((await f.pool.query('SELECT * FROM p2_guard_receipts')).rowCount,1);
    assert.equal((await f.pool.query('SELECT * FROM learning_feedback_jobs')).rowCount,1);
    await assert.rejects(f.repo.commands.confirmClose({...request,expectedRevision:request.expectedRevision+1}),/conflict/);
    assert.equal((await f.recovery.readCallHistory(s.sessionId)).hadConnectedCall,true);
  }finally{await f.cleanup();}
});

test('P2 close evaluator owns the session lock and feedback insertion failure rolls back its writes',isolated,async()=>{
  const f=await fixture();try{
    const s=await f.session();const started=await f.call(s.sessionId);await f.observations.record({eventId:'connected',segment:started.segment,kind:'connected'});
    let locked=false;
    const evaluateClose=createCloseEvaluator({guardBroker:async(client,context)=>{
      const other=await f.pool.connect();try{await other.query('BEGIN');await other.query("SET LOCAL lock_timeout='30ms'");
        await assert.rejects(other.query('SELECT id FROM learning_sessions WHERE id=$1 FOR UPDATE',[context.sessionId]),/lock timeout/);locked=true;
      }finally{await other.query('ROLLBACK');other.release();}
      await client.query('INSERT INTO p2_guard_receipts VALUES ($1,txid_current()::text)',[context.sessionId]);
    },connectedFeedback:async()=> 'insufficient-evidence'});
    const repo=createLearningRepository(f.pool,f.identity,{...f.policy,evaluateClose});
    await f.pool.query("CREATE FUNCTION reject_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture job failure'; END $$");
    await f.pool.query('CREATE TRIGGER reject_job BEFORE INSERT ON learning_feedback_jobs FOR EACH ROW EXECUTE FUNCTION reject_job()');
    const request=await f.close(s.sessionId);await assert.rejects(repo.commands.confirmClose(request),/fixture job failure/);assert.equal(locked,true);
    assert.equal((await f.pool.query('SELECT * FROM p2_guard_receipts')).rowCount,0);assert.equal((await repo.commands.read(s.sessionId)).status,'open');
    await f.pool.query('DROP TRIGGER reject_job ON learning_feedback_jobs');assert.equal((await repo.commands.confirmClose(request)).feedback,'insufficient-evidence');
  }finally{await f.cleanup();}
});

test('P2 closed failed feedback discovery has independent pagination and preserves manual retry fences after reload',isolated,async()=>{
  const f=await fixture();try{
    const open=await f.session();const failed:string[]=[];
    for(let i=0;i<2;i++){
      const s=await f.session();const started=await f.call(s.sessionId);await f.observations.record({eventId:`connected-${i}`,segment:started.segment,kind:'connected'});
      await f.repo.commands.confirmClose(await f.close(s.sessionId));const snapshot=await f.recovery.read(s.sessionId);const claim=(await f.feedback.claim(snapshot.feedback!.jobId))!;await f.feedback.fail(claim);failed.push(s.sessionId);
    }
    const reload=createRecoveryRepository(f.pool,f.identity,f.policy);assert.equal((await reload.listOpen(null,1)).items[0]!.sessionId,open.sessionId);
    const first=await reload.listFailedFeedback(null,1);assert.equal(first.items.length,1);assert.ok(first.nextCursor);
    const second=await reload.listFailedFeedback(first.nextCursor,1);assert.equal(second.items.length,1);assert.equal(second.nextCursor,null);
    assert.deepEqual([first.items[0]!.sessionId,second.items[0]!.sessionId].sort(),failed.sort());
    assert.equal((await createRecoveryRepository(f.pool,{userId:'other'},f.policy).listFailedFeedback()).items.length,0);
    const snapshot=await reload.read(first.items[0]!.sessionId);const job=snapshot.feedback!;
    const request={sessionId:snapshot.session.sessionId,jobId:job.jobId,operationId:'retry-after-reload',expectedRetryRevision:job.retryRevision};
    const retries=await Promise.all([reload.retryFailedFeedback(request),reload.retryFailedFeedback(request)]);assert.deepEqual(retries[0],retries[1]);
    assert.equal((await reload.listFailedFeedback()).items.length,1);assert.equal((await reload.listOpen()).items.length,1);
    await assert.rejects(reload.retryFailedFeedback({...request,operationId:'stale-retry'}),/conflict/);
    const claim=(await f.feedback.claim(job.jobId))!;assert.equal(await f.feedback.complete(claim,{sessionId:snapshot.session.sessionId,text:'Fixture comment',provenanceVersion:'fixture'}),'stored');
    await assert.rejects(reload.retryFailedFeedback({...request,operationId:'completed-retry',expectedRetryRevision:1}),/conflict/);
  }finally{await f.cleanup();}
});
