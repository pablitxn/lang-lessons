import { createCredentialLinkRepository } from './auth/credential-links';
import { createClientCallTime } from './data/client-call-time';
import type { Pool } from 'pg';
import { createAuthAdapter, type LoginPolicy } from './auth/better-auth';
import { approvedAccountAccess } from './accounts/approved-policy';
import { createStudentTimeZoneRepository } from './accounts/student-timezone';
import { createLearnerPreferencesRepository } from './accounts/preferences';
import { createAccountRepository } from './accounts/repository';
import { createUserManagementRepository } from './accounts/management';
import { createDailyProgressRepository, type DailyGroupingPolicy } from './accounts/daily-progress';
import { createLearningRepository, type DataPolicy } from './data/repository';
import { createActivePracticeRepository } from './data/active-practice';
import { createUsageRepository } from './data/usage';
import { createCloseEvaluator } from './data/call-history';
import { RepositoryError } from './data/database';
import { createCanonicalFeedbackService } from './feedback-binding';
import { createRecoveryRepository } from './data/recovery';
import { createBrokerRecovery } from './broker/recovery';
import { createBrokerAuthority } from './broker/authority';
import { OPENAI_CALL_LIFETIME_MS } from './broker/lifetime';
import { createInstanceIssuer } from './instance-issuance';
import type { LearningHttpServices } from './learning-http';

/** Actual composition, not fixture policies. Auth numeric values/day boundary remain explicit inputs. */
export function createApplicationServices(config: {
  pool: Pool; origin: string; secret: string; login: LoginPolicy;
  feedbackTelemetry?: import('./feedback/telemetry').FeedbackTelemetry;
  terminateProviderCall?: (providerCallId: string) => Promise<boolean>;
  grouping?: DailyGroupingPolicy; allowRequest(address: string): Promise<boolean>;
}): LearningHttpServices {
  const access = { grants: (role: Parameters<typeof approvedAccountAccess.grants>[0]) => [
    ...approvedAccountAccess.grants(role), ...(role === 'student' ? ['practice:own'] : []),
    ...(role === 'professor' ? ['students:feedback:read'] : []),
  ] };
  // Structured incremental written results are approved. No call eligibility is guessed.
  const data: DataPolicy = { allowStructuredStorage: true, access, activePractice: true, providerCallLifetimeMs: OPENAI_CALL_LIFETIME_MS, allowUnknownCallHistory: true, evaluateClose: createCloseEvaluator({
    allowUnknown: true,
    async guardBroker(client, { sessionId }) {
      const unresolved = await client.query("SELECT 1 FROM learning_broker_receipts WHERE session_id=$1 AND state IN ('reserved','created') LIMIT 1", [sessionId]);
      if (unresolved.rowCount) throw new RepositoryError('conflict');
    },
    // Queue once; the closed-session reader and P6 policy decide evidence sufficiency.
    connectedFeedback: async () => 'pending',
  }) };
  const auth = createAuthAdapter({ pool: config.pool, origin: config.origin, secret: config.secret, policy: config.login });
  return {
    credentialPasswordPolicy: { min: config.login.minPasswordLength, max: config.login.maxPasswordLength },
    credentialLinks: createCredentialLinkRepository({ pool: config.pool, origin: config.origin, passwordPolicy: config.login }),
    clientCallTime: createClientCallTime(config.pool, access),
    feedback: createCanonicalFeedbackService(config.pool, config.feedbackTelemetry ? { telemetry: config.feedbackTelemetry } : {}),
    reconcile: createBrokerRecovery({ pool: config.pool, access, ...(config.terminateProviderCall ? { terminate: config.terminateProviderCall } : {}) }),
    brokerAuthority: createBrokerAuthority({ pool: config.pool, auth, access, origin: config.origin, allowRequest: config.allowRequest, activePractice: true, providerCallLifetimeMs: OPENAI_CALL_LIFETIME_MS }),
    origin: config.origin, allowRequest: config.allowRequest,
    auth,
    timeZone: identity => createStudentTimeZoneRepository(config.pool, identity),
    preferences: createLearnerPreferencesRepository(config.pool, access),
    activePractice: createActivePracticeRepository(config.pool, data),
    accounts: createAccountRepository(config.pool, access, { allowStudentFeedback: true }),
    management: createUserManagementRepository(config.pool),
    daily: createDailyProgressRepository(config.pool, { eventAttribution: 'server-received', clientCallTime: true }, { allowStudentFeedback: true }),
    learning: identity => createLearningRepository(config.pool, identity, data),
    usage: identity => createUsageRepository(config.pool, identity, data),
    recovery: identity => createRecoveryRepository(config.pool, identity, data),
    issueInstance: createInstanceIssuer(config.pool, data),
  };
}
