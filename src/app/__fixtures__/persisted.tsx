import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../App';
import type { PersistedSessionServices } from '../PersistedLesson';
import { VerbLesson } from '../../features/verbs';
import { createBrowserProgressBinding } from '../browser-progress';
import type { ProgressBatchResult, SessionSnapshot, CloseResult } from '../../contracts';
const fixture = { creates: 0, closes: 0, sends: 0, streams: 0, observations: [] as string[], session: null as SessionSnapshot | null,
  commit: null as null | (() => void), close: null as null | (() => void) };
Object.assign(window, { persistedFixture: fixture });
const services: PersistedSessionServices = {
  actorId: 'fixture-student', commands: {
    async create({ mode }) { fixture.creates++; return fixture.session = { sessionId: `canonical-${fixture.creates}`, mode, status: 'open', revision: 0 }; },
    async read() { return fixture.session!; },
    async startCall() { fixture.session = { ...fixture.session!, revision: fixture.session!.revision + 1 }; return { session: fixture.session, segment: { sessionId: fixture.session.sessionId, segmentId: 'segment', connectionEpoch: 1 } }; },
    async stopCall() { return fixture.session = { ...fixture.session!, revision: fixture.session!.revision + 1 }; },
    async confirmClose(input) {
      fixture.closes++; await new Promise<void>(resolve => { fixture.close = resolve; });
      return { sessionId: input.sessionId, operationId: input.operationId, status: 'closed', revision: input.expectedRevision + 1, feedback: 'not-requested' } satisfies CloseResult;
    }, async readClose() { return null; },
  }, progress(sessionId) {
    let revision = 0;
    return createBrowserProgressBinding({ actorId: services.actorId, sessionId, isCurrentUser: () => true,
      readFence: async () => ({ sessionId, journalRevision: revision }),
      usage: { async openWrittenStream() { fixture.streams++; return `stream-${fixture.streams}`; },
        async written(row) { fixture.observations.push(row.kind); return { eventId: row.eventId, sequence: row.sequence, status: 'recorded', intervalId: null, observedAt: new Date().toISOString() }; } },
      send: events => {
      fixture.sends++;
      return new Promise<ProgressBatchResult>(resolve => { fixture.commit = () => resolve({ status: 'committed', current: { sessionId, journalRevision: revision + events.length },
        acknowledgments: events.map(event => ({ eventId: event.eventId, status: 'accepted', committedRevision: ++revision })) }); });
    } });
  },
};
createRoot(document.getElementById('root')!).render(<StrictMode><App sessionServices={services} renderLesson={(mode, props) => mode === 'sentence' ? null : <VerbLesson {...props} mode={mode} />} /></StrictMode>);
