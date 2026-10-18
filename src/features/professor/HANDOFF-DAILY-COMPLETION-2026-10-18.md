# P3 daily professor completion — 2026-10-18

## Revision and ownership

Dependency/checkpoint: `1f1583bd6fafe381e70d723a25c0dd35e31feb29`, PR19,
`feat/oct18-completion`. New branch: `feat/p3-daily-completion`. The previous
P3 commits are ancestors of this checkpoint; the branch fast-forwarded through
them without rewriting history. This additive patch changes only P3 feature,
fixture and test paths. Root contracts/routes/manifests/server/migration/broker
files are inherited unchanged from the checkpoint, not producer edits.

Read `docs/oct18-completion-checkpoint.md`, current owner ADR and AGENTS. Sole
integrator remains task `01a14e4c-74cd-7047-9c85-194a390d3001`. Requested model
is Astra/medium; no independent runtime routing receipt is exposed. No subagents.

## Completed behavior and integration

`ProfessorApi` now accepts the existing root `readSessionPage` and `readDaily`
methods. They are optional for source compatibility with earlier fixture adapters;
the published root client already supplies both and the UI prefers paged reads.
No root wiring change is necessary to activate this preference. `readProgress`
remains the legacy fallback only when the paged history method is absent.

- Day input starts empty. Explicit Show day dispatches the chosen date; neither
  today's browser date nor UTC is selected as policy. Server timezone is displayed.
- Daily written-event and tutor-session cursors have separate Previous/Next
  stacks. Advancing one sends the other's unchanged cursor. Selecting another day
  resets both. Repeated/cyclic cursors are blocked rather than looped.
- History has a third independent paginated read and works when daily policy
  returns `policy-unresolved`. No eager all-pages accumulation through the legacy
  adapter is used with the root API.
- Each request is keyed by student/day/cursors; cleanup aborts and ignores late
  responses even when an injected adapter ignores AbortSignal. Successful daily
  and history pages additionally verify student ID, and daily pages verify date.
- Written records display structured result/invalidation, obligation, exercise,
  session, received timestamp, attempt/revision and typed/client-reported trust.
  No raw answer, transcript, invented score, metric total or oral promotion appears.
- Written, tutor-connected and interval-union durations are taken independently
  from server fields and converted from milliseconds to seconds for display only.
  The union is never calculated by adding written and tutor time. Trust labels,
  server-received event attribution and unattributed legacy-record notice remain
  visible. Totals remain undefined, as required by `DailyProgressPage.totals:null`.
- Individual session timestamps and qualitative comments remain separate. Missing
  timestamps and null feedback states are shown as unavailable, not inferred.
- Loading, empty, denial, generic error/explicit read retry and keyboard focus are
  preserved. Loaded pagination results receive focus; returning to the student
  list restores the selected student's button. Scoped CSS reflows at mobile sizes.

## Specific root/P2 request

The inspected `server/accounts/repository.ts` `readProgressPage` query/DTO omits
start/end timestamps. The new UI renders supplied `StudentSessionView.startedAt`
and `endedAt` without conversion and reports unavailable when absent. To expose
individual timestamps in history even with unresolved timezone, P2/root must
include and validate those two fields in history responses. Daily responses
already supply `startedAt`/`closedAt` and display both correctly. This producer
has not edited the repository or client validator.

## Validation and limits

- `npm ci --cache /tmp/p3-npm-cache`: passed; no dependency edits.
- `npm run check`: 323 Node passes, 41 environment/opt-in skips; 26 Python/content
  passes; strict TypeScript and production build passed. Database-gated tests were
  skipped without `P2_TEST_DATABASE_URL`; no new DB acceptance claim is made.
- P3 capability and two Chromium browser suites pass with injected APIs, including
  the previous account/admin regressions. New daily tests exercise four widths
  (320/390/844/1024), untouched initial day input, independent bidirectional cursor
  navigation, day cursor reset, exact server timezone/timestamps, 10s/20s/25s
  overlapping durations, accepted/invalidation records, old-day/old-student delayed
  replies, unresolved policy with working paged history, denial, error/read retry,
  empty/loading, mismatched IDs/dates, cyclic cursor rejection and grant revocation.
- Root `tests/integration-daily-client.test.ts` also passes with targeted suites (5/5 total) to
  verify compatibility with its validated response contract. Mock transport only;
  no external browser requests or browser errors.
- Initial TypeScript attempts exposed nullable resource inference and a fixture
  discriminated-union error; both were corrected before the final build. Logs are
  retained in `/tmp/p3-daily-check.log`, `/tmp/p3-daily-build.log`,
  `/tmp/p3-daily-check-final.log`, `/tmp/p3-daily-targeted-final.log` and
  `/tmp/p3-daily-build-final.log`.
- Main bundle warning persists: 604.44 kB before gzip, 156.13 kB gzip in the final
  passing build. No real device/provider,
  live account/export, Phoenix, deployment or production policy acceptance.

The parent retains combined-candidate validation and merge decisions. No shared
file edits, merge to main, network/security configuration or paid calls occurred.
