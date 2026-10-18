import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import type { CurrentUser } from '../../contracts';
import './accounts.css';

export interface LoginApi {
  /** Adapter owns cookie transport and validation; credentials are never persisted here. */
  login(credentials: { email: string; password: string }, signal: AbortSignal): Promise<CurrentUser | null>;
}
export type AccountState = { status: 'loading' | 'error' | 'anonymous' } | { status: 'authenticated'; user: CurrentUser };
export function AccountShell({ state, loginApi = null, onAuthenticated, children }: {
  state: AccountState; loginApi?: LoginApi | null; onAuthenticated: (user: CurrentUser) => void; children: ReactNode;
}) {
  return <section className="p3-accounts" aria-label="Account">
    {state.status === 'loading' ? <p role="status">Checking account…</p> : state.status === 'error' ? <p role="alert">Account could not be checked. Please reload.</p> : state.status === 'authenticated' ? <><p>Signed in as {state.user.id} · {state.user.role}</p>{children}</> : <LoginForm key={loginApi ? 'bound' : 'unbound'} api={loginApi} onAuthenticated={onAuthenticated} />}
  </section>;
}
function LoginForm({ api, onAuthenticated }: { api: LoginApi | null; onAuthenticated: (user: CurrentUser) => void }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  const error = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    setPending(false); setFailed(false);
    return () => { active.current?.abort(); active.current = null; };
  }, [api]);
  useEffect(() => { if (failed) error.current?.focus(); }, [failed]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api || active.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const controller = new AbortController();
    active.current = controller;
    setPending(true); setFailed(false);
    try {
      const result = await api.login({ email: String(data.get('email')), password: String(data.get('password')) }, controller.signal);
      if (controller.signal.aborted) return;
      form.reset();
      if (result) onAuthenticated(result); else setFailed(true);
    } catch { if (!controller.signal.aborted) { form.reset(); setFailed(true); } }
    finally { if (active.current === controller) { active.current = null; setPending(false); } }
  }
  return <><h1>Sign in</h1>{!api ? <p role="status">Sign-in is not available yet.</p> : <form onSubmit={submit} aria-busy={pending}>
    <label>Email<input name="email" type="email" autoComplete="username" required disabled={pending} /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required disabled={pending} /></label>
    <button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    {failed && <p role="alert" ref={error} tabIndex={-1}>Sign-in failed. Check your details and try again.</p>}
  </form>}</>;
}
