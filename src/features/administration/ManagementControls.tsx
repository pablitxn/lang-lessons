import type { FormEvent } from 'react';
import type { CurrentUser, Role } from '../../contracts';
import { hasCapability } from '../accounts/access';
import type { ManagedUser, ManagementCapabilities, UserChange } from './management';
const roles: readonly Role[] = ['student', 'professor', 'administrator'];
function RoleOptions() { return <>{roles.map(role => <option key={role} value={role}>{role}</option>)}</>; }
export function CreateUserForm({ disabled, onChange }: { disabled: boolean; onChange: (change: UserChange) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onChange({ kind: 'create', email: String(data.get('email')).trim(), role: String(data.get('role')) as Role });
  }
  return <form className="p3-management-form" onSubmit={submit}><h2>Create user</h2>
    <label>New user email<input name="email" type="email" autoComplete="off" required disabled={disabled} /></label>
    <label>New user role<select aria-label="New user role" name="role" required defaultValue="" disabled={disabled}><option value="" disabled>Select a role</option><RoleOptions /></select></label>
    <button disabled={disabled} type="submit">Create user</button>
    <p>Account access and initial credentials require a separately configured handoff. No credentials are generated here.</p>
  </form>;
}
export function UserActions({ target, actor, capabilities, disabled, onChange }: {
  target: ManagedUser; actor: CurrentUser; capabilities: ManagementCapabilities; disabled: boolean; onChange: (change: UserChange) => void;
}) {
  return <div className="p3-management-actions">
    {hasCapability(actor, capabilities.changeRole) && <form onSubmit={event => {
      event.preventDefault();
      const role = String(new FormData(event.currentTarget).get('role')) as Role;
      if (role !== target.role) onChange({ kind: 'change-role', userId: target.id, role });
    }}><label>Role for {target.id}<select aria-label={`Role for ${target.id}`} name="role" defaultValue={target.role} disabled={disabled}><RoleOptions /></select></label>
      <button type="submit" disabled={disabled}>Change role for {target.id}</button></form>}
    {hasCapability(actor, target.disabled ? capabilities.reactivate : capabilities.deactivate) &&
      <button disabled={disabled} onClick={() => onChange({ kind: 'set-disabled', userId: target.id, disabled: !target.disabled })}>{target.disabled ? 'Reactivate' : 'Deactivate'} {target.id}</button>}
  </div>;
}
export function changeDescription(change: UserChange): string {
  if (change.kind === 'create') return `Create ${change.email} as ${change.role}?`;
  if (change.kind === 'change-role') return `Change ${change.userId} to ${change.role}?`;
  return `${change.disabled ? 'Deactivate' : 'Reactivate'} ${change.userId}?`;
}
