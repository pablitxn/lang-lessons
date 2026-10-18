import { useCallback, useEffect, useRef, useState } from 'react';
import type { CurrentUser, FeedbackState, ProfessorComment, PublicUser } from '../../contracts';
import { hasCapability, type Page, type ReadResult } from '../accounts/access';
import { ReadPanel } from '../accounts/ReadPanel';

/** View adapter only; no metric definitions or additional student fields are selected. */
export interface StudentProgressView {
  readonly studentId: string;
  readonly sessions: readonly { sessionId: string; feedback: FeedbackState; comment: ProfessorComment | null }[];
}
export interface ProfessorApi {
  listAllStudents(cursor: string | null, signal: AbortSignal): Promise<ReadResult<Page<PublicUser>>>;
  readProgress(studentId: string, signal: AbortSignal): Promise<ReadResult<StudentProgressView>>;
}
const feedbackLabels: Record<FeedbackState, string> = {
  'not-requested': 'No comment requested', pending: 'Comment pending', running: 'Comment being prepared',
  succeeded: 'Comment available', failed: 'Comment unavailable', 'insufficient-evidence': 'Insufficient evidence for a comment',
};
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
    <ReadPanel load={load}>{view => view.studentId !== id ? <p role="alert">Student data could not be verified.</p> : <>
      <p>Metrics are not available yet. Written and oral results remain separate.</p>
      <h3>Session comments</h3>{view.sessions.length === 0 ? <p>No session comments found.</p> : view.sessions.map(session => <article key={session.sessionId} aria-label={`Session ${session.sessionId}`}>
        <h4>Session {session.sessionId}</h4><p>{feedbackLabels[session.feedback]}</p>
        {session.feedback === 'succeeded' && (session.comment?.sessionId === session.sessionId ? <><p className="p3-comment">{session.comment.text}</p><small>Source version: {session.comment.provenanceVersion}</small></> : <p role="alert">Comment could not be verified.</p>)}
      </article>)}
    </>}</ReadPanel></div>;
}
