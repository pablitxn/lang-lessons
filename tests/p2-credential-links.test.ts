import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createCredentialLinkRepository } from '../server/auth/credential-links';
import { credentialLock } from '../server/auth/credential-lock';
import { createAuthAdapter } from '../server/auth/better-auth';
import { createUserManagementRepository } from '../server/accounts/management';

const database=process.env.P2_DISPOSABLE_DATABASE_URL;
const origin='http://127.0.0.1:3000';
const policy={sessionExpiresIn:3600,sessionUpdateAge:600,sessionFreshAge:600,minPasswordLength:12,maxPasswordLength:128,allowRememberMe:false,refreshSessions:false,rateLimitWindow:60,rateLimitMax:100};
const password='synthetic-initial-password';
const nextPassword='synthetic-replacement-password';
async function fixture() {
  assert.ok(database);const url=new URL(database);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/p2_test');
  const admin=new Pool({connectionString:database});const guard=await admin.connect();
  await guard.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  const schema='p2_credentials_'+randomUUID().replaceAll('-','');
  await admin.query('CREATE SCHEMA '+schema);
  const pool=new Pool({connectionString:database,max:2,options:'-c search_path='+schema});
  for(const name of ['p2-auth','p2-learning','p2-admin','p2-credential-links']) await pool.query(await readFile(new URL('../server/data/migrations/'+name+'.sql',import.meta.url),'utf8'));
  await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES ('admin','admin','admin@example.invalid',false),('student','student','student@example.invalid',false),('prof','prof','prof@example.invalid',false)`);
  await pool.query("INSERT INTO learning_users(id,role) VALUES ('admin','administrator'),('student','student'),('prof','professor')");
  const repo=createCredentialLinkRepository({pool,origin,passwordPolicy:policy});
  const auth=createAuthAdapter({pool,origin,policy,secret:'synthetic-test-secret-not-for-real-use'});
  const login=(secret:string)=>auth.handle(new Request(origin+'/api/auth/sign-in/email',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'student@example.invalid',password:secret})}),'127.0.0.1');
  return {pool,repo,auth,login,cleanup:async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await guard.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))");guard.release();await admin.end();}};
}
function token(link:string){const url=new URL(link);assert.equal(url.search,'');return new URLSearchParams(url.hash.slice(1)).get('token')!;}
const actor={userId:'admin'};

test('P2 credential links reject untrusted origins and non-short expiry',()=>{
  for(const config of [{origin:'https://example.invalid/path'},{expiresInSeconds:1801},{expiresInSeconds:0}]) assert.throws(()=>createCredentialLinkRepository({pool:{} as Pool,origin,passwordPolicy:policy,...config}),/invalid-input/);
});

test('P2 admin manual setup links are hashed, replaceable, expiring, one-use and cannot grant roles', {skip:!database},async()=>{
  const f=await fixture();
  try{
    for(const userId of ['student','prof','missing']) await assert.rejects(f.repo.issue({userId},{userId:'student',purpose:'setup'}),/forbidden/);
    await f.pool.query("UPDATE learning_users SET disabled=true WHERE id='admin'");
    await assert.rejects(f.repo.issue(actor,{userId:'student',purpose:'setup'}),/forbidden/);
    await f.pool.query("UPDATE learning_users SET disabled=false,role='student' WHERE id='admin'");
    await assert.rejects(f.repo.issue(actor,{userId:'student',purpose:'setup'}),/forbidden/);
    await f.pool.query("UPDATE learning_users SET role='administrator' WHERE id='admin'");
    const first=await f.repo.issue(actor,{userId:'student',purpose:'setup'});
    assert.ok(Date.parse(first.expiresAt)-Date.now()>1_790_000);
    const stored=(await f.pool.query('SELECT * FROM learning_credential_links')).rows;
    assert.match(stored[0].token_hash,/^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(stored).includes(token(first.link)));
    assert.equal((await f.pool.query('SELECT * FROM learning_operations')).rowCount,0);
    const replacement=await f.repo.issue(actor,{userId:'student',purpose:'setup'});
    await assert.rejects(f.repo.redeem({token:token(first.link),password}),/invalid-input/);
    await f.pool.query("UPDATE learning_credential_links SET expires_at=clock_timestamp()-interval '1 second'");
    await assert.rejects(f.repo.redeem({token:token(replacement.link),password}),/invalid-input/);
    assert.equal((await f.pool.query('SELECT * FROM account')).rowCount,0);
    const usable=await f.repo.issue(actor,{userId:'student',purpose:'setup'});
    assert.throws(()=>f.repo.redeem({token:token(usable.link),password:'short'}),/invalid-input/);
    assert.throws(()=>f.repo.redeem({token:token(usable.link),password,role:'administrator'} as {token:string;password:string}),/invalid-input/);
    const outcomes=await Promise.allSettled([f.repo.redeem({token:token(usable.link),password}),f.repo.redeem({token:token(usable.link),password})]);
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);
    assert.equal((await f.pool.query('SELECT * FROM account')).rowCount,1);
    assert.equal((await f.pool.query("SELECT role FROM learning_users WHERE id='student'")).rows[0].role,'student');
    assert.equal((await f.pool.query('SELECT "emailVerified" FROM "user" WHERE id=\'student\'')).rows[0].emailVerified,false);
    assert.ok((await Promise.all(Array.from({length:4},()=>f.login(password)))).every(result=>result.status===200),'concurrent logins must not exhaust a two-connection application pool');
    await assert.rejects(f.repo.issue(actor,{userId:'student',purpose:'setup'}),/conflict/);
    await assert.rejects(f.repo.issue(actor,{userId:'prof',purpose:'reset'}),/conflict/);
    const created=await createUserManagementRepository(f.pool).create(actor,{operationId:'new',email:'new@example.invalid',role:'student',disabled:false});
    assert.ok((await f.repo.issue(actor,{userId:created.user.id,purpose:'setup'})).link);
  }finally{await f.cleanup();}
});

test('P2 reset atomically revokes sessions, rolls back failures, and fences in-flight logins', {skip:!database},async()=>{
  const f=await fixture();
  try{
    const setup=await f.repo.issue(actor,{userId:'student',purpose:'setup'});
    await f.repo.redeem({token:token(setup.link),password});
    const login=await f.login(password);assert.equal(login.status,200);
    const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
    const oldSession=(await f.pool.query('SELECT * FROM session')).rows[0];
    const reset=await f.repo.issue(actor,{userId:'student',purpose:'reset'});
    // Failure after credential update must roll back password, token consumption and revocation together.
    await f.pool.query(`CREATE FUNCTION reject_reset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER reject_reset BEFORE UPDATE ON learning_users FOR EACH ROW EXECUTE FUNCTION reject_reset()`);
    await assert.rejects(f.repo.redeem({token:token(reset.link),password:nextPassword}),/synthetic failure/);
    assert.equal((await f.pool.query('SELECT consumed_at FROM learning_credential_links')).rows[0].consumed_at,null);
    assert.deepEqual(await f.auth.identity(new Headers({cookie})),{userId:'student'});
    await f.pool.query('DROP TRIGGER reject_reset ON learning_users');
    // Prove reset waits for the same shared lock held across real auth.handler verification/insertion.
    const blocker=await f.pool.connect();
    await blocker.query('SELECT pg_advisory_lock_shared(hashtextextended($1,0))',[credentialLock]);
    const resetPromise=f.repo.redeem({token:token(reset.link),password:nextPassword});
    try{
      let waiting=false;
      for(let i=0;i<100&&!waiting;i++){
        const rows=await f.pool.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND mode='ExclusiveLock'");
        waiting=Boolean(rows.rowCount);if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.ok(waiting,'reset must wait for an in-flight login');
    }finally{
      await blocker.query('SELECT pg_advisory_unlock_shared(hashtextextended($1,0))',[credentialLock]);blocker.release();
    }
    assert.deepEqual(await resetPromise,{ok:true});
    assert.equal((await f.pool.query('SELECT * FROM session')).rowCount,0);
    await assert.rejects(f.auth.identity(new Headers({cookie})),/unauthenticated/);
    await f.pool.query('INSERT INTO session SELECT * FROM jsonb_populate_record(NULL::session,$1::jsonb)',[JSON.stringify(oldSession)]);
    await assert.rejects(f.auth.identity(new Headers({cookie})),/unauthenticated/);
    assert.equal((await f.login(password)).ok,false);
    assert.equal((await f.login(nextPassword)).status,200);
    await assert.rejects(f.repo.redeem({token:token(reset.link),password}),/invalid-input/);
    const disabled=await f.repo.issue(actor,{userId:'student',purpose:'reset'});
    await f.pool.query("UPDATE learning_users SET disabled=true WHERE id='student'");
    await assert.rejects(f.repo.redeem({token:token(disabled.link),password}),/invalid-input/);
    await assert.rejects(f.repo.issue(actor,{userId:'student',purpose:'reset'}),/forbidden/);
  }finally{await f.cleanup();}
});
