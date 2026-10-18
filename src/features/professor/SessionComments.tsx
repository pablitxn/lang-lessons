import type { FeedbackState } from '../../contracts';
import type { StudentSessionView } from './ProfessorStudents';

const feedbackLabels: Record<FeedbackState, string> = {
  'not-requested': 'No comment requested', pending: 'Comment pending', running: 'Comment being prepared',
  succeeded: 'Comment available', failed: 'Comment unavailable', 'insufficient-evidence': 'Insufficient evidence for a comment',
};
export function SessionComments({ sessions }: { sessions: readonly (Omit<StudentSessionView, 'feedback'> & { feedback: FeedbackState | null })[] }) {
  return <>{sessions.length === 0 ? <p>No session comments found.</p> : sessions.map(session => <article key={session.sessionId} aria-label={`Session ${session.sessionId}`}>
    <h5>Session {session.sessionId}</h5>
    <dl><dt>Started</dt><dd>{session.startedAt ?? 'Unavailable'}</dd><dt>Ended</dt><dd>{session.endedAt ?? 'Unavailable'}</dd></dl>
    <p>{session.feedback === null ? 'Comment status unavailable' : feedbackLabels[session.feedback]}</p>
    {session.feedback === 'succeeded' && (session.comment?.sessionId === session.sessionId ? <><p className="p3-comment">{session.comment.text}</p><small>Source version: {session.comment.provenanceVersion}</small></> : <p role="alert">Comment could not be verified.</p>)}
  </article>)}</>;
}
