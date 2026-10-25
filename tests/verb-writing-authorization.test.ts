import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrateLearningDatabase } from '../server/data/migrations';
import { createBrokerAuthority } from '../server/broker/authority';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;

test('verb writing requires the active owned open verb session and its curriculum language', { skip: !database }, async () => {
  assert.ok(database);
  const url = new URL(database); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/p2_test');
  const admin = new Pool({ connectionString: database });
  const schema = `verb_writing_${randomUUID().replaceAll('-', '')}`;
  const lock = await admin.connect(); await lock.query("SELECT pg_advisory_lock(hashtextextended('p2-disposable-fixture',0))");
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  try {
    await migrateLearningDatabase(pool);
    await pool.query("INSERT INTO learning_users(id,role) VALUES ('student','student'),('other','student'),('teacher','professor')");
    await pool.query(`INSERT INTO learning_sessions(id,user_id,mode,language,status) VALUES
      ('visible','student','verb-visible','en','open'), ('picture','student','verb-image','en','open'),
      ('french','student','verb-visible','fr','open'), ('sentence','student','sentence','en','open'),
      ('closed','student','verb-visible','en','closed'), ('borrowed','other','verb-visible','en','open')`);
    await pool.query("INSERT INTO learning_active_practice(user_id,session_id) VALUES ('student','visible')");
    const authority = createBrokerAuthority({ pool,
      auth: { identity: async () => ({ userId: 'student' }), handle: async () => new Response(null, { status: 404 }) },
      access: { grants: role => role === 'student' ? ['practice:own'] : [] },
      origin: 'http://127.0.0.1:5174', allowRequest: async () => true, activePractice: true });
    const actor = { userId: 'student' };
    const exercise = (sessionId: string) => ({ sessionId, exerciseId: 'local-presentation-identity', generation: 3 });
    await authority.authorizeVerbWriting!(actor, exercise('visible'), 'en');
    await assert.rejects(authority.authorizeVerbWriting!(actor, exercise('visible'), 'fr'), { code: 'conflict' });
    await assert.rejects(authority.authorizeVerbWriting!(actor, exercise('picture'), 'en'), { code: 'conflict' });
    for (const id of ['sentence', 'closed', 'borrowed', 'unknown']) {
      await assert.rejects(authority.authorizeVerbWriting!(actor, exercise(id), 'en'), { code: 'not-found' });
    }
    await assert.rejects(authority.authorizeVerbWriting!({ userId: 'other' }, exercise('visible'), 'en'), { code: 'not-found' });
    await assert.rejects(authority.authorizeVerbWriting!({ userId: 'teacher' }, exercise('visible'), 'en'), { code: 'forbidden' });
    await pool.query("UPDATE learning_active_practice SET session_id='picture' WHERE user_id='student'");
    await authority.authorizeVerbWriting!(actor, exercise('picture'), 'en');
    await pool.query("UPDATE learning_active_practice SET session_id='french' WHERE user_id='student'");
    await authority.authorizeVerbWriting!(actor, exercise('french'), 'fr');
    await assert.rejects(authority.authorizeVerbWriting!(actor, exercise('french'), 'en'), { code: 'conflict' });
    await pool.query("UPDATE learning_users SET disabled=true WHERE id='student'");
    await assert.rejects(authority.authorizeVerbWriting!(actor, exercise('french'), 'fr'), { code: 'forbidden' });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM learning_events')).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM learning_instances')).rows[0].n, 0);
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await lock.query("SELECT pg_advisory_unlock(hashtextextended('p2-disposable-fixture',0))"); lock.release(); await admin.end();
  }
});
