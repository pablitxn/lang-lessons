import { useEffect, useRef, useState, type FormEvent } from 'react';

type Json = (path: string, body?: unknown, signal?: AbortSignal) => Promise<unknown>;
export function CredentialLinkActions({ userId, disabled, json }: { userId: string; disabled: boolean; json: Json }) {
  const [issued, setIssued] = useState<{ link: string; expiresAt: string } | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => current.current?.abort(), []);
  async function issue(purpose: 'setup' | 'reset') {
    if (busy) return;
    const controller = new AbortController(); current.current = controller; setBusy(true); setIssued(null); setError('');
    try {
      const result = await json('/api/learning/credential-links/issue', { userId, purpose }, controller.signal) as { link: string; expiresAt: string };
      const url = new URL(result.link);
      if (url.origin !== location.origin || url.pathname !== '/account/credentials' || !/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash) || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error();
      if (!controller.signal.aborted) setIssued(result);
    } catch { if (!controller.signal.aborted) setError('Link could not be issued. Check account status and choose setup for a new account or reset for an existing password. If the response was lost, explicitly issue a new link to replace it.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section aria-label={`Credential links for ${userId}`}>
    <button type="button" disabled={disabled || busy} onClick={() => void issue('setup')}>Issue setup link</button>
    <button type="button" disabled={disabled || busy} onClick={() => void issue('reset')}>Issue reset link</button>
    {error && <p role="alert">{error}</p>}
    {issued && <><p>Deliver this single-use link privately. It expires at {issued.expiresAt}. No email was sent. Issuing another link revokes this one.</p>
      <label>Private credential link<input readOnly value={issued.link} onFocus={event => event.currentTarget.select()} /></label>
      <button type="button" onClick={() => setIssued(null)}>Dismiss link</button></>}
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
  return <main><h1>Set your password</h1>{done ? <p role="status">Password saved. Existing sessions have been signed out.</p>
    : !secret.current ? <p role="alert">This link is missing or invalid. Ask your administrator for a new setup or reset link.</p>
      : <form onSubmit={event => void submit(event)}><p>Use a new password of {policy?.min ?? "the required number of"} characters or more (maximum {policy?.max ?? "unavailable"}). This link can be used once.</p>
        <label>New password<input type="password" autoComplete="new-password" minLength={policy?.min} maxLength={policy?.max} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}<button disabled={busy || !policy}>{busy ? 'Saving…' : 'Save password'}</button></form>}
    <a href="/">Return to sign in</a></main>;
}
