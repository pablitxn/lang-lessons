import type { VoiceStartFailure, VoiceStartFailureCategory } from '../src/contracts';
import { readBoundedJsonResponse } from '../src/platform/bounded-json';

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const QUOTA_CODES: Readonly<Record<string, VoiceStartFailureCategory>> = {
  credit_balance_exhausted: 'credits-exhausted',
  project_spend_limit_exceeded: 'project-spend-limit',
  organization_spend_limit_exceeded: 'organization-spend-limit',
  organization_usage_limit_exceeded: 'usage-limit',
  insufficient_quota: 'quota',
};

/** Only fixed diagnostic categories cross the broker boundary; provider text stays untrusted. */
export async function providerStartupFailure(response: Response): Promise<VoiceStartFailure> {
  const status = response.status;
  if (status === 429 || status === 404) {
    const body = await readBoundedJsonResponse(response);
    const error = object(body) && object(body.error) ? body.error : null;
    const code = error && typeof error.code === 'string' ? error.code : '';
    if (status === 429) {
      const category = Object.hasOwn(QUOTA_CODES, code) ? QUOTA_CODES[code]!
        : code === 'rate_limit_exceeded' || code === 'slow_down' || error?.type === 'rate_limit_error' ? 'rate-limit'
          : error?.type === 'insufficient_quota' ? 'quota' : 'rejected';
      return { category, status };
    }
    return { category: code === 'model_not_found' ? 'model-unavailable' : 'rejected', status };
  }
  // Classification by status needs no provider body. Dispose it without delaying cleanup.
  void response.body?.cancel().catch(() => {});
  const category = status === 401 ? 'authentication' : status === 403 ? 'permission'
    : status === 400 || status === 422 ? 'configuration' : status >= 500 ? 'unavailable' : 'rejected';
  return { category, status };
}
