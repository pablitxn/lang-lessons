import type { Pool } from 'pg';
import type { FeedbackState, ProfessorComment } from '../../src/contracts/feedback';
import type { PublicUser } from '../../src/contracts/accounts';
import { authorize, denyUnresolvedGrants } from './authorization';
import type { AccessPolicy, AuthenticatedIdentity } from './authorization';
import { transaction, RepositoryError, requireId } from '../data/database';

export interface Page<T> { readonly items: readonly T[]; readonly nextCursor: string | null }
export interface SessionFeedbackView { sessionId: string; feedback: FeedbackState; comment: ProfessorComment | null }
export interface DisclosurePolicy { allowStudentFeedback: boolean }
function cursorValue(cursor: string | null) {
  if (cursor === null) return '';
  if (typeof cursor !== 'string' || cursor.length > 512) throw new RepositoryError('invalid-input');
  const value = Buffer.from(cursor, 'base64url').toString('utf8');
  requireId(value);
  if (Buffer.from(value).toString('base64url') !== cursor) throw new RepositoryError('invalid-input');
  return value;
}
function page<T>(rows: T[], limit: number, id: (item: T) => string): Page<T> {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? Buffer.from(id(items.at(-1)!)).toString('base64url') : null };
}
function pageLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RepositoryError('invalid-input');
}
export function createAccountRepository(pool: Pool, policy: AccessPolicy = denyUnresolvedGrants, disclosure?: DisclosurePolicy) {
  const listPage = (identity: AuthenticatedIdentity, studentsOnly: boolean, cursor: string | null, limit: number): Promise<Page<PublicUser>> => transaction(pool, async client => {
    await authorize(client, identity, policy, studentsOnly ? 'students:list' : 'users:list');
    pageLimit(limit); const after = cursorValue(cursor);
    const { rows } = await client.query<PublicUser>(
      "SELECT id,role FROM learning_users WHERE id > $1 AND ($2::boolean=false OR role='student') ORDER BY id LIMIT $3", [after, studentsOnly, limit + 1]);
    return page(rows, limit, item => item.id);
  });
  return {
    listUsers: (identity: AuthenticatedIdentity, cursor: string | null = null, limit = 50) => listPage(identity, false, cursor, limit),
    listAllStudents: (identity: AuthenticatedIdentity, cursor: string | null = null, limit = 50) => listPage(identity, true, cursor, limit),
    readProgressPage: (identity: AuthenticatedIdentity, studentId: string, cursor: string | null = null, limit = 50): Promise<{ studentId: string; sessions: Page<SessionFeedbackView> }> => transaction(pool, async client => {
      await authorize(client, identity, policy, 'students:feedback:read');
      if (!disclosure?.allowStudentFeedback) throw new RepositoryError('policy-unresolved');
      requireId(studentId); pageLimit(limit); const after = cursorValue(cursor);
      const student = await client.query("SELECT id FROM learning_users WHERE id=$1 AND role='student'", [studentId]);
      if (!student.rowCount) throw new RepositoryError('not-found');
      const { rows } = await client.query<{ id: string; state: FeedbackState | null; text: string | null; provenance_version: string | null }>(
        'SELECT s.id,j.state,c.text,c.provenance_version FROM learning_sessions s LEFT JOIN learning_feedback_jobs j ON j.session_id=s.id LEFT JOIN learning_comments c ON c.session_id=s.id WHERE s.user_id=$1 AND s.id > $2 ORDER BY s.id LIMIT $3', [studentId, after, limit + 1]);
      return { studentId, sessions: page(rows.map(row => ({ sessionId: row.id, feedback: row.state ?? 'not-requested',
        comment: row.state === 'succeeded' && row.text !== null && row.provenance_version !== null ? { sessionId: row.id, text: row.text, provenanceVersion: row.provenance_version } : null })), limit, item => item.sessionId) };
    }),
    me: (identity: AuthenticatedIdentity) => transaction(pool, client => authorize(client, identity, policy)),
    /** All students, cursor paginated; deliberately no assignment filter or personal fields. */
    listStudents: (identity: AuthenticatedIdentity, after = '', limit = 50): Promise<readonly PublicUser[]> => transaction(pool, async client => {
      await authorize(client, identity, policy, 'students:list');
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof after !== 'string' || after.length > 256) throw new RepositoryError('invalid-input');
      const { rows } = await client.query<PublicUser>(
        "SELECT id, role FROM learning_users WHERE role = 'student' AND id > $1 ORDER BY id LIMIT $2", [after, limit]);
      return rows;
    }),
  };
}
