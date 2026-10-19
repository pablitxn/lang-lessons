# Account profile and automatic timezone amendment

Date: 2026-10-19. This local implementation follows the user's browser comments
requesting editable name/photo in account settings and automatic timezone
selection from the authenticated user's browsing context. That direction
supersedes the manual-choice requirement in the historical
[timezone handoff](TIMEZONE-HISTORY-HANDOFF.md). It does not change historical
attribution or grant access to another student's timezone.

## Profile API

- `GET /api/me` now includes the authenticated account's `name` and `image`.
- `POST /api/learning/profile` accepts exactly `{ name, image }` and returns the
  refreshed current-user DTO. Identity comes from the validated auth session.
- The display name is trimmed and must contain 1–80 characters without control
  characters. The image is either null or a canonical base64 JPEG, PNG or WebP
  data URL, with a maximum of 128 KiB decoded and dimensions from 1 to 2048 px.
  MIME/container signatures and dimensions are checked before storage; image
  decoding remains browser-owned. Animated WebP and executable image formats
  are rejected. The browser should resize uploads before submission.
- These fields reuse the existing Better Auth `user` columns. No schema
  migration, external storage or new authentication setting is required.
  External legacy image URLs are returned as null to avoid third-party requests.
- All enabled account roles can edit their own profile. Email, role, account
  state and credentials are outside this endpoint. Existing authorization,
  same-origin, rate and bounded-body gates still apply.

## Automatic student timezone

The browser sends its resolved IANA timezone as `x-learning-time-zone`. The
backend observes this hint after authentication at account bootstrap (`/api/me`)
and lesson creation. The hint is validated and canonicalized on the server.
Missing or invalid hints preserve the stored setting; no IP-derived guess or
server-location fallback is introduced.

Only the student's own timezone can change. Repeated and concurrent identical
observations reuse the latest revision; a valid changed zone appends one
server-effective history row under the existing user-row lock. Historical rows
and their effective boundaries remain unchanged. The explicit update API remains
available for compatibility with isolated fixtures and prior consumers.

## Verification

Twenty focused tests passed against disposable loopback PostgreSQL with isolated
synthetic schemas: profile boundaries and persistence, HTTP authentication/origin
and actor validation, concurrent timezone initialization, historical preservation,
and the existing account-management/daily-attribution suite. No provider call,
live credential change, schema deployment or source publication was performed.
