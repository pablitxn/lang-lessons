# Preferences layout and account synchronization

## Delivered behavior

The second 2026-10-19 browser review is implemented locally. Progress and Reference
remain at the viewport bottom, with room below the final lesson card. Preferences
keeps fixed, viewport-bounded dimensions across Profile, Appearance, Voice and
Learning. The content pane scrolls independently; the left sidebar contains
sign-out at its bottom. Narrow layouts use accessible icon navigation.

The close action is an X with a 44px target and accessible name. Profile photo
selection uses a camera button and a compact format hint; the redundant profile
subtitle and Storage section are removed. Styled native selects retain keyboard
interaction. Profile name/photo edits retain their explicit save/cancel workflow.

Appearance and learning preferences save automatically to an account-scoped
device cache and the authenticated PostgreSQL account. Server snapshots use
revision checks. Pending local field changes survive offline reload and merge
without replacing untouched server fields after conflicts. Initial legacy device
preferences migrate once; subsequent accounts do not inherit that legacy cache.
Disposal aborts requests and fences stale results across account changes.

## Verification

- `npm run check`: 415 Node tests passed, 71 opt-in tests skipped, zero failures;
  26 Python tests, content integrity, TypeScript and production build passed.
  The existing bundle-size advisory remains. Loopback-dependent tests were run
  with local network access after the sandbox rejected their fixture listeners.
- Fifteen synchronization tests cover hydration, edits during reads/writes,
  offline reload, account isolation, failed storage, disposal and bounded
  conflicts. Client validation rejects malformed response envelopes.
- Twenty-six focused backend tests passed against disposable PostgreSQL,
  including preference isolation, first-write concurrency and revision checks.
- `smoke-preferences-layout.cjs` passed at 320, 390, 705 and 1024px widths:
  fixed footer and last-card clearance, unchanged bounds for all four sections,
  content-only scrolling, sidebar sign-out, focus and native keyboard selection.
  Profile/Learning screenshots at 705x924 and 390x844 were visually inspected.
- Updated browser, practice and past-tense helpers passed with mocked transport:
  four browser viewports, twelve practice cases plus lifecycle checks, twenty-four
  active tense cases and twelve disabled cases. Profile component upload/race
  checks passed with the new controls.
- `smoke-preferences-account.cjs` passed against the running local application:
  automatic device/database save, rapid changes, reload, fresh-browser hydration,
  isolation from another account, and unchanged active exercise/draft. It restored
  the original synthetic account preferences using revision and payload guards,
  revoked its isolated sessions and observed no page errors or provider requests.

## Local runtime and limits

The additive account-preferences migration was applied to the verified loopback
development database. The existing launcher was restarted with the same prior
voice configuration. Actual browser rendering and local PostgreSQL persistence
were verified; media/provider transport remained mocked or blocked. No paid call,
physical-device test, publication, merge or deployment occurred. Existing work
remains uncommitted; earlier concurrent changes were preserved. No shared Atlas
canonical document was changed.
