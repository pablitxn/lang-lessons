# P2 student timezone and history timestamp amendment

This additive amendment follows producer head `def2bd5d2b16f6dcb508c45efc0c4e5ab9d6e259`. The integrator relayed approval to use the student's configured timezone (source message `Sentinel_f9048bdf595081919b884a6d175456cf`). It supersedes previous handoff statements that the timezone source was unselected. Retention/deletion and initial credential delivery remain unresolved.

Inspected consumer: P3 PR20 `480e738901938dde60d71a0c131ce6f479a4a156`, based on integration PR19 checkpoint `1f1583bd6fafe381e70d723a25c0dd35e31feb29`. Compose this producer delta with that consumer; this branch does not replace or incorporate root/P3 implementation.

## History timestamps

`createAccountRepository(...).readProgressPage(...)` returns `SessionFeedbackView.startedAt` and `endedAt`: stored session start/close timestamps as ISO strings, or explicit null for unknown legacy values/open-session end. No inferred timestamp or timezone setting is required. Existing ownership/disclosure checks and independent pagination remain intact.

Root `server/learning-http.ts` already passes the repository page through in the inspected checkpoint. Root's application client validator should validate the two nullable timestamp fields; P3's optional fields already render unavailable values explicitly. Do not substitute fetch time for missing history.

## Own timezone configuration seam

Register `server/data/migrations/p2-student-timezone.sql` after `p2-learning.sql` in the integration-owned registry. It adds append-only settings and idempotency receipts; it does not backfill existing users.

Construct `createStudentTimeZoneRepository(pool, authenticatedIdentity)`:

- `read(): Promise<StudentTimeZone | null>` returns the student's own setting.
- `set({operationId, expectedRevision, timeZone}): Promise<StudentTimeZone>` validates/canonicalizes IANA timezone, serializes against the user row, checks revision and stores a server-effective timestamp. Revision zero selects the first setting. Exact replay returns the original receipt; stale revision or changed replay conflicts.
- `StudentTimeZone = { timeZone: string; revision: number; effectiveAt: string }`.
- Only a currently enabled student has `timezone:own`. Neither a professor nor an administrator may choose a student's zone through this seam. No body user ID or client effective timestamp is accepted.

Root/P3 must add authenticated read/update routes, CSRF/body validation consistent with the existing HTTP boundary, and a student configuration control. Show the missing-setting state and require an explicit choice; browser guesses, professor location and runtime UTC must not silently become the saved choice. The repository accepts canonical IANA zones and UTC, rejects abbreviations/offsets, and never supplies a missing default.

## Daily projection and historical attribution

Continue supplying `{eventAttribution: 'server-received'}` to the daily repository. The optional legacy `timeZone` runtime field is ignored; the student's versioned configuration is authoritative. No setting throws `policy-unresolved`; do not convert that to an empty successful day.

Settings apply prospectively. PostgreSQL constructs local midnight boundaries for each configuration period, intersects them with that period, and unions usage intervals across those disjoint windows. A changed setting never relabels earlier records. PostgreSQL microsecond boundaries remain text until database comparison, avoiding JavaScript millisecond truncation. The target student row stays shared-locked during daily projection, serializing configuration changes.

Add these fields to the integration-owned daily DTO/client validation and P3 presentation:

- `DailyProgressPage.attributionTimeZones: readonly string[]`: all configuration zones contributing windows for this date.
- `DailyResult.timeZone: string`: effective attribution zone for that event.
- Existing page `timeZone` is the sole contributing zone when there is one, otherwise the current configured zone. For mixed days display the explicit attribution zones; this legacy scalar cannot label all records.
- Pre-setting records remain unattributed and set `hasUnattributedLegacyRecords`; no retroactive timezone is invented. Missing old timestamps stay null.

A single calendar date may span several historical zones. Written/tutor totals are separately unioned and total usage unions both sources, so setting boundaries and overlapping tabs/calls never double-count time. Learning totals remain null pending metric definitions.

## Evidence

Disposable loopback PostgreSQL 17 only; synthetic users and isolated/mocked provider evidence. `npm ci --cache /tmp/p2-npm-cache` passed. P2 suite: 37/37, including the actual P6 coordinator fixture at `16147d1226254c5a3ea5188bacf7ad2a70dd2245`, without model calls. Full `npm run check`: 256 Node passes / 259 total, three existing opt-in browser skips; 26 Python/content tests, TypeScript and Vite build pass. Existing bundle-size warning remains.

New tests cover stored history timestamps/nulls and paging, unauthorized reads, explicit missing settings, invalid zones, exact concurrent setting replay/stale conflicts, 23/25-hour DST dates, viewer/runtime timezone independence, historical changes, midnight exclusion and cross-source interval overlap. An initial SQL alias error was corrected before the passing runs. An initial full run also reproduced the previously documented unchanged voice release race; the final full run passed.

Root migration/routes/client validators/shared DTOs and P3 setting/display controls are integration work, not claimed complete here. No root/shared/manifest changes, new retention policy, live accounts, paid calls, deployment or main merge.
