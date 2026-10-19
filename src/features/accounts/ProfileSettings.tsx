import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { CurrentUser } from '../../contracts';
import { prepareProfilePhoto } from './profile-photo';

export interface ProfileSettingsProps {
  user: CurrentUser;
  onSave: (input: { name: string; image: string | null }, signal: AbortSignal) => Promise<CurrentUser>;
  onUpdated: (user: CurrentUser) => void;
}

export function ProfileSettings(props: ProfileSettingsProps) {
  return <ProfileEditor key={props.user.id} {...props} />;
}

function ProfileEditor({ user, onSave, onUpdated }: ProfileSettingsProps) {
  const [saved, setSaved] = useState({ name: user.name ?? '', image: user.image ?? null });
  const [name, setName] = useState(saved.name);
  const [image, setImage] = useState(saved.image);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; failed: boolean } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoRequest = useRef<AbortController | null>(null);
  const saveRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const nameId = useId(); const photoId = useId(); const hintId = useId();
  const changed = name.trim() !== saved.name || image !== saved.image;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; photoRequest.current?.abort(); saveRequest.current?.abort(); };
  }, []);

  function cancelPhoto() {
    photoRequest.current?.abort(); photoRequest.current = null; setPreparing(false);
    if (photoInput.current) photoInput.current.value = '';
  }
  async function choosePhoto(file: File) {
    if (saveRequest.current) return;
    photoRequest.current?.abort();
    const request = new AbortController(); photoRequest.current = request;
    setPreparing(true); setFeedback(null);
    try {
      const next = await prepareProfilePhoto(file, request.signal);
      if (!mounted.current || request.signal.aborted || photoRequest.current !== request) return;
      setImage(next);
    } catch (error) {
      if (!mounted.current || request.signal.aborted || photoRequest.current !== request) return;
      setFeedback({ text: error instanceof Error ? error.message : 'This photo could not be prepared. Choose another file.', failed: true });
    } finally {
      if (mounted.current && photoRequest.current === request) { photoRequest.current = null; setPreparing(false); }
    }
  }
  function cancelChanges() {
    if (saveRequest.current) return;
    cancelPhoto(); setName(saved.name); setImage(saved.image); setFeedback(null);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveRequest.current || photoRequest.current || !changed) return;
    const displayName = name.trim();
    if (!displayName || displayName.length > 80 || /[\u0000-\u001f\u007f]/u.test(displayName)) {
      setFeedback({ text: 'Enter a name with 1–80 characters.', failed: true }); return;
    }
    const request = new AbortController(); saveRequest.current = request;
    setSaving(true); setFeedback(null);
    try {
      const updated = await onSave({ name: displayName, image }, request.signal);
      if (!mounted.current || request.signal.aborted || saveRequest.current !== request) return;
      if (updated.id !== user.id) throw new Error('Profile identity mismatch.');
      const next = { name: updated.name ?? displayName, image: updated.image ?? null };
      setSaved(next); setName(next.name); setImage(next.image);
      setFeedback({ text: 'Profile saved.', failed: false }); onUpdated(updated);
    } catch {
      if (mounted.current && !request.signal.aborted && saveRequest.current === request) {
        setFeedback({ text: 'We couldn’t confirm the save. Your changes are still here; try again.', failed: true });
      }
    } finally {
      if (mounted.current && saveRequest.current === request) { saveRequest.current = null; setSaving(false); }
    }
  }
  const initials = (name.trim() || user.email || 'You').split(/\s+/u).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return <form className="profile-settings" aria-label="Your profile" aria-busy={saving || preparing} onSubmit={save}>
    <div className="profile-photo-field">
      <div className="profile-photo-preview">{image ? <img src={image} alt="Your profile photo" /> : <span aria-label="Profile initials">{initials}</span>}</div>
      <div className="profile-photo-controls">
        <div className="profile-photo-actions">
          <label className="sr-only" htmlFor={photoId}>Profile photo</label>
          <input hidden ref={photoInput} id={photoId} type="file" accept="image/jpeg,image/png,image/webp" aria-describedby={hintId} disabled={saving}
            onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void choosePhoto(file); }} />
          <button type="button" className="quiet-button profile-photo-picker" aria-describedby={hintId} disabled={saving} onClick={() => photoInput.current?.click()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7.8 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.8L14.5 4Z" /><circle cx="12" cy="13" r="4" /></svg>
            {image ? 'Change photo' : 'Choose photo'}
          </button>
          {(image || preparing) && <button type="button" className="quiet-button" disabled={saving} onClick={() => { cancelPhoto(); setImage(null); setFeedback(null); }}>Remove photo</button>}
        </div>
        <p id={hintId} className="profile-photo-hint">JPG, PNG or WebP · Max 10 MB</p>
      </div>
    </div>
    {preparing && <p role="status">Preparing photo…</p>}
    <label htmlFor={nameId}>Name</label>
    <input id={nameId} name="name" autoComplete="name" required maxLength={80} value={name} disabled={saving} onChange={event => { setName(event.target.value); setFeedback(null); }} />
    <div className="profile-form-actions">
      <button type="submit" className="primary-button" disabled={saving || preparing || !changed || !name.trim()}>{saving ? 'Saving…' : 'Save profile'}</button>
      <button type="button" className="quiet-button" disabled={saving || (!changed && !preparing)} onClick={cancelChanges}>Cancel changes</button>
    </div>
    {feedback && <p role={feedback.failed ? 'alert' : 'status'}>{feedback.text}</p>}
  </form>;
}
