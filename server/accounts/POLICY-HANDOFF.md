# P2 additive Q10/Q11 policy handoff

This amendment supersedes the affected policy-pending statements in the initial
`server/data/README.md` receipt at `44bd503185245e4e2f53169a818d0817f513b7be`.
The original evidence remains intact. Interface base remains PR12
`8316baa745acf0280181cf72ef6fa400561dcd05`; publication head is pinned in PR17.
Root routes, shared contracts and UI remain with their existing owners.

## Confirmed authority and remaining gates

Parent relayed Pablo's Q10 confirmation: "Exacto. Los usuarios los crea el admin"
in response to admin-only creation, no public signup, admin role changes and
deactivate/reactivate. Implement those operations; never infer deletion, extra
private-data grants, initial credential handoff or account recovery. No live user
or credential was created. Synthetic disposable database fixtures are marked.

Parent subsequently relayed Q11: written results accumulate across every visit
throughout the day, regardless of tutor calls. Professor views group by day while
retaining individual session start/end and brief-comment associations. Closing a
session must not reset written history or defer saving until exit. Daily timezone,
usage-time rules and the proposed two-minute inactivity timer are NOT selected.
Metric definitions/denominators still require their own agreement.

## Admin backoffice adapter for P3/integrator

`createUserManagementRepository(pool)` in `management.ts` is the backend for the
small backoffice. It always checks the actor's current database role and disabled
state. UI cannot pass roles/capabilities as authority. Inputs use exact-key parsing.

- `list(identity, cursor = null, limit = 50)` returns
  `{ items: ManagedUser[], nextCursor: string | null }`.
- `ManagedUser` is `{ id, role, disabled, revision }`. No email/hash/session token
  or learning-data field is disclosed in this read DTO.
- `create(identity, { operationId, email, role, disabled })` returns
  `{ user: ManagedUser, credentialSetup: 'pending-policy' }`.
  All fields are required; no default role/enabled-state choice is hidden.
- `update(identity, { operationId, userId, expectedRevision, kind:'set-role', role })`
  or `update(identity, { operationId, userId, expectedRevision, kind:'set-disabled', disabled })`
  returns `ManagedUser`. There is no delete, password, invitation or recovery method.
- A stale revision, changed replay body, duplicate normalized email or last-admin
  removal produces `RepositoryError('conflict')`. Root should map this to 409;
  preserve the form and refresh canonical status before proposing another change.
  Permission failure remains 403, malformed data 422, unknown target 404.
- Reuse the operation ID for exact replay after an ambiguous response. Current
  authorization is checked even for replay: a disabled/demoted actor cannot use
  an old receipt to bypass revoked access. Do not retry a changed body with that ID.

Creation transactionally inserts matching Better Auth/application user IDs. The
library-required name is the opaque ID; it is not an inferred personal name.
Email is unverified, no credential row is created, and no mail/network action
occurs. The UI must say credential setup is pending, not claim a usable login,
password delivery or activation. Account recovery and first credential provisioning
remain blocked on policy. No public signup or bootstrap administrator endpoint.

All management writes take a shared namespace advisory transaction lock before
actor/target row locks. The last-admin check counts enabled administrator survivors
with a credential record, so a newly created credentialless admin cannot justify
removing the last usable administrator. Two concurrent self-removals cannot both
commit. This protects application operations; direct privileged SQL is outside
this boundary. There is no active production bootstrap or credential workflow.

Deactivate/reactivate deletes library sessions and records a database-clock
`auth_valid_after` fence. The auth adapter compares its database-issued session
creation time to that fence, rejecting even a delayed pre-transition session insert
or old signed cookie after reactivation. Role changes are enforced by fresh role
checks on each protected operation. No client role cache is trusted.

`approvedAccountAccess` in `approved-policy.ts` grants:

- administrator: `users:list`, `users:manage`;
- professor: `students:list`, `students:daily-progress:read`;
- student: no newly inferred account-view grants.

Integrator must pass this into existing account reads and expose its canonical
capabilities through `/api/me`. This map does not replace still-pending practice,
comment-disclosure or retention policies. No administrator progress grant exists.
The new management DTOs are producer-local; integrator owns any shared promotion.
P3 owns controls/forms and confirmation/error/focus behavior; this task does not
write its UI or mount routes.

## Daily projection adapter for P3/integrator

`createDailyProgressRepository(pool, groupingPolicy?, disclosurePolicy?)` in
`daily-progress.ts` exposes:

```ts
read(identity, studentId, {
  day: 'YYYY-MM-DD', eventCursor?: string | null,
  sessionCursor?: string | null, limit?: number
}): Promise<DailyProgressPage>
```

`DailyProgressPage` contains `studentId`, `day`, canonical `timeZone`,
`eventAttribution: 'server-received'`, independently paginated `writtenEvents` and
`sessions`, `totals: null`, `usageTime: null`, and `hasUnattributedLegacyRecords`.
Pages have 1-100 items and their own opaque cursor. The UI must retain both cursors;
never silently discard additional visits or events. Cursor order is stable ID
order; each event exposes its actual receipt time for display, not active duration.

Each written item contains the validated original `PracticeEvent`, `receivedAt`
and original `committedRevision`. Both processed results and invalidations remain
present. Audio/mock events are not written totals and are excluded from this view,
but remain preserved in the underlying journal. No raw answer/transcript/audio is
stored. Idempotent replays cannot add events or move them to another day. Writes
still happen per submitted batch; close adds only its fence/timestamps/job/receipt.

Each session item contains canonical session ID/mode, `startedAt`, `closedAt`,
feedback state and optional qualitative comment bound to that same session.
Sessions span lesson visits and may contain multiple call segments; these timestamps
are exercise-session timestamps, not inferred active/call duration. Session rows
that overlap the selected day or have events that day are included. Cross-midnight
sessions can appear on both days with the same identity. No per-session aggregate
is reset on close. Comment state/text remain null unless the separate disclosure
policy permits them; no Q13 permission is inferred from written progress access.

No grouping policy is installed by default. The explicit future policy shape is
`{ timeZone: <selected IANA zone>, eventAttribution: 'server-received' }`.
Server-received timestamps are recorded as objective metadata; selecting them as
the daily attribution clock is injectable, not claimed as Pablo's decision.
Absent policy produces `policy-unresolved`. Calendar-day bounds use the selected
zone and respect DST (not a fixed 24-hour interval). No browser timezone, UTC,
wall-clock time, visibility timer or two-minute idle threshold is silently selected.
`totals` stays null pending precise metric definitions, not zero or an invented score.

Legacy rows retain null timestamps/payloads rather than receiving fabricated
historical dates. `hasUnattributedLegacyRecords` signals that limitation. New
payloads duplicate only the existing validated structural event metadata so reads
do not depend on the private fingerprint encoding. Existing journals/receipts are
never deleted, renumbered or overwritten by this migration/projection.

## Additive migration order and verification

Root registry must apply exactly once in transactions:
`p2-auth.sql`, `p2-learning.sql`, `p2-admin.sql`, `p2-day-projection.sql`.
Already installed first versions need only the two new bodies. The root registry
and server dispatch remain untouched. Auth identity now requires the admin columns;
progress persistence requires the daily columns, so run migrations before mounting
these adapters. There is no live migration/provisioning action in this task.

Targeted isolated PostgreSQL and actual Better Auth tests cover creation/replay,
atomic auth/application insertion, all role denials, stale revisions, last-admin
concurrency, credentialless-admin exclusion, disable/reactivate and racing old
sessions, daily cross-visit preservation, called/no-call separation, separate page
cursors, DST boundaries, invalidations, oral exclusion and explicit legacy gaps.
The earlier auth fixture failed because the library's default endpoint-specific
login limit overrode the injected generic rate limit. The adapter now explicitly
applies the supplied login limit; the test asserts successful second login before
checking revocation/expiry, avoiding a false-positive absent-session assertion.
No new production rate value is selected.

Final commands/counts and exact additive head are recorded in PR17 after validation.
Logs: `/tmp/p2-admin-ci.log`, `/tmp/p2-policy-targeted-final.log`,
`/tmp/p2-policy-check.log`. No browser/P3 UI validation or integrated root-server
acceptance is claimed by this producer amendment.
