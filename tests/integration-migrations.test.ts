import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { MIGRATIONS, migrateLearningDatabase } from '../server/data/migrations';

const database = process.env.P2_DISPOSABLE_DATABASE_URL;
test('root migration registry serializes concurrent installs and rejects changed applied checksums', { skip: !database }, async () => {
  assert.ok(database); const url = new URL(database);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/p2_test');
  const admin = new Pool({ connectionString: database });
  const schema = `root_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: database, options: `-c search_path=${schema}` });
  try {
    const applied = await Promise.all([migrateLearningDatabase(pool), migrateLearningDatabase(pool)]);
    assert.deepEqual(applied.flat().sort(), MIGRATIONS.map(item => item.version).sort());
    assert.deepEqual(await migrateLearningDatabase(pool), []);
    assert.equal((await pool.query('SELECT * FROM learning_schema_versions')).rowCount, 2);
    await pool.query('UPDATE learning_schema_versions SET digest=$1 WHERE version=$2', ['changed-fixture', MIGRATIONS[0].version]);
    await assert.rejects(migrateLearningDatabase(pool), /checksum mismatch/);
    assert.equal((await pool.query('SELECT * FROM learning_schema_versions')).rowCount, 2);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
});
