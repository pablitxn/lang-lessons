# P2 manual credential setup/reset handoff

Approved onboarding follow-up; separate producer branch `feat/p2-credential-links`, exact base `1d42e6015c992ebd8df8d30619b0e143cd226be5`. Integration PR19 inspected at `660f55764df7ed3c24615b8959b1604f0f9ac697`, which already composes that base. Integrator task `01a14e4c-74cd-7047-9c85-194a390d3001` owns root HTTP, registry, shared contracts and UI. Compose this commit additively; no root files changed.

## Consumer API

Register `server/data/migrations/p2-credential-links.sql` after p2-auth, p2-learning and p2-admin.

Construct `createCredentialLinkRepository({pool, origin, passwordPolicy, expiresInSeconds?})` from `server/auth/credential-links.ts`. Reuse the trusted configured application origin and login min/max password policy; never take origin or redirect targets from the request. Expiry defaults to 1800 seconds and may only be shortened.

- `issue(authenticatedIdentity, {userId, purpose: 'setup' | 'reset'}) -> {link, expiresAt}`. Only an enabled current administrator may issue for an enabled existing application user. Setup requires no password credential; reset requires one. No public signup. Issue replaces all prior links for that user. A lost response requires deliberate reissue; there is no retrievable raw-token receipt.
- `redeem({token, password}) -> {ok:true}`. Anonymous bearer redemption, with exact body shape and password validation. Invalid, expired, consumed, disabled-target and incompatible-purpose tokens return generic invalid-input. No login cookie/session is created; direct the user to ordinary login.
- The link is `<configured origin>/account/credentials#token=<256-bit random base64url token>`. Only SHA-256 digest, target/purpose/issuer/expiry and consumption time are stored. No raw token, password, link, email verification claim, invitation or message is persisted or sent.
- Consumption, Better Auth credential hash update, auth_valid_after boundary and deletion of all target sessions commit atomically. Concurrent redemption has exactly one winner. Failure rolls back all changes. All other profile/role/timezone/history state is preserved.

Existing account creation's `credentialSetup: 'pending-policy'` is an older compatibility DTO and remains untouched here; root/shared owners should now present it as awaiting manual setup issuance, or update that DTO consistently with P3. Do not imply that creating an account already sent a link or provisioned a password.

## Root and UI wiring required

Add an authenticated administrator issuance action (e.g. POST /api/admin/credential-links) and anonymous redemption action (e.g. POST /api/account/credentials), then the credentials page. Root must apply strict byte limits, JSON parsing, trusted Origin/CSRF validation and rate limits to both actions, with actual socket/trusted-proxy rate keys. Never expose Better Auth signup/settings/recovery routes or bypass its existing login wrapper.

Set `Cache-Control: no-store` on issue/redeem responses and `Referrer-Policy: no-referrer` on the credentials page. Keep token/password/link fields out of access bodies, exception logs, traces, analytics, screenshots and durable UI state. The page must read the fragment into memory, clear it immediately with history.replaceState before telemetry/rendering, and submit only in a POST body. The fragment avoids server access logs/referrer transmission; it does not make the link nonsecret. Show the link once to the authorized administrator for intentional manual copy/delivery. No email provider, mail dispatch, credential printing or live user provisioning is part of this producer.

The link remains usable only until first successful redemption or expiry/reissue. HTTP retries after success intentionally fail; show a generic sign-in/reissue path rather than claiming a second password mutation occurred.

## Login/reset race fence

`server/auth/credential-lock.ts` holds a PostgreSQL advisory shared lock across the actual login password verification and session insertion, and an exclusive lock across reset/setup transaction completion. This prevents an old-password login that started before reset from creating a usable session after reset commits. All application nodes must use the supplied auth wrapper and same database.

Waiting lock holders use dedicated short-lived database connections, not application pool slots; this avoids pool starvation/deadlock when multiple logins or resets wait. Connections close in finally, releasing session locks on errors. This adds one transient database connection per concurrent login/redemption; root rate limits and database connection capacity must bound demand. Normal sessions and account reads do not take this lock. Existing cookie-cache denial and auth_valid_after checks still reject a delayed pre-reset session insert.

## Validation and remaining boundaries

Synthetic disposable loopback PostgreSQL 17 only, pinned Better Auth/pg, no real credentials/accounts/provider calls. `npm ci --cache /tmp/p2-npm-cache` passed. Targeted P2 tests: 40/40, including setup/reset expiry, supersession, replay/concurrent redemption, role/disabled authorization, no raw-token receipt, password/role input validation, rollback after credential mutation, old-session deletion and delayed-session denial, new-password login, lock waiting and four concurrent logins with a two-connection application pool.

No shared/router/migration-registry/UI changes, user provisioning, outbound email, service access configuration, deployment or merge. Root must finish wiring and integration/browser tests before claiming end-to-end onboarding. Retention/deletion policy remains separate and unresolved.

Full npm run check was attempted twice after the final code and failed in unchanged tests/voice-server.test.ts concurrent-release behavior (403 versus 200); full serial Node execution reproduced it. Final full totals: 258 passed, one failed, three opt-in skips (262 total). Isolated voice suite passed 16/16. Separately, all 26 content tests and TypeScript/Vite build passed, retaining the existing bundle warning. No green full-check or root-cause claim; integrator must assess this pre-existing failure before merge.
