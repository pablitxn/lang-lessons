import { readFile } from 'node:fs/promises';
import type { LoginPolicy } from './auth/better-auth';
import type { DailyGroupingPolicy } from './accounts/daily-progress';

export interface ApplicationConfiguration {
  origin: string; login: LoginPolicy; requestLimit: { windowMs: number; maximum: number };
  grouping?: DailyGroupingPolicy;
  databaseUrl: string; secret: string;
}
/** Explicit server configuration only. No account/session/rate/timezone values are silently selected. */
export async function readApplicationConfiguration(env: NodeJS.ProcessEnv): Promise<ApplicationConfiguration | null> {
  if (!env.LEARNING_APPLICATION_CONFIG) return null;
  let value: unknown;
  try { value = JSON.parse(await readFile(env.LEARNING_APPLICATION_CONFIG, 'utf8')); }
  catch { throw new Error('Learning application configuration could not be read.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid learning application configuration.');
  const config = value as Record<string, any>;
  if (Object.keys(config).some(key => !['origin', 'login', 'requestLimit', 'grouping'].includes(key))
    || typeof config.origin !== 'string' || !config.login || !config.requestLimit
    || !Number.isSafeInteger(config.requestLimit.windowMs) || config.requestLimit.windowMs < 1
    || !Number.isSafeInteger(config.requestLimit.maximum) || config.requestLimit.maximum < 1
    || !env.LEARNING_DATABASE_URL || !env.LEARNING_AUTH_SECRET) throw new Error('Learning application configuration is incomplete.');
  if (config.grouping) {
    if (config.grouping.eventAttribution !== 'server-received') throw new Error('Invalid daily grouping configuration.');
    if (config.grouping.timeZone !== undefined) {
      try { new Intl.DateTimeFormat('en', { timeZone: config.grouping.timeZone }); } catch { throw new Error('Invalid legacy daily grouping timezone.'); }
    }
  }
  return { origin: config.origin, login: config.login, requestLimit: config.requestLimit,
    ...(config.grouping ? { grouping: config.grouping } : {}), databaseUrl: env.LEARNING_DATABASE_URL, secret: env.LEARNING_AUTH_SECRET };
}
export function createApplicationLimiter(policy: ApplicationConfiguration['requestLimit']) {
  const entries = new Map<string, { until: number; count: number }>();
  return async (address: string) => {
    const now = Date.now();
    for (const [key, value] of entries) if (value.until <= now) entries.delete(key);
    let entry = entries.get(address);
    if (!entry) {
      if (entries.size >= 10000) return false;
      entry = { until: now + policy.windowMs, count: 0 }; entries.set(address, entry);
    }
    return ++entry.count <= policy.maximum;
  };
}
