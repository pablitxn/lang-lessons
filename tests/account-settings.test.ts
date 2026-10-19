import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, type LearnerSettings } from '../src/contracts';
import { accountSettingsKey, createAccountSettings, type AccountSettingsApi, type AccountSettingsEnvelope } from '../src/platform/account-settings';
import { SETTINGS_KEY, type StoragePort } from '../src/platform/settings-store';

class MemoryStorage implements StoragePort {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
const settings = (patch: Partial<LearnerSettings> = {}): LearnerSettings => ({ ...DEFAULT_SETTINGS, difficulty: { ...DEFAULT_SETTINGS.difficulty }, ...patch });
const envelope = (value: LearnerSettings | null, revision = value === null ? 0 : 1): AccountSettingsEnvelope => ({ settings: value, revision });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(initial: AccountSettingsEnvelope = envelope(settings())) {
  const storage = new MemoryStorage();
  let remote = initial;
  const reads: AbortSignal[] = [];
  const writes: { settings: LearnerSettings; expectedRevision: number; signal: AbortSignal }[] = [];
  const api: AccountSettingsApi = {
    async read(signal) { reads.push(signal); return remote; },
    async update(input, signal) {
      writes.push({ ...input, signal });
      assert.equal(input.expectedRevision, remote.revision);
      remote = envelope(input.settings, remote.revision + 1); return remote;
    },
  };
  return { storage, api, reads, writes, remote: () => remote, setRemote(value: AccountSettingsEnvelope) { remote = value; } };
}

test('authoritative hydration replaces fallback without writing remote preferences', async () => {
  const f = fixture(envelope(settings({ theme: 'dark', helpEnabled: true }), 4));
  f.storage.setItem(SETTINGS_KEY, JSON.stringify(settings({ theme: 'light' })));
  const controller = createAccountSettings({ accountId: 'first', api: f.api, storage: f.storage });
  assert.equal(controller.getSnapshot().settings.theme, 'light');
  await controller.sync();
  assert.equal(controller.getSnapshot().settings.theme, 'dark'); assert.equal(f.writes.length, 0);
  assert.equal(JSON.parse(f.storage.getItem(accountSettingsKey('first'))!).settings.helpEnabled, true);
  const second = createAccountSettings({ accountId: 'second', api: f.api, storage: f.storage });
  assert.deepEqual(second.getSnapshot().settings, DEFAULT_SETTINGS, 'legacy values cannot leak into the next account');
  controller.dispose(); second.dispose();
});

test('a confirmed missing remote record receives the first account legacy preferences', async () => {
  const f = fixture(envelope(null)); f.storage.setItem(SETTINGS_KEY, JSON.stringify(settings({ theme: 'dark' })));
  const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  await controller.sync(); assert.equal(controller.getSnapshot().settings.theme, 'dark'); assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0]!.expectedRevision, 0); assert.equal(f.remote().settings?.theme, 'dark');
  controller.dispose();
});

test('edits during initial hydration merge only changed leaves including independent difficulty values', async () => {
  const f = fixture(envelope(settings({ theme: 'dark', helpEnabled: true, difficulty: { grammar: 2, vocabulary: 3 } }), 7));
  const reading = deferred<AccountSettingsEnvelope>(); f.api.read = async () => reading.promise;
  const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  const syncing = controller.sync(); await tick();
  controller.update(settings({ difficulty: { grammar: 3, vocabulary: 1 } }));
  reading.resolve(f.remote()); await syncing;
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0]!.settings, settings({ theme: 'dark', helpEnabled: true, difficulty: { grammar: 3, vocabulary: 3 } }));
  assert.equal(f.writes[0]!.expectedRevision, 7); controller.dispose();
});

test('edits arriving during a write stay visible and are serialized after its acknowledgement', async () => {
  const f = fixture(envelope(settings())); const first = deferred<AccountSettingsEnvelope>();
  const writes: { settings: LearnerSettings; expectedRevision: number }[] = [];
  f.api.update = async input => { writes.push(input); return writes.length === 1 ? first.promise : envelope(input.settings, input.expectedRevision + 1); };
  const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  controller.update(settings({ theme: 'dark' })); await tick();
  controller.update(settings({ theme: 'light', difficulty: { grammar: 1, vocabulary: 3 } }));
  assert.equal(writes.length, 1); assert.equal(controller.getSnapshot().settings.theme, 'light');
  first.resolve(envelope(writes[0]!.settings, 2)); await controller.sync();
  assert.equal(writes.length, 2); assert.equal(writes[1]!.expectedRevision, 2);
  assert.equal(writes[1]!.settings.theme, 'light'); assert.equal(writes[1]!.settings.difficulty.vocabulary, 3);
  assert.equal(controller.getSnapshot().settings.theme, 'light');
  assert.deepEqual(JSON.parse(f.storage.getItem(accountSettingsKey('account'))!).dirty, []); controller.dispose();
});

test('a compare-and-swap conflict refreshes siblings while retaining only locally edited leaves', async () => {
  const f = fixture(envelope(settings(), 2)); const update = f.api.update; let attempted = 0;
  f.api.update = async (input, signal) => {
    if (++attempted === 1) { f.setRemote(envelope(settings({ helpEnabled: true, difficulty: { grammar: 2, vocabulary: 3 } }), 3)); throw { status: 409 }; }
    return update(input, signal);
  };
  const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  controller.update(settings({ theme: 'dark' })); await controller.sync();
  assert.equal(attempted, 2); assert.equal(f.reads.length, 2);
  assert.deepEqual(f.remote().settings, settings({ theme: 'dark', helpEnabled: true, difficulty: { grammar: 2, vocabulary: 3 } }));
  controller.dispose();
});

test('conflict retries are bounded and pending preferences remain cached for a later retry', async () => {
  const f = fixture(); let attempts = 0;
  f.api.update = async () => { attempts++; throw { status: 409 }; };
  const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  controller.update(settings({ helpEnabled: true })); await controller.sync();
  assert.equal(attempts, 3); assert.equal(f.reads.length, 3);
  assert.deepEqual(JSON.parse(f.storage.getItem(accountSettingsKey('account'))!).dirty, ['helpEnabled']);
  assert.match(controller.getSnapshot().notice, /sync when you reconnect/); controller.dispose();
});

test('offline pending edits survive controller replacement and merge with newer server preferences', async () => {
  const f = fixture(); const read = f.api.read; f.api.read = async () => { throw new Error('Offline'); };
  const first = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  first.update(settings({ theme: 'dark' })); await first.sync(); first.dispose();
  f.api.read = read; f.setRemote(envelope(settings({ helpEnabled: true, difficulty: { grammar: 3, vocabulary: 2 } }), 5));
  const second = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  assert.equal(second.getSnapshot().settings.theme, 'dark'); await second.sync();
  assert.deepEqual(f.remote().settings, settings({ theme: 'dark', helpEnabled: true, difficulty: { grammar: 3, vocabulary: 2 } }));
  assert.deepEqual(JSON.parse(f.storage.getItem(accountSettingsKey('account'))!).dirty, []); second.dispose();
});

test('a failed update retains pending work and an explicit sync retries without rejecting callers', async () => {
  const f = fixture(); const update = f.api.update; let offline = true;
  f.api.update = async (input, signal) => { if (offline) throw new Error('Private transport failure'); return update(input, signal); };
  const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  controller.update(settings({ theme: 'dark' })); await assert.doesNotReject(controller.sync());
  assert.doesNotMatch(controller.getSnapshot().notice, /Private/);
  offline = false; await controller.sync(); assert.equal(f.remote().settings?.theme, 'dark'); controller.dispose();
});

test('account cache lookup rejects foreign identities and malformed leaf journals', () => {
  const f = fixture();
  for (const cache of [
    { version: 1, accountId: 'other', settings: settings({ theme: 'dark' }), dirty: ['theme'] },
    { version: 1, accountId: 'account', settings: settings({ theme: 'dark' }), dirty: ['token'] },
    { version: 1, accountId: 'account', settings: { ...settings(), theme: 'invalid' }, dirty: [] },
  ]) {
    f.storage.setItem(accountSettingsKey('account'), JSON.stringify(cache));
    const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
    assert.deepEqual(controller.getSnapshot().settings, DEFAULT_SETTINGS); controller.dispose();
  }
});

test('StrictMode-style disposal and recreation cannot let an old hydration overwrite the replacement', async () => {
  const f = fixture(); const firstRead = deferred<AccountSettingsEnvelope>(); let reads = 0; let oldSignal!: AbortSignal;
  f.api.read = async signal => { if (++reads === 1) { oldSignal = signal; return firstRead.promise; } return envelope(settings({ theme: 'light' }), 4); };
  const first = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  let oldNotifications = 0; first.subscribe(() => oldNotifications++);
  const firstSync = first.sync(); await tick(); first.dispose(); assert.equal(oldSignal.aborted, true);
  const second = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage }); await second.sync();
  const saved = f.storage.getItem(accountSettingsKey('account'));
  firstRead.resolve(envelope(settings({ theme: 'dark' }), 1)); await firstSync;
  assert.equal(oldNotifications, 0); assert.equal(f.storage.getItem(accountSettingsKey('account')), saved);
  assert.equal(second.getSnapshot().settings.theme, 'light'); second.dispose();
});

test('disposing an in-flight write preserves its pending cache and fences the late acknowledgement', async () => {
  const f = fixture(); const writing = deferred<AccountSettingsEnvelope>(); let signal!: AbortSignal;
  f.api.update = async (_input, requestSignal) => { signal = requestSignal; return writing.promise; };
  const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  controller.update(settings({ theme: 'dark' })); const syncing = controller.sync(); await tick();
  controller.dispose(); const saved = f.storage.getItem(accountSettingsKey('account'));
  writing.resolve(envelope(settings({ theme: 'dark' }), 1)); await syncing;
  assert.equal(signal.aborted, true); assert.equal(f.storage.getItem(accountSettingsKey('account')), saved);
  assert.deepEqual(JSON.parse(saved!).dirty, ['theme']);
});

test('storage failures retain in-memory changes without claiming durable device persistence', async () => {
  const f = fixture(); f.api.read = async () => { throw new Error('Offline'); };
  const storage: StoragePort = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage full'); }, removeItem() {} };
  const controller = createAccountSettings({ accountId: 'account', api: f.api, storage });
  controller.update(settings({ theme: 'dark' })); await controller.sync();
  assert.equal(controller.getSnapshot().settings.theme, 'dark'); assert.match(controller.getSnapshot().notice, /for this visit/);
  assert.doesNotMatch(controller.getSnapshot().notice, /saved on this device/); controller.dispose();
});

test('a concurrent first-record creation wins seeded fields that were not locally edited', async () => {
  const f = fixture(envelope(null)); let attempts = 0;
  f.storage.setItem(SETTINGS_KEY, JSON.stringify(settings({ theme: 'dark', helpEnabled: true })));
  f.api.update = async () => {
    attempts++; f.setRemote(envelope(settings({ theme: 'light', difficulty: { grammar: 3, vocabulary: 2 } }), 1));
    throw { status: 409 };
  };
  const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  await controller.sync(); assert.equal(attempts, 1);
  assert.deepEqual(controller.getSnapshot().settings, f.remote().settings);
  assert.deepEqual(JSON.parse(f.storage.getItem(accountSettingsKey('account'))!).dirty, []); controller.dispose();
});

test('malformed remote revision pairs never hydrate or seed account preferences', async () => {
  for (const response of [envelope(null, 1), envelope(settings({ theme: 'dark' }), 0)]) {
    const f = fixture(response); const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
    await controller.sync(); assert.equal(f.writes.length, 0); assert.deepEqual(controller.getSnapshot().settings, DEFAULT_SETTINGS);
    assert.match(controller.getSnapshot().notice, /could not be synced/); controller.dispose();
  }
});

test('a failed initial read never seeds legacy preferences into an unknown remote record', async () => {
  const f = fixture(envelope(null)); f.storage.setItem(SETTINGS_KEY, JSON.stringify(settings({ theme: 'dark' })));
  f.api.read = async () => { throw new Error('Offline'); };
  const controller = createAccountSettings({ accountId: 'account', api: f.api, storage: f.storage });
  await controller.sync(); assert.equal(f.writes.length, 0); assert.equal(controller.getSnapshot().settings.theme, 'dark');
  controller.dispose();
});
