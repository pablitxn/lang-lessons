import { useEffect, useId, useRef, useState, type ReactNode, type FormEvent } from 'react';
import type { CurrentUser, Role } from '../../contracts';
import './accounts.css';

export interface LoginApi {
  /** Adapter owns cookie transport and validation; credentials are never persisted here. */
  login(credentials: { email: string; password: string }, signal: AbortSignal): Promise<CurrentUser | null>;
}
export type AccountState = { status: 'loading' | 'error' | 'anonymous' } | { status: 'authenticated'; user: CurrentUser };
const roleLabels: Record<Role, string> = { student: 'Student', professor: 'Teacher', administrator: 'Administrator' };

export function AccountShell({ state, loginApi = null, onAuthenticated, onSignOut, profileSettings, children }: {
  state: AccountState;
  loginApi?: LoginApi | null;
  onAuthenticated: (user: CurrentUser) => void;
  onSignOut?: () => Promise<void>;
  profileSettings?: ReactNode;
  children: ReactNode;
}) {
  return <section className="p3-accounts" aria-label="Account">
    {state.status === 'loading' ? <div className="p3-account-notice"><p role="status">Checking your account…</p></div>
      : state.status === 'error' ? <div className="p3-account-notice"><h1>We couldn’t open your account.</h1><p role="alert">Please reload the page to try again.</p></div>
        : state.status === 'authenticated' ? <><SignedInHeader key={state.user.id} user={state.user} onSignOut={onSignOut} profileSettings={profileSettings} />{children}</>
          : <LoginForm key={loginApi ? 'bound' : 'unbound'} api={loginApi} onAuthenticated={onAuthenticated} />}
  </section>;
}

function SignedInHeader({ user, onSignOut, profileSettings }: { user: CurrentUser; onSignOut: (() => Promise<void>) | undefined; profileSettings?: ReactNode }) {
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function signOut() {
    if (!onSignOut || active.current) return;
    active.current = true; setPending(true); setFailed(false);
    try { await onSignOut(); }
    catch { if (mounted.current) setFailed(true); }
    finally { active.current = false; if (mounted.current) setPending(false); }
  }
  const name = user.name?.trim() || roleLabels[user.role];
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <><header className="p3-account-header">
    <div className="p3-account-identity"><div>
      <p className="p3-account-email">{user.name?.trim() || 'English practice'}</p><span className="p3-role-label">{roleLabels[user.role]}</span>
    </div></div>
    <button className="p3-profile-button" type="button" aria-label="Preferences" title="Preferences" aria-haspopup="dialog" aria-expanded={preferencesOpen} onClick={() => setPreferencesOpen(true)}>
      {user.image ? <img src={user.image} alt="" /> : <span aria-hidden="true">{initials}</span>}
    </button>
  </header>{preferencesOpen && <AccountPreferences onClose={() => setPreferencesOpen(false)}>
    <h3>Profile</h3>
    {profileSettings ?? <div className="p3-profile-summary"><p>{name}</p>{user.email && <p>{user.email}</p>}</div>}
    {onSignOut && <div className="p3-profile-sign-out"><button className="p3-secondary-button" type="button" disabled={pending} onClick={() => void signOut()}>{pending ? 'Signing out…' : 'Sign out'}</button></div>}
    {failed && <p className="p3-form-error" role="alert">We couldn’t confirm sign-out. Your account is still open here. Please try again.</p>}
  </AccountPreferences>}</>;
}

function AccountPreferences({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = 'hidden';
    return () => {
      element?.close(); document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={dialog} className="p3-account-preferences" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="p3-preferences-heading"><h2 id={titleId}>Preferences</h2><button type="button" className="p3-secondary-button p3-preferences-close" aria-label="Close preferences" onClick={onClose}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
    </button></div>
    {children}
  </dialog>;
}

function LoginForm({ api, onAuthenticated }: { api: LoginApi | null; onAuthenticated: (user: CurrentUser) => void }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const active = useRef<AbortController | null>(null);
  const error = useRef<HTMLParagraphElement>(null);
  const password = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setPending(false); setFailed(false);
    return () => { active.current?.abort(); active.current = null; };
  }, [api]);
  useEffect(() => { if (failed) error.current?.focus(); }, [failed]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api || active.current) return;
    const data = new FormData(event.currentTarget);
    const controller = new AbortController();
    active.current = controller;
    setPending(true); setFailed(false);
    try {
      const result = await api.login({ email: String(data.get('email')).trim(), password: String(data.get('password')) }, controller.signal);
      if (controller.signal.aborted) return;
      if (password.current) password.current.value = '';
      setShowPassword(false);
      if (result) onAuthenticated(result); else setFailed(true);
    } catch {
      if (!controller.signal.aborted) {
        if (password.current) password.current.value = '';
        setShowPassword(false); setFailed(true);
      }
    } finally { if (active.current === controller) { active.current = null; setPending(false); } }
  }
  return <div className="p3-login-layout">
    <aside className="p3-login-welcome" aria-label="Welcome to Lang Lessons">
      <span className="p3-eyebrow">A little, every day</span>
      <h2>Make room <br />for your English.</h2>
      <p>Words, sentences and small wins. <br />Your next lesson starts here.</p>
      <div className="p3-login-wordcard" aria-hidden="true"><span>learn</span><span>learned</span><span>learned</span><div>One step at a time <span>↗</span></div></div>
      <p className="p3-login-caption">Practice at your pace.</p>
    </aside>
    <div className="p3-login-panel">
      <span className="p3-eyebrow">Your learning space</span><h1>Welcome back.</h1>
      <p className="p3-login-intro">Sign in with your email and password.</p>
      {!api ? <p role="status">Sign-in is not available yet.</p> : <form className="p3-login-form" onSubmit={submit} aria-busy={pending}>
        <label>Email<input name="email" type="email" autoComplete="username" placeholder="you@example.com" required disabled={pending} autoCapitalize="none" spellCheck={false} /></label>
        <label htmlFor="p3-login-password">Password</label>
        <div className="p3-password-input"><input ref={password} id="p3-login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Your password" required disabled={pending} />
          <button type="button" className="p3-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={pending} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div>
        {failed && <p className="p3-form-error" role="alert" ref={error} tabIndex={-1}>Sign-in failed. Check your email and password, or ask your administrator for a password setup or reset link.</p>}
        <button className="p3-primary-button p3-sign-in" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}<span aria-hidden="true">→</span></button>
      </form>}
      <div className="p3-login-help"><h2>First time here?</h2><p>Ask your administrator for an account and a password setup link. Open the link to choose your password, then sign in with your email.</p>
        <details><summary>Forgot your password?</summary><p>Ask your administrator for a password reset link. Setup and reset links are shared directly; no email is sent automatically.</p></details>
      </div>
    </div>
  </div>;
}
