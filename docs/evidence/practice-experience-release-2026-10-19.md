# Account and practice experience release candidate

## Scope

This receipt consolidates the account, settings, call and lesson changes requested
in the October 18–19 browser review. Candidate base is
`81c02791d2b96cfb4f6bbf5ea3cf08969d323740`. The user authorized publication and
deployment of the accumulated changes on October 19. The release commit and
integration result are recorded by the pull request; this file does not certify
production deployment. Private instance and infrastructure evidence stay with
their existing owners.

- Account management shows readable identities and supports sign-out. Settings
  contains own-account name/photo editing, automatic account/device preferences,
  a stable modal, a compact photo picker and sidebar sign-out.
- Picture, Verb and Sentence restore their saved exercise directly. One current
  practice pointer belongs to each account; switching modes preserves drafts and
  history. Ordinary exit saves written work without closing the canonical record.
- The header has one readiness-gated call button. Connection timing, cancellation
  and stale transport cleanup retain explicit call lifecycle safeguards. Browser
  timezone context is validated and recorded prospectively by the backend.
- The home tools remain fixed at the viewport bottom. Exercise cards keep a
  viewport-bounded height and scroll internally; photograph height is capped.
  Routine synchronization is silent and failed saves keep a retry action.
- The completed Picture reference separates the lemma, pronunciation, definition
  and example, with a lightly tinted Next button. Exact source attribution and
  the downloadable snapshot remain under Preferences > Credits.
- Tab and Shift+Tab skip passive feedback and inline help controls. Alt+Down Arrow
  opens or closes help from an eligible answer; Escape dismisses it. Mouse/tap
  access, live feedback and accessible descriptions are retained.

## Data compatibility

The additive migrations are `2026-10-19-account-preferences`,
`2026-10-19-active-practice` and `2026-10-19-practice-reentry`. They add an
account-preferences table, an account-owned current-practice pointer and a
last-entry timestamp/index. Existing accounts, profiles, progress and historical
sessions are retained. Apply migrations before serving the new application.

Disposable PostgreSQL upgrade fixtures checked both the pre-preferences schema
and a schema with an existing current-practice pointer. Exact rows in 15 and 17
existing tables respectively survived the upgrades, the pointer timestamp was
copied without precision loss, and repeated migration runs were no-ops. This is
local compatibility evidence; production backup and recovery verification remain
deployment-owner prerequisites.

## Validation

- `npm run check`: 420 Node tests passed, 83 opt-in tests skipped, zero failures;
  26 Python tests, content integrity, TypeScript and the production build passed.
  Dependencies were installed with `npm ci` during this implementation session.
- Fifty-five targeted backend tests passed against disposable loopback PostgreSQL,
  with no skips. They cover profiles, timezone history, preference revisions,
  actor isolation, practice entry/reentry, call lifetime, migrations and HTTP
  boundaries. Both additional upgrade-retention fixtures passed.
- Eleven opt-in browser tests passed for credentials, authenticated composition,
  persisted practice, administration, call controls, recovery compatibility,
  dictionary credits and profile editing. An obsolete call test initially rejected
  read-only readiness checks; its assertion now distinguishes readiness from
  provider-session allocation, and the complete affected test passed again.
- Both shared-input browser regressions passed: four-viewport interaction checks
  and three-mode keyboard navigation, including dynamically appearing help,
  forward/reverse navigation, Alt+Down Arrow, Escape and enlarged text.
- Supplied browser, preferences-layout and session-continuity helpers passed:
  four general viewports, four settings viewports and eight continuity groups.
- The actual local account smoke passed administrator/student login, readable
  account management, written practice, sign-out, reload revocation and exact
  development-origin handling, with zero provider requests.
- A bounded independent review of 23 account/persistence/lifecycle implementation
  files found no concrete release blocker. Its focused tests passed 85 cases;
  its 19 database skips are covered separately by the database execution above.
  Candidate-file inspection found no credential literals or private operational
  host/address additions. Private local fixture files remain ignored.
- `git diff --check` passed. Light/dark mobile layouts were visually inspected.

## Limits

Browser transport evidence uses mocked media/provider responses. No paid inference,
real microphone/audio or physical-device validation was performed. The existing
bundle-size advisory remains. Current production health, backup readiness, image
identity and private routing must be verified by the deployment owner against the
published immutable source revision.

Earlier implementation receipts remain historical checkpoints:
[accounts](account-experience-2026-10-18.md),
[profile and calls](profile-call-settings-2026-10-19.md),
[settings](preferences-layout-sync-2026-10-19.md), and
[practice continuity](automatic-practice-continuity-2026-10-19.md).
