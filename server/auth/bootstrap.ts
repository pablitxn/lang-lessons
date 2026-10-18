import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { Pool } from 'pg';
import type { LoginPolicy } from './better-auth';
import { transaction, RepositoryError } from '../data/database';

/** Operator-only first administrator bootstrap; never exposed over HTTP. */
export async function bootstrapInitialAdministrator(pool: Pool, policy: Pick<LoginPolicy, 'minPasswordLength' | 'maxPasswordLength'>, input: { email: string; password: string }) {
  if (!input || Object.keys(input).some(key => !['email','password'].includes(key)) || typeof input.email !== 'string'
    || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
    || typeof input.password !== 'string' || input.password.length < policy.minPasswordLength || input.password.length > policy.maxPasswordLength) throw new RepositoryError('invalid-input');
  return transaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('lang-lessons:admin-management',0))");
    if ((await client.query("SELECT 1 FROM learning_users WHERE role='administrator' LIMIT 1")).rowCount) throw new RepositoryError('conflict');
    const id = randomUUID(); const password = await hashPassword(input.password);
    await client.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES ($1,$1,$2,false)', [id,input.email.toLowerCase()]);
    await client.query("INSERT INTO learning_users(id,role) VALUES ($1,'administrator')", [id]);
    await client.query('INSERT INTO account(id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,\'credential\',$2,$3,clock_timestamp())', [randomUUID(),id,password]);
    return { userId: id };
  });
}
