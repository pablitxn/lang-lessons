import type { Pool, PoolClient } from 'pg';

export class RepositoryError extends Error {
  constructor(readonly code: 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'invalid-input' | 'policy-unresolved') {
    super(code); this.name = 'RepositoryError';
  }
}
export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}
export function requireId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > 256 || /[\u0000-\u001f]/u.test(value)) throw new RepositoryError('invalid-input');
}
export function requireRevision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new RepositoryError('invalid-input');
}
export function exactKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw new RepositoryError('invalid-input');
}

/** Legacy requests and records are English; unsupported languages never silently fall back. */
export function learningLanguage(value: unknown): import('../../src/contracts/curriculum').LearningLanguage {
  if (value === undefined || value === 'en') return 'en';
  if (value === 'fr') return 'fr';
  throw new RepositoryError('invalid-input');
}
