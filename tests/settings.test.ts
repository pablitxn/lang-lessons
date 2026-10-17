import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS } from '../src/contracts';
import { SETTINGS_KEY, loadSettings, parseSettings, resetSettings, saveSettings, type StoragePort } from '../src/platform/settings-store';

class MemoryStorage implements StoragePort {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
test('preferences round-trip with grammar and vocabulary independent', () => {
  const storage = new MemoryStorage();
  const settings = { ...DEFAULT_SETTINGS, helpEnabled: true, untimedHelp: true, difficulty: { grammar: 3 as const, vocabulary: 1 as const } };
  assert.equal(saveSettings(settings, storage), true);
  assert.deepEqual(loadSettings(storage), settings);
});
test('malformed, unknown-version and out-of-range stored preferences fall back safely', () => {
  const storage = new MemoryStorage();
  for (const value of ['{bad', 'null', '[]', 'x'.repeat(4097), JSON.stringify({ ...DEFAULT_SETTINGS, schemaVersion: 2 }), JSON.stringify({ ...DEFAULT_SETTINGS, difficulty: { grammar: 8, vocabulary: 1 } })]) {
    storage.setItem(SETTINGS_KEY, value);
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  }
});
test('storage outages do not prevent a local lesson or mutate shared defaults', () => {
  const unavailable: StoragePort = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  assert.deepEqual(loadSettings(unavailable), DEFAULT_SETTINGS);
  assert.equal(saveSettings(DEFAULT_SETTINGS, unavailable), false);
  assert.equal(resetSettings(unavailable), false);
  assert.equal(saveSettings(DEFAULT_SETTINGS), false);
  const copy = loadSettings();
  copy.difficulty.grammar = 3;
  assert.equal(DEFAULT_SETTINGS.difficulty.grammar, 1);
});
test('only the allowed preferences are persisted and reset preserves other applications', () => {
  const storage = new MemoryStorage();
  const input = { ...DEFAULT_SETTINGS, transcript: 'private content', providerMode: 'openai-realtime', token: 'fixture-only' };
  storage.setItem('other-app', 'keep');
  assert.equal(saveSettings(input, storage), true);
  assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_KEY)!), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(input), DEFAULT_SETTINGS);
  assert.equal(resetSettings(storage), true);
  assert.equal(storage.getItem(SETTINGS_KEY), null);
  assert.equal(storage.getItem('other-app'), 'keep');
});
test('older version-one preferences adopt the added accessibility default', () => {
  const { untimedHelp: _omitted, ...original } = DEFAULT_SETTINGS;
  assert.deepEqual(parseSettings(original), DEFAULT_SETTINGS);
});
test('existing preferences adopt system appearance without losing learning settings', () => {
  const { theme: _theme, ...original } = { ...DEFAULT_SETTINGS, helpEnabled: true };
  assert.deepEqual(parseSettings(original), { ...DEFAULT_SETTINGS, helpEnabled: true });
  for (const theme of ['light', 'dark', 'system'] as const) {
    const storage = new MemoryStorage();
    assert.equal(saveSettings({ ...DEFAULT_SETTINGS, theme }, storage), true);
    assert.equal(loadSettings(storage).theme, theme);
  }
  assert.equal(parseSettings({ ...DEFAULT_SETTINGS, theme: 'invalid' }), null);
  assert.equal(parseSettings({ ...DEFAULT_SETTINGS, theme: ['dark'] }), null);
});
