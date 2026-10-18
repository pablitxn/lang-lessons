# P3 student timezone continuation — 2026-10-18

This is an additive continuation on `feat/p3-daily-completion`, preserving PR20's
`480e738901938dde60d71a0c131ce6f479a4a156`. PR20 was already merged into the
integration branch, so this continuation needs a new review PR from the same
producer branch. Refreshed integration base is
`e742f26e75e549d6a11dd42aa82f893c2a76494c`; it contains the original P3 patch
unchanged. Fast-forwarding retained all in-progress owned files. No shared edits.

## Authority and consumed policy

Read P2 `server/accounts/TIMEZONE-HISTORY-HANDOFF.md` and
`student-timezone.ts` at `1d42e6015c992ebd8df8d30619b0e143cd226be5`.
Parent relayed approval to use the student's configured timezone. Only the current
enabled student with `timezone:own` can read/set their own setting. Administrator
and professor roles receive no timezone-write grant. Settings are prospective,
server-versioned and idempotent; previous records keep their historical attribution.

## Root integration request

Exported from `src/features/accounts`:

- `StudentTimeZoneSettings({user, capability, api})`. Supply explicit capability
  `timezone:own`; the default is null/deny, and the role must also be student.
  Mount it in the student account/home settings flow. Root `StudentApplication`
  bypasses `AccountShell`, so exporting this component alone does not mount it.
  No admin/professor edit control is introduced.
- `StudentTimeZoneApi.read(signal)` returns `ReadResult<StudentTimeZone|null>`.
- `StudentTimeZoneApi.set({operationId,expectedRevision,timeZone},signal)` returns
  `{status:'ok',value:StudentTimeZone}`, `denied`, `conflict` or `invalid-input`.
  This feature-local adapter mirrors P2's seam; root wraps the P2 read/set results
  and exceptions through authenticated HTTP/CSRF/body limits. Do not accept actor
  IDs or client effective timestamps. Validate returned zone, revision and time.
- `StudentTimeZone` is `{timeZone,revision,effectiveAt}`. All are server results;
  no guessed value is persisted. Revision zero is used only for a missing setting.
  On a lost reply, explicit retry reuses the entire original operation/body. No
  automatic retry occurs. Conflict requires a fresh read before a new request.

Missing settings show an explicit notice and an empty input. Choices come from
runtime-supported IANA names plus UTC, with typed explicit choices allowed. The
validator follows P2's syntax and explicit-timezone Intl validation, rejecting
abbreviations, numeric offsets, empty/invalid values. It never resolves the browser
zone as a default. Server rejection is authoritative. Saving displays the canonical
server result/effective timestamp, and explains prospective attribution. Requests
ignore late completion after unmount, actor/grant changes or revocation.

## Historical professor presentation

P3 now displays page `attributionTimeZones` and each result's `timeZone`, preserving
server values. The date heading no longer labels every record with page.timeZone.
The scalar is explicitly identified as the student's reported zone and does not
replace the historical-zone list. Mixed-zone dates disclose all contributing zones.
A missing new field is displayed as unavailable, never copied from the scalar or
viewer/browser timezone. The missing-setting daily notice keeps independent history.

Root must extend `src/contracts/daily.ts`/client validation with P2's required
`attributionTimeZones: readonly string[]` and `DailyResult.timeZone: string` and
pass them through unchanged. Until root integration, feature-local optional
`AttributionFields`/`EventAttributionFields` provide additive structural compatibility;
they are not a second persistence contract or permission to omit new server fields.
Root should also validate P2's now-published nullable history start/end timestamps.
Existing P3 history rendering already consumes them. P2 migrations/repository and
shared DTOs/routes/validators remain entirely with the integrator/P2.

## Evidence

- `npm run check` passed after refreshing to the integration base. Exact counts
  are recorded in the PR; DB/environment-gated checks remain explicitly skipped.
- Seven targeted tests passed: P3 capability/IANA checks, three actual Chromium
  fixture suites and two root daily-client tests. Mock APIs only, zero external
  browser requests/errors. Own-setting tests cover missing/unbound/read errors,
  no browser default under Asia/Tokyo, explicit IANA/UTC selection, no administrator
  or professor access even with a fixture capability, duplicate-submit suppression,
  server revision/effective timestamp, exact lost-reply replay, stale conflict
  refresh, server denial/invalid input, grant revocation, focus and four widths.
- Daily browser coverage now includes mixed historical America/New_York and
  Europe/Paris attribution across independently paged records, with server scalar
  timezone distinct from those record zones. Existing daily/history/account/admin
  regressions remain passing.
- Existing main bundle-size warning remains. Build typechecks the unmounted
  setting module and fixtures; browser tests render it directly. This is not proof
  of root setting routes/mount, production persistence, real accounts, live export,
  provider/device acceptance or configured retention/credential handoff.
- Logs: `/tmp/p3-timezone-integrated-check.log`,
  `/tmp/p3-timezone-integrated-targeted.log`; earlier checks are retained in
  `/tmp/p3-timezone-check.log` and `/tmp/p3-timezone-targeted.log`.

No root/shared contracts, server, routes, manifests, migration registry or broker
were edited. No paid calls, deployment, live provisioning, security/network changes,
main merge or subagent launch. Sole integrator remains
`01a14e4c-74cd-7047-9c85-194a390d3001`.
