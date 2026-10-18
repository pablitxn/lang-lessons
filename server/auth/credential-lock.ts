import { Client } from 'pg';
import type { Pool } from 'pg';

/** Serialize resets against the entire login verification/session-insertion operation. */
export const credentialLock = 'lang-lessons:credential-change';
export async function withCredentialLock<T>(pool: Pool, exclusive: boolean, work: () => Promise<T>): Promise<T> {
  // Waiting lock holders must not exhaust the application pool needed by the current holder.
  const guard = new Client(pool.options);
  try {
    await guard.connect();
    await guard.query(exclusive
      ? 'SELECT pg_advisory_lock(hashtextextended($1,0))'
      : 'SELECT pg_advisory_lock_shared(hashtextextended($1,0))', [credentialLock]);
    return await work();
  } finally {
    // Closing releases the session lock even if work/transaction/connection fails.
    await guard.end();
  }
}
