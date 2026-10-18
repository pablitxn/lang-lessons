import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { DailyProgressPage, DailyResult, DailySession } from '../../contracts';
import { ReadPanel } from '../accounts/ReadPanel';
import { SessionComments } from './SessionComments';
import type { ProfessorApi } from './ProfessorStudents';
import './professor-progress.css';

/** Additive P2 fields awaiting root-owned shared DTO/validator integration. */
export interface AttributionFields { readonly attributionTimeZones?: readonly string[] }
export interface EventAttributionFields { readonly timeZone?: string }
type CursorStack = readonly (string | null)[];
function Paging({ name, cursors, next, onChange }: { name: string; cursors: CursorStack; next: string | null; onChange: (value: CursorStack) => void }) {
  const repeated = next !== null && cursors.includes(next);
  return <nav aria-label={`${name} pages`}>
    <button disabled={cursors.length === 1} onClick={() => onChange(cursors.slice(0, -1))}>Previous {name}</button>
    <button disabled={next === null || repeated} onClick={() => { if (next !== null && !repeated) onChange([...cursors, next]); }}>Next {name}</button>
    {repeated && <p role="alert">The next page could not be verified. No repeated request was sent.</p>}
  </nav>;
}
function PageFocus({ label }: { label: string }) {
  const target = useRef<HTMLParagraphElement>(null);
  useEffect(() => { target.current?.focus(); }, []);
  return <p tabIndex={-1} ref={target} className="p3-page-status">{label}</p>;
}
export function ProfessorProgress({ studentId, api }: { studentId: string; api: ProfessorApi }) {
  const [day, setDay] = useState('');
  function selectDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = String(new FormData(event.currentTarget).get('day'));
    if (/^\d{4}-\d{2}-\d{2}$/.test(selected)) setDay(selected);
  }
  return <>
    <section aria-label="Daily progress">
      <h3>Daily progress</h3>
      <p>Written results span all visits, with or without tutor calls. Choose a calendar day in the student's configured timezone. Your viewing timezone does not redefine that day.</p>
      {api.readDaily ? <><form className="p3-day-picker" onSubmit={selectDay}>
        <label>Progress day<input name="day" type="date" required /></label><button type="submit">Show day</button>
      </form>
        {day ? <DailyPage key={`${studentId}:${day}`} studentId={studentId} day={day} api={api} /> : <p>Select a day to view its results. No timezone has been assumed.</p>}
      </> : <p>Daily progress is not available yet.</p>}
    </section>
    <SessionHistory key={studentId} studentId={studentId} api={api} />
  </>;
}
function SessionHistory({ studentId, api }: { studentId: string; api: ProfessorApi }) {
  const [cursors, setCursors] = useState<CursorStack>([null]);
  const cursor = cursors.at(-1) ?? null;
  const load = useCallback((signal: AbortSignal) => api.readSessionPage!(studentId, cursor, signal), [api, studentId, cursor]);
  return <section aria-label="Session history"><h3>Session history</h3><p>Available independently of daily timezone configuration.</p>
    <ReadPanel load={load}>{page => page.studentId !== studentId ? <p role="alert">Student data could not be verified.</p> : <>
      {cursor !== null && <PageFocus label="Session history page loaded" />}
      <SessionComments sessions={page.sessions.items} />
      <Paging name="history sessions" cursors={cursors} next={page.sessions.nextCursor} onChange={setCursors} />
    </>}</ReadPanel>
  </section>;
}
function DailyPage({ studentId, day, api }: { studentId: string; day: string; api: ProfessorApi }) {
  const [events, setEvents] = useState<CursorStack>([null]);
  const [sessions, setSessions] = useState<CursorStack>([null]);
  const eventCursor = events.at(-1) ?? null;
  const sessionCursor = sessions.at(-1) ?? null;
  const load = useCallback(async (signal: AbortSignal) => {
    const result = await api.readDaily!(studentId, { day, eventCursor, sessionCursor }, signal);
    return result.status === 'policy-unresolved' ? { status: 'ok' as const, value: null } : result;
  }, [api, studentId, day, eventCursor, sessionCursor]);
  return <ReadPanel<DailyProgressPage | null> load={load}>{page => page === null ? <p role="status">Daily grouping is unavailable because the student's timezone is not configured. Session history remains available below.</p> :
    page.studentId !== studentId || page.day !== day ? <p role="alert">Daily data could not be verified.</p> : <>
      <PageFocus label={`Daily page loaded for ${page.day}`} />
      <h4>{page.day}</h4>
      <AttributionZones page={page} />
      <p>Events are assigned by server receipt time. Exercise totals are not defined; results below are individual records.</p>
      <UsageTime page={page} />
      {page.hasUnattributedLegacyRecords && <p role="status">Some older records cannot be assigned to a day and are excluded from this daily view.</p>}
      <section aria-label="Written results"><h4>Written results</h4>
        {page.writtenEvents.items.length ? <ul>{page.writtenEvents.items.map(result => <WrittenResult key={result.event.eventId} result={result} />)}</ul> : <p>No written results for this page.</p>}
        <Paging name="written results" cursors={events} next={page.writtenEvents.nextCursor} onChange={setEvents} />
      </section>
      <section aria-label="Daily tutor sessions"><h4>Tutor sessions and comments</h4>
        <DailySessions sessions={page.sessions.items} />
        <Paging name="daily sessions" cursors={sessions} next={page.sessions.nextCursor} onChange={setSessions} />
      </section>
    </>}</ReadPanel>;
}
/** Unit conversion only; never add written and tutor values (their intervals can overlap). */
export function durationLabel(milliseconds: number): string {
  return `${milliseconds / 1000} s`;
}
function UsageTime({ page }: { page: DailyProgressPage }) {
  const usage = page.usageTime;
  const orientative = usage.orientativeTutorMs !== undefined;
  const label = (value: number | null | undefined) => value == null ? 'Unavailable' : durationLabel(value);
  return <><dl className="p3-daily-totals">
    <div><dt>Written activity duration</dt><dd>{durationLabel(usage.writtenMs)}</dd></div>
    <div><dt>{orientative ? 'Tutor duration (orientative)' : 'Tutor connected duration'}</dt><dd>{label(orientative ? usage.orientativeTutorMs : usage.tutorConnectedMs)}</dd></div>
    <div><dt>Combined duration (overlap counted once)</dt><dd>{label(orientative ? usage.orientativeTotalMs : usage.totalMs)}</dd></div>
  </dl><p>{orientative ? 'Tutor and combined duration are orientative client measurements, not server-verified. Missing observations are unavailable.' : 'Tutor duration is server-observed connection.'} Written activity is client-reported interaction. Durations cover the whole day, not this page.</p></>;
}
function AttributionZones({ page }: { page: DailyProgressPage & AttributionFields }) {
  const zones = page.attributionTimeZones;
  return <><p>Student timezone reported by the server: {page.timeZone}. This label does not override historical record attribution.</p>
    {zones === undefined ? <p>Historical attribution timezones are unavailable in this response.</p> : zones.length === 0 ? <p>No configured timezone periods contribute to this date.</p> :
      <p>Historical attribution timezones for this date: {zones.join(', ')}.{zones.length > 1 ? ' This date includes records attributed under different timezone settings.' : ''}</p>}
  </>;
}
function WrittenResult({ result }: { result: DailyResult & EventAttributionFields }) {
  const { event } = result;
  return <li><p><strong>{event.kind === 'attempt-result' ? event.result : 'Result invalidated'}</strong> · {event.ref.obligation}</p>
    <dl><dt>Exercise</dt><dd>{event.ref.exerciseId}</dd><dt>Session</dt><dd>{event.ref.sessionId}</dd>
      <dt>Received at</dt><dd>{result.receivedAt}</dd><dt>Attribution timezone</dt><dd>{result.timeZone ?? 'Unavailable in this response'}</dd><dt>Attempt</dt><dd>{event.ref.attemptId} · revision {event.ref.revision}</dd>
      <dt>Source / trust</dt><dd>{event.source} / {event.trust}</dd></dl>
  </li>;
}
function DailySessions({ sessions }: { sessions: readonly DailySession[] }) {
  return <SessionComments sessions={sessions.map(session => ({ sessionId: session.sessionId, startedAt: session.startedAt, endedAt: session.closedAt,
    feedback: session.feedback, comment: session.comment }))} />;
}
