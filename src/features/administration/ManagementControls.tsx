import { useState, type FormEvent } from 'react';
import type { CurrentUser, Role } from '../../contracts';
import { hasCapability } from '../accounts/access';
import { accountLabel, roleDescriptions, roleLabels, type ManagedUser, type ManagementCapabilities, type UserChange } from './management';
const roles: readonly Role[] = ['student', 'professor', 'administrator'];
function RoleOptions() { return <>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</>; }
type RequestChange = (change: UserChange, displayName?: string) => void;

export function CreateUserForm({ disabled, onChange }: { disabled: boolean; onChange: RequestChange }) {
  const [role, setRole] = useState<Role>('student');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const data = new FormData(event.currentTarget);
    onChange({ kind: 'create', email: String(data.get('email')).trim(), role });
  }
  return <aside className="p3-create-panel"><form className="p3-management-form" onSubmit={submit}>
    <span className="p3-eyebrow">Invite someone in</span><h2>Create an account</h2>
    <p>Give a learner a place to practice.</p>
    <label>Email address<input aria-label="New user email" name="email" type="email" placeholder="student@example.com" autoComplete="off" autoCapitalize="none" spellCheck={false} required disabled={disabled} /></label>
    <label>Account type<select aria-label="New user role" aria-describedby="p3-new-role-description" name="role" required value={role} onChange={event => setRole(event.currentTarget.value as Role)} disabled={disabled}><RoleOptions /></select></label>
    <p id="p3-new-role-description" className="p3-field-help">{roleDescriptions[role]}</p>
    <button className="p3-primary-button" disabled={disabled} type="submit">Create account <span aria-hidden="true">+</span></button>
  </form><div className="p3-create-next"><h3>Then, help them sign in</h3><ol><li>Create their password setup link from their account card.</li><li>Share the link directly so they can choose a password.</li><li>They sign in with this email and start a lesson.</li></ol><p>No invitation email is sent automatically.</p></div></aside>;
}

export function UserActions({ target, actor, capabilities, disabled, onChange }: {
  target: ManagedUser; actor: CurrentUser; capabilities: ManagementCapabilities; disabled: boolean; onChange: RequestChange;
}) {
  const [role, setRole] = useState<Role>(target.role);
  const name = accountLabel(target);
  return <div className="p3-management-actions">
    {hasCapability(actor, capabilities.changeRole) && <form onSubmit={event => {
      event.preventDefault();
      if (!disabled && role !== target.role) onChange({ kind: 'change-role', userId: target.id, role }, name);
    }}><label>Account type<select aria-label={`Role for ${name}`} name="role" value={role} onChange={event => setRole(event.currentTarget.value as Role)} disabled={disabled}><RoleOptions /></select></label>
      <button className="p3-secondary-button" aria-label={`Change role for ${name}`} type="submit" disabled={disabled || role === target.role}>Save role</button></form>}
    {hasCapability(actor, target.disabled ? capabilities.reactivate : capabilities.deactivate) &&
      <button className={target.disabled ? 'p3-secondary-button' : 'p3-text-button'} type="button" aria-label={`${target.disabled ? 'Reactivate' : 'Deactivate'} ${name}`} disabled={disabled} onClick={() => onChange({ kind: 'set-disabled', userId: target.id, disabled: !target.disabled }, name)}>{target.disabled ? 'Reactivate account' : 'Deactivate account'}</button>}
  </div>;
}
export function changeDescription(change: UserChange, displayName?: string): string {
  if (change.kind === 'create') return `Create ${change.email} as a ${roleLabels[change.role].toLowerCase()}? They will need a password setup link before they can sign in.`;
  const name = displayName || 'this account';
  if (change.kind === 'change-role') return `Change ${name} to ${roleLabels[change.role].toLowerCase()}? ${roleDescriptions[change.role]}`;
  return change.disabled ? `Deactivate ${name}? They will no longer be able to sign in or continue their current session.` : `Reactivate ${name}? They will be able to sign in again once their password is set up.`;
}
