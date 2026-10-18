import type { AccessPolicy } from './authorization';

/** Only the bounded Q10 answer: admin account management and professor all-student listing and day-grouped written progress.
 * No comment/personal-data disclosure, deletion, credential handoff or recovery grants are inferred. */
export const approvedAccountAccess: AccessPolicy = {
  grants: role => role === 'administrator' ? ['users:list', 'users:manage'] : role === 'professor' ? ['students:list', 'students:daily-progress:read'] : [],
};
