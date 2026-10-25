import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrateLearningDatabase } from '../server/data/migrations';
import { createBrokerAuthority } from '../server/broker/authority';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;

test('sentence rewriting requires the active owned open sentence session and its curriculum language', { skip: !database }, async () => {
  assert.ok(database);
  const url = new URL(database); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/p2_test');
  const admin = new Pool({ connectionString: database });
  const schema = `sentence_rewrite_${randomUUID().replaceAll('-', '')}`;
  const lock = await admin.connect(); await lock.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  try {
    await migrateLearningDatabase(pool);
    await pool.query("INSERT INTO learning_users(id,role) VALUES ('student','student'),('other','student'),('teacher','professor')");
    await pool.query(`INSERT INTO learning_sessions(id,user_id,mode,language,status) VALUES
      ('sentence','student','sentence','en','open'), ('second','student','sentence','en','open'),
      ('french','student','sentence','fr','open'), ('verb','student','verb-visible','en','open'),
      ('closed','student','sentence','en','closed'), ('borrowed','other','sentence','en','open')`);
    await pool.query("INSERT INTO learning_active_practice(user_id,session_id) VALUES ('student','sentence')");
    const authority = createBrokerAuthority({ pool,
      auth: { identity: async () => ({ userId: 'student' }), handle: async () => new Response(null, { status: 404 }) },
      access: { grants: role => role === 'student' ? ['practice:own'] : [] },
      origin: 'http://127.0.0.1:5174', allowRequest: async () => true, activePractice: true });
    const actor = { userId: 'student' };
    const exercise = (sessionId: string) => ({ sessionId, exerciseId: 'local-presentation-identity', generation: 3 });
    await authority.authorizeSentenceRewrite!(actor, exercise('sentence'), 'en');
    await assert.rejects(authority.authorizeSentenceRewrite!(actor, exercise('sentence'), 'fr'), { code: 'conflict' });
    await assert.rejects(authority.authorizeSentenceRewrite!(actor, exercise('second'), 'en'), { code: 'conflict' });
    for (const id of ['verb', 'closed', 'borrowed', 'unknown']) {
      await assert.rejects(authority.authorizeSentenceRewrite!(actor, exercise(id), 'en'), { code: 'not-found' });
    }
    await assert.rejects(authority.authorizeSentenceRewrite!({ userId: 'other' }, exercise('sentence'), 'en'), { code: 'not-found' });
    await assert.rejects(authority.authorizeSentenceRewrite!({ userId: 'teacher' }, exercise('sentence'), 'en'), { code: 'forbidden' });
    await pool.query("UPDATE learning_active_practice SET session_id='second' WHERE user_id='student'");
    await authority.authorizeSentenceRewrite!(actor, exercise('second'), 'en');
    await pool.query("UPDATE learning_active_practice SET session_id='french' WHERE user_id='student'");
    await authority.authorizeSentenceRewrite!(actor, exercise('french'), 'fr');
    await assert.rejects(authority.authorizeSentenceRewrite!(actor, exercise('french'), 'en'), { code: 'conflict' });
    await pool.query("UPDATE learning_users SET disabled=true WHERE id='student'");
    await assert.rejects(authority.authorizeSentenceRewrite!(actor, exercise('french'), 'fr'), { code: 'forbidden' });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM learning_events')).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM learning_instances')).rows[0].n, 0);
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await lock.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); lock.release(); await admin.end();
  }
});
