export type VoiceStartFailureCategory = 'authentication' | 'permission' | 'quota'
  | 'credits-exhausted' | 'project-spend-limit' | 'organization-spend-limit' | 'usage-limit'
  | 'rate-limit' | 'configuration' | 'model-unavailable' | 'unavailable' | 'rejected';

/** Server-authored diagnostic metadata; provider text is never part of this contract. */
export interface VoiceStartFailure { category: VoiceStartFailureCategory; status: number }

export function parseVoiceStartFailure(value: unknown): VoiceStartFailure | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 2 || !('category' in value) || !('status' in value)
    || typeof value.status !== 'number' || !Number.isInteger(value.status)
    || value.status < 400 || value.status > 599) return null;
  const { status } = value;
  switch (value.category) {
    case 'authentication': return status === 401 ? { category: value.category, status } : null;
    case 'permission': return status === 403 ? { category: value.category, status } : null;
    case 'quota': case 'credits-exhausted': case 'project-spend-limit':
    case 'organization-spend-limit': case 'usage-limit': case 'rate-limit':
      return status === 429 ? { category: value.category, status } : null;
    case 'configuration': return status === 400 || status === 422 ? { category: value.category, status } : null;
    case 'model-unavailable': return status === 404 ? { category: value.category, status } : null;
    case 'unavailable': return status >= 500 ? { category: value.category, status } : null;
    case 'rejected': return { category: value.category, status };
    default: return null;
  }
}
