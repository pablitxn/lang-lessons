import type { PublicUser, Role } from '../../contracts';

/** Feature adapter DTOs; root maps these to the approved P2 policy API. */
export interface ManagedUser extends PublicUser {
  readonly disabled: boolean;
  readonly email?: string;
  readonly credentialStatus?: 'ready' | 'setup-required';
}
export const roleLabels: Record<Role, string> = { student: 'Student', professor: 'Teacher', administrator: 'Administrator' };
export const roleDescriptions: Record<Role, string> = {
  student: 'Practice lessons and keep track of your progress.',
  professor: 'Review students and their learning progress.',
  administrator: 'Manage accounts, access and password setup.',
};
export function accountLabel(user: PublicUser & { readonly email?: string }): string {
  return user.email || 'Account without email';
}
export type UserChange =
  | { readonly kind: 'create'; readonly email: string; readonly role: Role }
  | { readonly kind: 'change-role'; readonly userId: string; readonly role: Role }
  | { readonly kind: 'set-disabled'; readonly userId: string; readonly disabled: boolean };
export type ManagementResult =
  | { readonly status: 'applied' }
  | { readonly status: 'denied' | 'last-administrator' | 'conflict' | 'invalid-input' | 'policy-unresolved' };
export interface UserManagementApi {
  /** No password or handoff policy is chosen here. Server rechecks actor and last-admin safety. */
  apply(change: UserChange, signal: AbortSignal): Promise<ManagementResult>;
}
export interface ManagementCapabilities {
  readonly create: string | null;
  readonly changeRole: string | null;
  readonly deactivate: string | null;
  readonly reactivate: string | null;
}
export const unboundManagement: ManagementCapabilities = { create: null, changeRole: null, deactivate: null, reactivate: null };
export const managementMessages: Record<Exclude<ManagementResult['status'], 'applied'>, string> = {
  denied: 'Access denied. Your permissions may have changed.',
  'last-administrator': 'This change would remove the last active administrator. No change was made.',
  conflict: 'The account changed. Refresh the list before trying again.',
  'invalid-input': 'The request was not accepted. Check the account details.',
  'policy-unresolved': 'This action is not available until the account policy is configured.',
};
