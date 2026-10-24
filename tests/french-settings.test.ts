import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, type LearnerSettings } from '../src/contracts';
import { createAccountSettings, accountSettingsKey, type AccountSettingsApi, type AccountSettingsEnvelope } from '../src/platform/account-settings';
import { parseSettings, saveSettings, loadSettings, type StoragePort } from '../src/platform/settings-store';

class MemoryStorage implements StoragePort {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
const preferences = (patch: Partial<LearnerSettings> = {}): LearnerSettings => ({
  ...DEFAULT_SETTINGS, difficulty: { ...DEFAULT_SETTINGS.difficulty }, ...patch,
});

test('legacy settings preserve English preferences and adopt English as the learning language', () => {
  const { learningLanguage: _language, ...legacy } = preferences({
    sentenceTense: 'past-perfect', theme: 'dark', helpEnabled: true,
    difficulty: { grammar: 3, vocabulary: 2 },
  });
  assert.deepEqual(parseSettings(legacy), { ...legacy, learningLanguage: 'en' });
});

test('French settings round-trip with accents independent from English tense identifiers', () => {
  const storage = new MemoryStorage();
  const french = preferences({ learningLanguage: 'fr', sentenceTense: 'fr-passe-compose' });
  assert.equal(saveSettings(french, storage), true);
  assert.deepEqual(loadSettings(storage), french);
  assert.equal(parseSettings({ ...french, sentenceTense: 'present-perfect' })?.sentenceTense, 'all');
  assert.equal(parseSettings({ ...french, learningLanguage: 'en' })?.sentenceTense, 'all');
  assert.equal(parseSettings({ ...french, learningLanguage: 'de' }), null);
  assert.equal(parseSettings({ ...french, learningLanguage: null }), null);
});

test('offline French selection survives reload and preserves unrelated newer account preferences', async () => {
  const storage = new MemoryStorage();
  let offline = true;
  let remote: AccountSettingsEnvelope = { settings: preferences(), revision: 1 };
  const writes: LearnerSettings[] = [];
  const api: AccountSettingsApi = {
    async read() { if (offline) throw new Error('Offline'); return structuredClone(remote); },
    async update(input) {
      assert.equal(input.expectedRevision, remote.revision);
      writes.push(structuredClone(input.settings));
      remote = { settings: input.settings, revision: remote.revision + 1 };
      return structuredClone(remote);
    },
  };
  const first = createAccountSettings({ accountId: 'student-fr', api, storage });
  first.update(preferences({ learningLanguage: 'fr', sentenceTense: 'fr-imparfait' }));
  await first.sync(); first.dispose();
  assert.equal(writes.length, 0);
  assert.deepEqual(JSON.parse(storage.getItem(accountSettingsKey('student-fr'))!).dirty.sort(), ['learningLanguage', 'sentenceTense']);
  remote = { settings: preferences({ theme: 'dark', difficulty: { grammar: 3, vocabulary: 2 } }), revision: 7 };
  offline = false;
  const restored = createAccountSettings({ accountId: 'student-fr', api, storage });
  assert.equal(restored.getSnapshot().settings.learningLanguage, 'fr');
  await restored.sync();
  assert.deepEqual(remote.settings, preferences({ learningLanguage: 'fr', sentenceTense: 'fr-imparfait', theme: 'dark', difficulty: { grammar: 3, vocabulary: 2 } }));
  assert.deepEqual(JSON.parse(storage.getItem(accountSettingsKey('student-fr'))!).dirty, []);
  restored.dispose();
  const anotherAccount = createAccountSettings({ accountId: 'student-en', api, storage });
  assert.equal(anotherAccount.getSnapshot().settings.learningLanguage, 'en', 'Another account cannot inherit the first account language cache');
  anotherAccount.dispose();
});

test('a revision conflict retains the requested language without copying an incompatible remote tense', async () => {
  const storage = new MemoryStorage();
  let remote: AccountSettingsEnvelope = { settings: preferences(), revision: 2 };
  let attempts = 0;
  const api: AccountSettingsApi = {
    async read() { return structuredClone(remote); },
    async update(input) {
      if (++attempts === 1) {
        remote = { settings: preferences({ theme: 'dark', sentenceTense: 'past-perfect', helpEnabled: true }), revision: 3 };
        throw { status: 409 };
      }
      assert.equal(input.expectedRevision, 3);
      assert.equal(input.settings.learningLanguage, 'fr');
      assert.equal(input.settings.sentenceTense, 'all', 'An English tense must not enter a French preference snapshot');
      remote = { settings: input.settings, revision: 4 };
      return structuredClone(remote);
    },
  };
  const controller = createAccountSettings({ accountId: 'student', api, storage });
  controller.update(preferences({ learningLanguage: 'fr' }));
  await controller.sync();
  assert.equal(attempts, 2);
  assert.deepEqual(controller.getSnapshot().settings, preferences({ learningLanguage: 'fr', theme: 'dark', helpEnabled: true }));
  controller.dispose();
});

test('failed synchronization never exposes or caches an English tense with a pending French selection', async () => {
  const storage = new MemoryStorage();
  let offline = true;
  const api: AccountSettingsApi = {
    async read() {
      if (offline) throw new Error('Offline');
      return { settings: preferences({ sentenceTense: 'past-perfect', theme: 'dark', difficulty: { grammar: 2, vocabulary: 3 } }), revision: 8 };
    },
    async update(input) {
      assert.equal(input.settings.learningLanguage, 'fr');
      assert.equal(input.settings.sentenceTense, 'all');
      throw new Error('Write unavailable');
    },
  };
  const first = createAccountSettings({ accountId: 'student', api, storage });
  first.update(preferences({ learningLanguage: 'fr' })); await first.sync(); first.dispose();
  offline = false;
  const restored = createAccountSettings({ accountId: 'student', api, storage });
  const observed: LearnerSettings[] = [];
  restored.subscribe(() => observed.push(restored.getSnapshot().settings));
  await restored.sync();
  assert.ok(observed.length > 0);
  for (const settings of observed) {
    assert.equal(settings.learningLanguage, 'fr'); assert.equal(settings.sentenceTense, 'all');
  }
  const expected = preferences({ learningLanguage: 'fr', theme: 'dark', difficulty: { grammar: 2, vocabulary: 3 } });
  assert.deepEqual(restored.getSnapshot().settings, expected);
  assert.deepEqual(JSON.parse(storage.getItem(accountSettingsKey('student'))!).settings, expected);
  restored.dispose();
  const reloaded = createAccountSettings({ accountId: 'student', api, storage });
  assert.deepEqual(reloaded.getSnapshot().settings, expected); reloaded.dispose();
});
