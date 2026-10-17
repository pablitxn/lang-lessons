import { DEFAULT_SETTINGS, type LearnerSettings } from '../contracts';

export const SETTINGS_KEY = 'lang-lessons.settings.v1';
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
function defaults(): LearnerSettings {
  return { ...DEFAULT_SETTINGS, difficulty: { ...DEFAULT_SETTINGS.difficulty } };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isLevel(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}
/** Reconstruct allowed fields so extra stored values are never propagated. */
export function parseSettings(value: unknown): LearnerSettings | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.helpEnabled !== 'boolean'
    || (value.untimedHelp !== undefined && typeof value.untimedHelp !== 'boolean')
    || (value.theme !== undefined && (typeof value.theme !== 'string' || !['system', 'light', 'dark'].includes(value.theme)))
    || !isRecord(value.difficulty) || !isLevel(value.difficulty.grammar)
    || !isLevel(value.difficulty.vocabulary)
    || !['verb-image', 'verb-visible', 'sentence'].includes(String(value.preferredMode))) return null;
  return {
    schemaVersion: 1, helpEnabled: value.helpEnabled, untimedHelp: value.untimedHelp === true,
    difficulty: { grammar: value.difficulty.grammar, vocabulary: value.difficulty.vocabulary },
    preferredMode: value.preferredMode as LearnerSettings['preferredMode'],
    theme: (value.theme as LearnerSettings['theme'] | undefined) ?? 'system',
  };
}
export function browserStorage(): StoragePort | undefined {
  try { return window.localStorage; } catch { return undefined; }
}
export function loadSettings(storage?: StoragePort): LearnerSettings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (!raw || raw.length > 4096) return defaults();
    return parseSettings(JSON.parse(raw)) ?? defaults();
  } catch { return defaults(); }
}
export function saveSettings(settings: LearnerSettings, storage?: StoragePort): boolean {
  const safe = parseSettings(settings);
  if (!safe || !storage) return false;
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(safe)); return true; } catch { return false; }
}
export function resetSettings(storage?: StoragePort): boolean {
  if (!storage) return false;
  try { storage.removeItem(SETTINGS_KEY); return true; } catch { return false; }
}
