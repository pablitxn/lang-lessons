import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { transaction } from './database';

/** Explicit invocation only: importing the server never migrates or provisions a database. */
export const MIGRATIONS = [
  { version: '2026-10-18-auth', source: new URL('./migrations/p2-auth.sql', import.meta.url) },
  { version: '2026-10-18-learning', source: new URL('./migrations/p2-learning.sql', import.meta.url) },
  { version: '2026-10-18-admin', source: new URL('./migrations/p2-admin.sql', import.meta.url) },
  { version: '2026-10-18-day-projection', source: new URL('./migrations/p2-day-projection.sql', import.meta.url) },
  { version: '2026-10-18-usage', source: new URL('./migrations/p2-usage.sql', import.meta.url) },
  { version: '2026-10-18-recovery', source: new URL('./migrations/p2-recovery.sql', import.meta.url) },
  { version: '2026-10-18-student-timezone', source: new URL('./migrations/p2-student-timezone.sql', import.meta.url) },
  { version: '2026-10-18-call-history', source: new URL('./migrations/p2-call-history.sql', import.meta.url) },
  { version: '2026-10-18-broker-receipts', source: new URL('../broker/receipts.sql', import.meta.url) },
] as const;
export async function migrateLearningDatabase(pool: Pool) {
  const migrations = await Promise.all(MIGRATIONS.map(async migration => {
    const sql = await readFile(migration.source, 'utf8');
    return { ...migration, sql, digest: createHash('sha256').update(sql).digest('hex') };
  }));
  return transaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('lang-lessons:migrations', 0))");
    await client.query('CREATE TABLE IF NOT EXISTS learning_schema_versions (version text PRIMARY KEY, digest text NOT NULL)');
    const applied: string[] = [];
    for (const migration of migrations) {
      const prior = await client.query<{ digest: string }>('SELECT digest FROM learning_schema_versions WHERE version=$1', [migration.version]);
      if (prior.rows[0]) {
        if (prior.rows[0].digest !== migration.digest) throw new Error('Applied migration checksum mismatch');
        continue;
      }
      await client.query(migration.sql);
      await client.query('INSERT INTO learning_schema_versions(version,digest) VALUES ($1,$2)', [migration.version, migration.digest]);
      applied.push(migration.version);
    }
    return applied;
  });
}
