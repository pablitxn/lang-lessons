import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedIdentity } from './authorization';
import { authorize } from './authorization';
import { approvedAccountAccess } from './approved-policy';
import { exactKeys, requireId, requireRevision, RepositoryError, transaction } from '../data/database';

export interface StudentTimeZone { readonly timeZone: string; readonly revision: number; readonly effectiveAt: string }
export interface TimeZoneWindow { readonly start: string; readonly end: string; readonly timeZone: string }
export function canonicalTimeZone(value: unknown): string {
  // Reject browser locale defaults, numeric offsets and ambiguous abbreviations.
  if (typeof value !== 'string' || value.length > 128 || !(value === 'UTC' || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/u.test(value))) throw new RepositoryError('invalid-input');
  try { return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone; }
  catch { throw new RepositoryError('invalid-input'); }
}
export async function studentDayWindows(client: PoolClient, studentId: string, day: string): Promise<{ windows: readonly TimeZoneWindow[]; currentTimeZone: string; firstConfiguredAt: string }> {
  const current = await client.query<{ time_zone: string; first: string }>('SELECT time_zone,(min(effective_at) OVER ())::text AS first FROM learning_student_timezones WHERE user_id=$1 ORDER BY revision DESC LIMIT 1', [studentId]);
  if (!current.rows[0]) throw new RepositoryError('policy-unresolved');
  const { rows } = await client.query<{ start: string; end: string; time_zone: string }>(`WITH settings AS (
    SELECT time_zone,effective_at,lead(effective_at) OVER (ORDER BY revision) AS next_at FROM learning_student_timezones WHERE user_id=$1
  ), windows AS (
    SELECT time_zone,GREATEST($2::date::timestamp AT TIME ZONE time_zone,effective_at) AS start,
      LEAST(($2::date+1)::timestamp AT TIME ZONE time_zone,COALESCE(next_at,'infinity'::timestamptz)) AS "end" FROM settings
  ) SELECT start::text AS start,"end"::text AS "end",time_zone FROM windows WHERE "end">start ORDER BY start`, [studentId,day]);
  return { windows: rows.map(row=>({ start:row.start,end:row.end,timeZone:row.time_zone })), currentTimeZone:current.rows[0].time_zone, firstConfiguredAt:current.rows[0].first };
}

/** Only the authenticated student's own setting; browser context never chooses another user's zone. */
export function createStudentTimeZoneRepository(pool: Pool, identity: AuthenticatedIdentity) {
  return {
    async observe(value: unknown): Promise<StudentTimeZone | null> {
      // The request is a location hint, not an authority. Missing/invalid hints preserve saved attribution.
      let zone: string;
      try { zone = canonicalTimeZone(value); } catch { return null; }
      return transaction(pool, async client => {
        await client.query('SELECT id FROM learning_users WHERE id=$1 FOR UPDATE', [identity.userId]);
        await authorize(client, identity, approvedAccountAccess, 'timezone:own');
        const latest = await client.query<{ time_zone: string; revision: number; effective_at: Date; precise_at: string }>(
          'SELECT time_zone,revision,effective_at,effective_at::text AS precise_at FROM learning_student_timezones WHERE user_id=$1 ORDER BY revision DESC LIMIT 1', [identity.userId]);
        const previous = latest.rows[0];
        if (previous?.time_zone === zone) return { timeZone: zone, revision: previous.revision, effectiveAt: previous.effective_at.toISOString() };
        const revision = (previous?.revision ?? 0) + 1;
        const { rows } = await client.query<{ effective_at: Date }>(`INSERT INTO learning_student_timezones(user_id,revision,time_zone,effective_at)
          VALUES ($1,$2,$3,GREATEST(clock_timestamp(),$4::timestamptz+interval '1 microsecond')) RETURNING effective_at`, [identity.userId, revision, zone, previous?.precise_at ?? null]);
        return { timeZone: zone, revision, effectiveAt: rows[0]!.effective_at.toISOString() };
      });
    },
    read(): Promise<StudentTimeZone | null> {
      return transaction(pool,async client=>{
        await authorize(client,identity,approvedAccountAccess,'timezone:own');
        const {rows}=await client.query<{time_zone:string;revision:number;effective_at:Date}>('SELECT time_zone,revision,effective_at FROM learning_student_timezones WHERE user_id=$1 ORDER BY revision DESC LIMIT 1',[identity.userId]);
        const row=rows[0];return row?{timeZone:row.time_zone,revision:row.revision,effectiveAt:row.effective_at.toISOString()}:null;
      });
    },
    set(input:{operationId:string;expectedRevision:number;timeZone:string}):Promise<StudentTimeZone>{
      exactKeys(input,['operationId','expectedRevision','timeZone']);requireId(input.operationId);requireRevision(input.expectedRevision);const zone=canonicalTimeZone(input.timeZone);
      return transaction(pool,async client=>{
        // Serialize before authorization's shared lock; progress writes also hold this user row through commit.
        await client.query('SELECT id FROM learning_users WHERE id=$1 FOR UPDATE',[identity.userId]);
        await authorize(client,identity,approvedAccountAccess,'timezone:own');
        const fingerprint=JSON.stringify([input.expectedRevision,zone]);
        const prior=await client.query<{fingerprint:string;result:StudentTimeZone}>('SELECT fingerprint,result FROM learning_timezone_receipts WHERE user_id=$1 AND operation_id=$2',[identity.userId,input.operationId]);
        if(prior.rows[0]){if(prior.rows[0].fingerprint!==fingerprint)throw new RepositoryError('conflict');return prior.rows[0].result;}
        const latest=await client.query<{revision:number;effective_at:string}>('SELECT revision,effective_at::text FROM learning_student_timezones WHERE user_id=$1 ORDER BY revision DESC LIMIT 1',[identity.userId]);
        if((latest.rows[0]?.revision??0)!==input.expectedRevision)throw new RepositoryError('conflict');
        const {rows}=await client.query<{effective_at:Date}>(`INSERT INTO learning_student_timezones(user_id,revision,time_zone,effective_at)
          VALUES ($1,$2,$3,GREATEST(clock_timestamp(),$4::timestamptz+interval '1 microsecond')) RETURNING effective_at`,[identity.userId,input.expectedRevision+1,zone,latest.rows[0]?.effective_at??null]);
        const result={timeZone:zone,revision:input.expectedRevision+1,effectiveAt:rows[0]!.effective_at.toISOString()};
        await client.query('INSERT INTO learning_timezone_receipts VALUES ($1,$2,$3,$4)',[identity.userId,input.operationId,fingerprint,JSON.stringify(result)]);return result;
      });
    },
  };
}
