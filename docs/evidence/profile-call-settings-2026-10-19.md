# Profile settings and lesson call controls

## Scope

The 2026-10-19 browser comments requested account settings with editable name and
photo, sign-out inside settings, one aligned call button, automatic timezone
context, lesson-specific recovery, and investigation of call startup errors.
Changes are local on `codex/account-experience`, building on the existing dirty
account-experience work. Earlier work was preserved. The root integration writer
owned shared contracts, application composition, platform and global styles;
delegated workers owned bounded backend, recovery and voice paths.

## Behavior

- The student header contains the avatar and a single phone action. Starting a
  call requires readiness and exercise context. During preparation/connection
  the phone becomes hang up; unavailable service disables it. Mute stays beside
  the exercise while a call is active.
- Preferences contains profile name/photo editing and sign-out. The same account
  editor is available to student, professor and administrator roles. Profile
  changes preserve the active lesson and canonical session. Historical opaque
  account-ID name placeholders are hidden without rewriting database records.
- The profile endpoint accepts only authenticated own-account name and bounded
  local raster content. Browser preparation resizes/re-encodes the selected photo;
  the backend independently validates type, signature, dimensions and byte limit.
- Browser timezone context travels in a same-origin request header. The backend
  validates it on account bootstrap and lesson creation and appends prospective
  timezone history. Missing/invalid context does not replace a saved timezone.
- The catalog omits account identity, manual timezone setup and generic recovery.
  Selecting a lesson checks saved work before creating a canonical session. One
  matching session is primary; older matching sessions are collapsed. Incomplete
  discovery keeps a retry path instead of silently discarding pending work.
- Voice readiness precedes server call allocation. Cancellation rejects late
  preparation, the WebRTC channel deadline starts after SDP exchange, and safe
  broker errors remain actionable. No live provider request was made.

## Verification

- `npm ci --cache /tmp/lang-lessons-npm-cache` passed.
- `npm run check` passed: 397 Node checks, 68 opt-in skips, zero failures;
  26 Python tests, curriculum integrity, TypeScript and production build passed.
- Focused disposable PostgreSQL account/profile/timezone/management/daily tests
  passed, including exact own-account persistence, privilege-field rejection,
  automatic timezone concurrency/history and legacy display-name sanitization.
- Actual local API/browser profile smoke passed save/reload persistence, photo
  removal, unchanged session/exercise/generation and typed draft during profile
  edits, timezone attribution, sign-out/reload revocation, and aligned controls
  at 320/390/607/1280px. Raw fixture profile values were restored afterward.
- Browser component tests covered duplicate saves, failed saves retaining drafts,
  stale/unmounted results, photo replacement/removal races, recovery discovery,
  account changes, selected-mode resume and one producer mount.
- Supplied browser, practice, past-tense and written-sentence helpers passed with
  mocked media/provider transport. Coverage includes mobile/desktop reflow,
  startup/hangup/cancellation/retry and written exercise races.
- Shipped written recovery browser regression passed with the selected-lesson
  entry flow. Client profile/navigation-context tests passed.
- Mobile profile and 607px lesson screenshots were visually inspected. They use
  a synthetic local account profile, not real learner evidence.
- Independent integration review found and fixed stale readiness after the
  service becomes unavailable between the initial check and the call click.
  The final browser regression confirmed a disabled icon with no allocation or
  media/provider start, a read-only recovery check, and exactly one call after
  the next explicit click. Fifty focused lifecycle/runtime tests and the final
  production build passed after this correction. No additional concrete
  regression was found in the reviewed integration paths.
- Final actual local administrator/student account smoke and mocked logout-race
  smoke passed through Preferences. The account harness was corrected to permit
  read-only availability GETs while continuing to block provider POSTs; its
  earlier zero-request assertion counted those harmless checks as provider calls.
  The complete rerun verified zero provider requests and logout revocation.

## Limits and operational state

The existing local development launcher was restarted with its already-enabled
voice configuration. The user tab was refreshed on the cleaned lesson catalog.
No paid provider call, actual microphone/audio validation, physical-device test,
publication, merge or deployment occurred. Browser transport success does not
establish provider entitlement or real voice quality. Existing concurrent changes
remain local and uncommitted. This application-owned receipt is the coordinator
handoff; no shared Atlas canonical documents were edited.
