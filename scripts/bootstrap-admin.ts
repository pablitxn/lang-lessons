import { Pool } from 'pg';
import { readApplicationConfiguration } from '../server/application-config';
import { bootstrapInitialAdministrator } from '../server/auth/bootstrap';

// Explicit operator invocation only. No secrets in argv, environment additions or output.
if (!process.argv.includes('--confirm-initial-administrator')) throw new Error('Explicit initial-administrator confirmation is required.');
const config = await readApplicationConfiguration(process.env);
if (!config) throw new Error('Application configuration is required.');
const pool = new Pool({ connectionString: config.databaseUrl });
try {
  let body = '';
  for await (const chunk of process.stdin) { body += String(chunk); if (Buffer.byteLength(body) > 16384) throw new Error(); }
  await bootstrapInitialAdministrator(pool, config.login, JSON.parse(body)); body = '';
  console.log('Initial administrator created. Sign in using the supplied credentials.');
} catch { process.exitCode = 1; console.error('Bootstrap failed. Verify configuration and input; an existing administrator prevents bootstrap.'); }
finally { await pool.end(); }
