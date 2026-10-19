import { DEFAULT_SETTINGS, type LearnerSettings } from '../contracts';
import { SETTINGS_KEY, loadSettings, parseSettings, type StoragePort } from './settings-store';

export interface AccountSettingsEnvelope { settings: LearnerSettings | null; revision: number }
export interface AccountSettingsApi {
  read(signal: AbortSignal): Promise<AccountSettingsEnvelope>;
  update(input: { settings: LearnerSettings; expectedRevision: number }, signal: AbortSignal): Promise<AccountSettingsEnvelope>;
}
export interface AccountSettingsSnapshot { settings: LearnerSettings; notice: string }

const FIELDS = ['helpEnabled', 'untimedHelp', 'theme', 'sentenceTense', 'preferredMode', 'grammar', 'vocabulary'] as const;
type Field = typeof FIELDS[number];
const MIGRATION_OWNER_KEY = 'lang-lessons.account-settings.migration.v1';
const MAX_CONFLICT_RETRIES = 2;
export function accountSettingsKey(accountId: string): string { return `lang-lessons.account-settings.v1:${encodeURIComponent(accountId)}`; }
function defaults(): LearnerSettings { return { ...DEFAULT_SETTINGS, difficulty: { ...DEFAULT_SETTINGS.difficulty } }; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function value(settings: LearnerSettings, field: Field) { return field === 'grammar' || field === 'vocabulary' ? settings.difficulty[field] : settings[field]; }
function merge(base: LearnerSettings, local: LearnerSettings, fields: Iterable<Field>): LearnerSettings {
  const next = { ...base, difficulty: { ...base.difficulty } };
  for (const field of fields) {
    if (field === 'grammar' || field === 'vocabulary') next.difficulty[field] = local.difficulty[field];
    else Object.assign(next, { [field]: local[field] });
  }
  return next;
}
function decodeEnvelope(input: unknown): AccountSettingsEnvelope {
  if (!record(input) || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new Error('Invalid preferences revision');
  const settings = input.settings === null ? null : parseSettings(input.settings);
  if (input.settings !== null && !settings) throw new Error('Invalid preferences');
  if (settings === null ? input.revision !== 0 : Number(input.revision) < 1) throw new Error('Invalid preferences revision');
  return { settings, revision: Number(input.revision) };
}
function readCache(accountId: string, storage?: StoragePort): { settings: LearnerSettings; dirty: readonly Field[] } | null {
  try {
    const raw = storage?.getItem(accountSettingsKey(accountId));
    if (!raw || raw.length > 16_384) return null;
    const cache: unknown = JSON.parse(raw);
    if (!record(cache) || cache.version !== 1 || cache.accountId !== accountId || !Array.isArray(cache.dirty)
      || cache.dirty.length > FIELDS.length || cache.dirty.some(field => !FIELDS.includes(field as Field))) return null;
    const settings = parseSettings(cache.settings);
    return settings ? { settings, dirty: [...new Set(cache.dirty as Field[])] } : null;
  } catch { return null; }
}
function migrationFallback(accountId: string, storage?: StoragePort): LearnerSettings {
  if (!storage) return defaults();
  try {
    const owner = storage.getItem(MIGRATION_OWNER_KEY);
    if (owner !== null && owner !== accountId) return defaults();
    if (!storage.getItem(SETTINGS_KEY)) return defaults();
    // A legacy device preference belongs to the first migrating account only.
    if (owner === null) storage.setItem(MIGRATION_OWNER_KEY, accountId);
    return loadSettings(storage);
  } catch { return defaults(); }
}

/** Account-scoped optimistic preferences; pending leaves survive reload without rewriting remote siblings. */
export function createAccountSettings({ accountId, api, storage }: {
  accountId: string; api: AccountSettingsApi; storage?: StoragePort | undefined;
}) {
  const cached = readCache(accountId, storage);
  const fallback = cached?.settings ?? migrationFallback(accountId, storage);
  const dirty = new Map<Field, number>();
  let editRevision = 0;
  for (const field of cached?.dirty ?? []) dirty.set(field, ++editRevision);
  let snapshot: AccountSettingsSnapshot = { settings: fallback, notice: dirty.size ? 'Your preferences are waiting to sync.' : '' };
  const listeners = new Set<() => void>();
  const lifetime = new AbortController();
  let disposed = false;
  let work: Promise<void> | null = null;
  let cacheAvailable = Boolean(cached);
  const current = () => !disposed && !lifetime.signal.aborted;
  function publish(settings: LearnerSettings, notice: string) {
    if (!current()) return;
    snapshot = { settings, notice };
    for (const listener of listeners) listener();
  }
  function persist() {
    if (!current() || !storage) { cacheAvailable = false; return; }
    try {
      storage.setItem(accountSettingsKey(accountId), JSON.stringify({ version: 1, accountId, settings: snapshot.settings, dirty: [...dirty.keys()] }));
      cacheAvailable = true;
    } catch { cacheAvailable = false; }
  }
  function applyRemote(remote: LearnerSettings | null) {
    const settings = merge(remote ?? fallback, snapshot.settings, dirty.keys());
    publish(settings, dirty.size ? 'Saving preferences…' : '');
    persist();
  }
  async function synchronize() {
    let conflicts = 0;
    let response = decodeEnvelope(await api.read(lifetime.signal));
    if (!current()) return;
    applyRemote(response.settings);
    // Seed a missing record after its authoritative read. Seed-only fields are not local edits:
    // a concurrent device creating the first record must still win untouched fields.
    while (current() && (dirty.size || response.settings === null)) {
      const submitted = new Map(dirty);
      const submittedSettings = parseSettings(snapshot.settings)!;
      try {
        const updated = decodeEnvelope(await api.update({ settings: submittedSettings, expectedRevision: response.revision }, lifetime.signal));
        if (!current()) return;
        if (!updated.settings || updated.revision <= response.revision) throw new Error('Preferences update was not confirmed');
        response = updated;
        for (const [field, revision] of submitted) if (dirty.get(field) === revision) dirty.delete(field);
        const settings = merge(updated.settings, snapshot.settings, dirty.keys());
        publish(settings, dirty.size ? 'Saving preferences…' : 'Preferences saved.');
        persist();
      } catch (error) {
        if (!current()) return;
        if (!record(error) || error.status !== 409 || conflicts++ >= MAX_CONFLICT_RETRIES) throw error;
        response = decodeEnvelope(await api.read(lifetime.signal));
        if (!current()) return;
        applyRemote(response.settings);
      }
    }
  }
  function sync(): Promise<void> {
    if (!current()) return Promise.resolve();
    if (work) return work;
    let succeeded = false;
    work = Promise.resolve().then(async () => {
      if (!current()) return;
      await synchronize(); succeeded = true;
    }).catch(() => {
      if (!current()) return;
      persist();
      publish(snapshot.settings, dirty.size
        ? cacheAvailable ? 'Preferences saved on this device. They will sync when you reconnect.' : 'Preferences changed for this visit. Reconnect to save them to your account.'
        : 'Your account preferences could not be synced. Try again when you reconnect.');
    }).finally(() => {
      work = null;
      // A subscriber can edit while the final successful notification is being delivered.
      if (succeeded && current() && dirty.size) void sync();
    });
    return work;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { if (!current()) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(next: LearnerSettings) {
      if (!current()) return;
      const safe = parseSettings(next);
      if (!safe) return;
      const changed = FIELDS.filter(field => value(safe, field) !== value(snapshot.settings, field));
      if (!changed.length) return;
      for (const field of changed) dirty.set(field, ++editRevision);
      publish(safe, 'Saving preferences…'); persist();
      // sync catches transport errors; event handlers never leave an unhandled rejection.
      void sync();
    },
    sync,
    dispose() { if (disposed) return; disposed = true; lifetime.abort(); listeners.clear(); },
  };
}
export type AccountSettingsController = ReturnType<typeof createAccountSettings>;
