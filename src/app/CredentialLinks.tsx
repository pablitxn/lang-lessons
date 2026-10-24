import { useEffect, useRef, useState, type FormEvent } from 'react';
import './credentials.css';

type Json = (path: string, body?: unknown, signal?: AbortSignal) => Promise<unknown>;
export function CredentialLinkActions({ userId, email, credentialStatus, disabled, json }: {
  userId: string; email?: string | undefined; credentialStatus?: 'ready' | 'setup-required' | undefined; disabled: boolean; json: Json;
}) {
  const [issued, setIssued] = useState<{ link: string; expiresAt: string } | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => () => current.current?.abort(), []);
  async function issue(purpose: 'setup' | 'reset') {
    if (current.current) return;
    const controller = new AbortController(); current.current = controller; setBusy(true); setIssued(null); setError(''); setCopied(false);
    try {
      const result = await json('/api/learning/credential-links/issue', { userId, purpose }, controller.signal) as { link: string; expiresAt: string };
      const url = new URL(result.link);
      if (url.origin !== location.origin || url.pathname !== '/account/credentials' || !/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash) || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error();
      if (!controller.signal.aborted) setIssued(result);
    } catch { if (!controller.signal.aborted) setError('Link could not be issued. Check account status and choose setup for a new account or reset for an existing password. If the response was lost, explicitly issue a new link to replace it.'); }
    finally { if (current.current === controller) { current.current = null; if (!controller.signal.aborted) setBusy(false); } }
  }
  return <section className="credential-actions" aria-label={`Credential links for ${email ?? 'this account'}`}>
    <h3>Sign-in access</h3>
    <p className="p3-field-help">{disabled ? 'Reactivate this account before preparing access.' : credentialStatus === 'ready'
      ? 'This account has a password. Use its email and password on the sign-in page.'
      : 'Create a private setup link so this person can choose a password, then sign in with their email.'}</p>
    {credentialStatus !== 'ready' && <button className="p3-secondary-button" type="button" disabled={disabled || busy} onClick={() => void issue('setup')}>{busy ? 'Preparing link…' : 'Create setup link'}</button>}
    {credentialStatus !== 'setup-required' && <button className="p3-secondary-button" type="button" disabled={disabled || busy} onClick={() => void issue('reset')}>{busy ? 'Preparing link…' : 'Create password reset link'}</button>}
    {error && <p role="alert">{error}</p>}
    {issued && <div className="credential-link-result"><p><strong>Link ready{email ? ` for ${email}` : ''}.</strong> Send it privately. No email was sent.</p>
      <p className="p3-field-help">Expires {new Date(issued.expiresAt).toLocaleString()}. It works once; a new link replaces this one.</p>
      <label>Private credential link<input readOnly value={issued.link} onFocus={event => event.currentTarget.select()} /></label>
      <button className="p3-primary-button" type="button" onClick={() => { void navigator.clipboard.writeText(issued.link).then(() => setCopied(true)).catch(() => setError('Copy is unavailable. Select the link above and copy it manually.')); }}>{copied ? 'Copied' : 'Copy private link'}</button>
      <button className="p3-secondary-button" type="button" onClick={() => { setIssued(null); setCopied(false); }}>Dismiss link</button>
      {copied && <p role="status">Private link copied.</p>}</div>}
  </section>;
}

/** Token arrives only from the fragment cleared in main.tsx, never from storage or query parameters. */
export function CredentialRedemption({ token }: { token: string | null }) {
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [error, setError] = useState('');
  const [policy, setPolicy] = useState<{ min: number; max: number } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/learning/credential-links/policy', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(); const value = await response.json();
      if (!Number.isSafeInteger(value.min) || !Number.isSafeInteger(value.max) || value.min < 1 || value.max < value.min || value.max > 1024) throw new Error();
      if (!controller.signal.aborted) setPolicy(value);
    }).catch(() => { if (!controller.signal.aborted) setError('Password policy is unavailable. Reload this page with a valid link when the account service is ready.'); });
    return () => controller.abort();
  }, []);
  const secret = useRef(token); const current = useRef<AbortController | null>(null);
  useEffect(() => () => { current.current?.abort(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !secret.current || !policy) return;
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    const controller = new AbortController(); current.current = controller; setBusy(true); setError('');
    try {
      const response = await fetch('/api/learning/credential-links/redeem', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: secret.current, password }), signal: controller.signal });
      if (!response.ok) throw new Error();
      secret.current = null; setDone(true);
    } catch { if (!controller.signal.aborted) setError('The link could not be used. It may have expired, been replaced or already been used. Try signing in, or ask an administrator for a new link.'); }
    finally { if (!controller.signal.aborted) { setPassword(''); setConfirmation(''); setBusy(false); } }
  }
  return <main className="p3-accounts credential-page"><a className="brand" href="/"><span className="brand-mark" aria-hidden="true">e.</span>Lang Lessons</a><div className="credential-card"><p className="eyebrow">Your account</p><h1>Set your password</h1>{done ? <><p role="status">Password saved. Existing sessions have been signed out.</p><p>Sign in with your account email and the password you just chose. Student accounts open the lesson catalog.</p></>
    : !secret.current ? <p role="alert">This link is missing or invalid. Ask your administrator for a new setup or reset link.</p>
      : <form onSubmit={event => void submit(event)}><p>Use a new password of {policy?.min ?? "the required number of"} characters or more (maximum {policy?.max ?? "unavailable"}). This link can be used once.</p>
        <label>New password<input type="password" autoComplete="new-password" minLength={policy?.min} maxLength={policy?.max} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}<button className="p3-primary-button" disabled={busy || !policy}>{busy ? 'Saving…' : 'Save password'}</button></form>}
    <a className="credential-return" href="/">Return to sign in →</a></div></main>;
}
