import type { Pool } from 'pg';
import type { LearnerSettings } from '../../src/contracts';
import { parseSettings } from '../../src/platform/settings-store';
import { authorize, denyUnresolvedGrants, type AccessPolicy, type AuthenticatedIdentity } from './authorization';
import { exactKeys, requireRevision, RepositoryError, transaction } from '../data/database';

export interface AccountPreferences { readonly settings: LearnerSettings | null; readonly revision: number }

/** Storage migration can repair legacy browser values; account writes require the complete current shape. */
export function validateLearnerPreferences(value: unknown): LearnerSettings {
  const fields = ['schemaVersion', 'theme', 'helpEnabled', 'untimedHelp', 'difficulty', 'preferredMode', 'sentenceTense'];
  exactKeys(value, value && typeof value === 'object' && Object.hasOwn(value, 'learningLanguage') ? [...fields, 'learningLanguage'] : fields);
  if (Object.hasOwn(value, 'learningLanguage') && value.learningLanguage !== 'en' && value.learningLanguage !== 'fr') throw new RepositoryError('invalid-input');
  exactKeys(value.difficulty, ['grammar', 'vocabulary']);
  if (value.theme === undefined || value.untimedHelp === undefined || value.sentenceTense === undefined || typeof value.preferredMode !== 'string') throw new RepositoryError('invalid-input');
  const settings = parseSettings(value);
  if (!settings) throw new RepositoryError('invalid-input');
  return settings;
}

/** Every enabled role may read and change only its own non-sensitive learning preferences. */
export function createLearnerPreferencesRepository(pool: Pool, policy: AccessPolicy = denyUnresolvedGrants) {
  return {
    read(identity: AuthenticatedIdentity): Promise<AccountPreferences> {
      return transaction(pool, async client => {
        await authorize(client, identity, policy);
        const { rows } = await client.query<{ settings: unknown; revision: number }>(
          'SELECT settings,revision FROM learning_user_preferences WHERE user_id=$1', [identity.userId]);
        const current = rows[0];
        return current ? { settings: validateLearnerPreferences(current.settings), revision: current.revision } : { settings: null, revision: 0 };
      });
    },
    update(identity: AuthenticatedIdentity, input: unknown): Promise<AccountPreferences> {
      exactKeys(input, ['settings', 'expectedRevision']); requireRevision(input.expectedRevision);
      if (input.expectedRevision >= 2_147_483_647) throw new RepositoryError('invalid-input');
      const settings = validateLearnerPreferences(input.settings);
      const expectedRevision = input.expectedRevision;
      return transaction(pool, async client => {
        // Serialize even the first insert and share lock order with account/timezone changes.
        await client.query('SELECT id FROM learning_users WHERE id=$1 FOR UPDATE', [identity.userId]);
        await authorize(client, identity, policy);
        const current = await client.query<{ revision: number }>('SELECT revision FROM learning_user_preferences WHERE user_id=$1', [identity.userId]);
        if ((current.rows[0]?.revision ?? 0) !== expectedRevision) throw new RepositoryError('conflict');
        const revision = expectedRevision + 1;
        await client.query(`INSERT INTO learning_user_preferences(user_id,revision,settings) VALUES ($1,$2,$3)
          ON CONFLICT (user_id) DO UPDATE SET revision=EXCLUDED.revision,settings=EXCLUDED.settings,updated_at=clock_timestamp()`,
        [identity.userId, revision, JSON.stringify(settings)]);
        return { settings, revision };
      });
    },
  };
}
