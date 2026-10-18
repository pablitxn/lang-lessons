import type { Pool } from 'pg';
import { createAuthAdapter, type LoginPolicy } from './auth/better-auth';
import { approvedAccountAccess } from './accounts/approved-policy';
import { createAccountRepository } from './accounts/repository';
import { createUserManagementRepository } from './accounts/management';
import { createDailyProgressRepository, type DailyGroupingPolicy } from './accounts/daily-progress';
import { createLearningRepository, type DataPolicy } from './data/repository';
import { createUsageRepository } from './data/usage';
import { createRecoveryRepository } from './data/recovery';
import { createInstanceIssuer } from './instance-issuance';
import type { LearningHttpServices } from './learning-http';

/** Actual composition, not fixture policies. Auth numeric values/day boundary remain explicit inputs. */
export function createApplicationServices(config: {
  pool: Pool; origin: string; secret: string; login: LoginPolicy;
  grouping?: DailyGroupingPolicy; allowRequest(address: string): Promise<boolean>;
}): LearningHttpServices {
  const access = { grants: (role: Parameters<typeof approvedAccountAccess.grants>[0]) => [
    ...approvedAccountAccess.grants(role), ...(role === 'student' ? ['practice:own'] : []),
    ...(role === 'professor' ? ['students:feedback:read'] : []),
  ] };
  // Structured incremental written results are approved. No call eligibility is guessed.
  const data: DataPolicy = { allowStructuredStorage: true, access };
  return {
    origin: config.origin, allowRequest: config.allowRequest,
    auth: createAuthAdapter({ pool: config.pool, origin: config.origin, secret: config.secret, policy: config.login }),
    accounts: createAccountRepository(config.pool, access, { allowStudentFeedback: true }),
    management: createUserManagementRepository(config.pool),
    daily: createDailyProgressRepository(config.pool, config.grouping, { allowStudentFeedback: true }),
    learning: identity => createLearningRepository(config.pool, identity, data),
    usage: identity => createUsageRepository(config.pool, identity, data),
    recovery: identity => createRecoveryRepository(config.pool, identity, data),
    issueInstance: createInstanceIssuer(config.pool, data),
  };
}
