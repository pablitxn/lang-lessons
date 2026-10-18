import { Pool } from 'pg';
import { readApplicationConfiguration } from './application-config';
import { migrateLearningDatabase } from './data/migrations';
const config = await readApplicationConfiguration(process.env);
if (!config) throw new Error('Explicit learning application configuration is required for migration.');
const pool = new Pool({ connectionString: config.databaseUrl });
try {
  const applied = await migrateLearningDatabase(pool);
  console.log(`Applied ${applied.length} learning schema versions.`);
} catch { throw new Error('Learning migration failed; inspect the configured database with authorized tooling.'); }
finally { await pool.end(); }
