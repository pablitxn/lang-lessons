# Account experience implementation receipt

## Scope and authority

Task: account-experience, 2026-10-18. Source base:
`81c02791d2b96cfb4f6bbf5ea3cf08969d323740`.
Working branch: `codex/account-experience`. This receipt describes local,
uncommitted implementation and local verification, not a deployed frontend.

The user requested a usable login, sign-out, recognizable administrator account
identities and usable student access, then requested a running local environment.
The root executor acted as the sole EN-WP-01 integration writer for shared
contracts, application composition, platform client, development scripts and this
receipt. Separate workers owned feature UI, server account disclosure/logout and
an independent race review. No worker edited shared Atlas documents.

## Result

- Login and account management use the existing cream/green visual language.
  Administrators see email, readable roles, activation and password readiness;
  IDs are available only in collapsed technical details.
- Creation defaults to Student. Setup and reset actions match credential state,
  explain manual delivery, and allow copying a private one-time link. No automatic
  email delivery or public signup was added.
- The authenticated current account receives its own email. Administrator listing
  receives email and password readiness after authorization. Professor directory
  disclosure remains unchanged; password hashes and credentials are never exposed.
- Sign-out invokes the existing protected Better Auth adapter. Student sign-out
  first follows the existing lesson confirmation, call cleanup and progress flush.
  Canceled exit preserves the session. Account mutations and new lesson navigation
  are unavailable while sign-out is pending.
- Authentication generations reject stale unauthorized responses. A management
  refresh cannot restore an account after confirmed sign-out.
- Development browser entry through `localhost:5174` redirects to the canonical
  `127.0.0.1:5174` origin before loading the app. The exact localhost alias, GET/HEAD
  and document-navigation headers are required. API requests, other hosts and
  production/preview remain outside this development hook.

## Verification

- `npm ci --cache /tmp/lang-lessons-npm-cache`: passed after granting network access.
- Final `npm run check`: 371 Node passes, 62 opt-in skips, zero failures; 26 Python
  tests, curriculum validation, strict TypeScript and production build passed.
  The existing bundle-size warning remains.
- Focused real disposable PostgreSQL tests: 15/15 passed with no skips, covering
  account disclosure and actual login/logout, revoked cookie rejection and
  preservation of an independent administrator session.
- P3 browser tests: passed with mocked HTTP and actual Chromium, including
  creation, account confirmation, unknown outcomes, failure and duplicate guards,
  identity/search and responsive layout.
- Credential browser tests: 2/2 passed. Synthetic one-time link issuance/redemption,
  fragment clearing and absence of credential browser storage were verified.
- `scripts/smoke-accounts.cjs`: passed against the real local API/database with
  private local fixtures. Administrator/student login, readable identities,
  four-width reflow, written lesson exit, sign-out and reload revocation passed.
  No provider request occurred.
- `scripts/smoke-account-races.cjs`: passed with shipped root components and mocked
  HTTP timing. Covered overlapping refresh/logout and blocked lesson navigation.
- Supplied `scripts/smoke-browser.cjs 5174`: passed all four viewport cases, using
  simulated media/provider transport. The old hard-coded avatar-initial assertion
  was replaced with the actual Preferences availability check.
- Desktop and mobile login/admin screenshots were visually inspected.
- `git diff --check`: passed.

The user's subsequent screenshot exposed a missed entry point: earlier acceptance
used `127.0.0.1`, while sign-in POSTs from `localhost` returned 403. The local-only
navigation correction was then verified with the real account smoke starting at
`localhost`: both role logins, query/hash preservation, credential-fragment
capture/clearing, written practice and logout passed. Direct localhost API login
still returned 403; API origin validation was not loosened. TypeScript and the
production build passed again. The user's existing browser tab was observed on
the canonical origin showing the student lesson catalog.

Initial sandboxed checks could not bind loopback; the complete authorized rerun
passed. An early browser smoke expected the old hard-coded avatar initials; the
corrected availability assertion and complete rerun passed. These failures are
not reported as successful original runs.

## Operational separation and limitations

Local PostgreSQL and development services run on loopback. Local fixture secrets
and configuration are in ignored private files. Separate user-authorized account
provisioning is not a source-code deployment, and its credentials are excluded
from this receipt and Git.

The user explicitly enabled the local voice service for manual iteration after
the tests. Readiness reported enabled/ready with existing server credentials;
no provider call was initiated by this task. Real audio, provider entitlement,
physical devices and pedagogical correctness remain unverified here.

Shared Atlas context follows its engineering-language and parallel-integration
standards. This app-owned receipt is the coordinator intake; no canonical Atlas
update, source publication, merge or frontend deployment occurred.
