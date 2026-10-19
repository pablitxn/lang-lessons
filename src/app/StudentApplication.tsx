import { ProfileSettings } from '../features/accounts/ProfileSettings';
import type { CurrentUser } from '../contracts';
import { App } from './App';
import type { LessonRenderer } from './LessonSession';
import type { PersistedSessionServices } from './PersistedLesson';
import type { createApplicationClient } from '../platform/application-client';

export function StudentApplication({ services, client, renderLesson, user, onSignOut, onProfileUpdated }: {
  user: CurrentUser; services: PersistedSessionServices; client: ReturnType<typeof createApplicationClient>; renderLesson: LessonRenderer;
  onSignOut: () => Promise<void>; onProfileUpdated: (user: CurrentUser) => void;
}) {
  return <App renderLesson={renderLesson} sessionServices={services} onSignOut={onSignOut} accountEmail={user.email}
    account={user} preferencesApi={client.preferences}
    profileSettings={<ProfileSettings user={user} onSave={client.profile.update} onUpdated={onProfileUpdated} />} />;
}
