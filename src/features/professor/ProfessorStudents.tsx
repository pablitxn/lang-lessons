import { useCallback, useEffect, useRef, useState } from 'react';
import type { CurrentUser, FeedbackState, ProfessorComment, PublicUser, DailyPageRequest, DailyProgressPage, ResultPage } from '../../contracts';
import { hasCapability, type Page, type ReadResult } from '../accounts/access';
import { ReadPanel } from '../accounts/ReadPanel';
import { ProfessorProgress } from './ProfessorProgress';
import { SessionComments } from './SessionComments';

/** Server-grouped display DTOs: the browser never selects a timezone or aggregates visits. */
export interface StudentSessionView {
  readonly sessionId: string;
  readonly feedback: FeedbackState;
  readonly comment: ProfessorComment | null;
  readonly startedAt?: string | null;
  readonly endedAt?: string | null;
}
export interface DailyWrittenTotals {
  readonly definitionVersion: string;
  readonly performed: number;
  readonly solved: number;
  readonly mistakes: number;
}
export interface StudentDayView {
  readonly dayId: string;
  readonly label: string;
  /** Null until metric definitions are approved; zero is a real supplied total. */
  readonly written: DailyWrittenTotals | null;
  readonly sessions: readonly StudentSessionView[];
}
export interface StudentProgressView {
  readonly studentId: string;
  readonly sessions: readonly StudentSessionView[];
  /** Omit/null until the server has a selected daily boundary. Never infer browser local time. */
  readonly daily?: { readonly timeZone: string; readonly days: readonly StudentDayView[] } | null;
}
export interface ProfessorApi {
  listAllStudents(cursor: string | null, signal: AbortSignal): Promise<ReadResult<Page<PublicUser>>>;
  readSessionPage?(studentId: string, cursor: string | null, signal: AbortSignal): Promise<ReadResult<{ studentId: string; sessions: ResultPage<StudentSessionView> }>>;
  readDaily?(studentId: string, input: DailyPageRequest, signal: AbortSignal): Promise<ReadResult<DailyProgressPage> | { status: 'policy-unresolved' }>;
  readProgress(studentId: string, signal: AbortSignal): Promise<ReadResult<StudentProgressView>>;
}
export function ProfessorStudents({ user, listCapability = null, progressCapability = null, api = null }: {
  user: CurrentUser | null; listCapability?: string | null; progressCapability?: string | null; api?: ProfessorApi | null;
}) {
  return <section className="p3-professor"><h1>All students</h1>{!hasCapability(user, listCapability) ? <p role="alert">Access denied.</p> : !api ? <p role="status">Student views are not available yet.</p> : <StudentList key={JSON.stringify([user, listCapability, progressCapability])} api={api} canReadProgress={hasCapability(user, progressCapability)} />}</section>;
}
function StudentList({ api, canReadProgress }: { api: ProfessorApi; canReadProgress: boolean }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [selected, setSelected] = useState<string | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const cursor = cursors.at(-1) ?? null;
  const load = useCallback((signal: AbortSignal) => api.listAllStudents(cursor, signal), [api, cursor]);
  return <><div hidden={selected !== null}><p>Students across the application; no assignment filter.</p>
    <ReadPanel key={cursor ?? 'first'} load={load}>{page => <>
      {page.items.length ? <ul aria-label="All students">{page.items.map(student => <li key={student.id}>{student.id} <button disabled={!canReadProgress} onClick={event => { returnFocus.current = event.currentTarget; setSelected(student.id); }}>View progress for {student.id}</button></li>)}</ul> : <p>No students found.</p>}
      <button disabled={cursors.length === 1} onClick={() => setCursors(value => value.slice(0, -1))}>Previous students</button>
      <button disabled={!page.nextCursor || cursors.includes(page.nextCursor)} onClick={() => { if (page.nextCursor) setCursors(value => [...value, page.nextCursor]); }}>Next students</button>
    </>}</ReadPanel></div>
    {selected !== null && canReadProgress && <StudentDetail key={selected} id={selected} api={api} onBack={() => { setSelected(null); requestAnimationFrame(() => returnFocus.current?.focus()); }} />}
  </>;
}
function StudentDetail({ id, api, onBack }: { id: string; api: ProfessorApi; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const load = useCallback((signal: AbortSignal) => api.readProgress(id, signal), [api, id]);
  return <div><button onClick={onBack}>Back to students</button><h2 ref={heading} tabIndex={-1}>Progress for {id}</h2>
    {api.readSessionPage ? <ProfessorProgress studentId={id} api={api} /> : <ReadPanel load={load}>{view => view.studentId !== id ? <p role="alert">Student data could not be verified.</p> : <>
      {view.daily ? <>
        <p>Daily progress · {view.daily.timeZone}</p>
        <p>Written results accumulate across all visits for the whole day, with or without tutor calls.</p>
        {view.daily.days.length === 0 ? <p>No daily progress found.</p> : view.daily.days.map(day => <section key={day.dayId} aria-label={day.label}>
          <h3>{day.label}</h3>
          {day.written ? <><dl className="p3-daily-totals"><div><dt>Written exercises performed</dt><dd>{day.written.performed}</dd></div><div><dt>Written exercises solved</dt><dd>{day.written.solved}</dd></div><div><dt>Written mistakes</dt><dd>{day.written.mistakes}</dd></div></dl><p>Metric definition: {day.written.definitionVersion}</p></> : <p>Daily written totals are not available yet.</p>}
          <h4>Tutor sessions and comments</h4><SessionComments sessions={day.sessions} />
        </section>)}
      </> : <><p>Daily grouping is not available until the day boundary is configured. Metrics are not available yet. Written and oral results remain separate.</p>
        <h3>Session comments</h3><SessionComments sessions={view.sessions} /></>}
    </>}</ReadPanel>}</div>;
}
