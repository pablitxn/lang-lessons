# October 18 final functional candidate

This candidate composes the reviewed integration base and Phoenix capture, P2 credential links and P5 dictionary snapshot. Main merge awaits independent P7 review of the exact published candidate.

## Producer receipts

- Main prerequisite: c0b4e470aef77050792122a42f67e6633653a5c6 (preserved local written-practice/UX/photographs).
- Frozen PR18: cfce584dfd3eca73bc41f87be2b00b0ba3a49b71.
- PR19 composition: 660f55764df7ed3c24615b8959b1604f0f9ac697, retaining P2 1d42e601, P3 313739ed, P4 f26fa5b0, P5 5267f1d5, P6 de1b1eff and P7 F1–F6 repairs.
- Reviewed capture PR23: 84ced70f1f533fb0dc73c94a4baa8d0b95e1112d (C1/C2 accepted at 959ad101 plus additive generated synthetic credential fixtures).
- Credential PR24: ab22cee4a91e2af1b2b53753533e301c38e8e243, with root migration, HTTP, admin actions, redemption UI and operator-only bootstrap now composed.
- Dictionary PR25: d50e657c3ad186d7c1ec29457475f24c6033ec74, with exact 25-verb coverage, attribution/license notices and unavailable example disclosure.

## Approved behavior and remaining operational limits

Direct WebRTC remains. Browser time is stored separately as orientative intervals, never trusted tutor evidence. Daily tutor/combined estimates are unavailable if observations are missing; overlaps are counted once. Unknown historical calls can close after explicit confirmation and provider cleanup, with insufficient-evidence feedback instead of invented comments. No-call written sessions close without fabricated tutor feedback. Unknown provider-creation outcomes or failed hangup still cannot be assumed cleaned up.

Account setup/reset links are administrator-issued, manually delivered, hashed in storage, single-use and expire after 30 minutes. Redemption invalidates existing sessions; the login/reset lock fences concurrent login races. Anonymous redemption has Origin checks, bounded JSON, no-store responses, request rate limits and a shared eight-request per-process admission cap. The fragment is cleared before rendering the credential UI; no token/password/link is persisted in browser storage or telemetry. Initial administrator bootstrap is an explicit local operator command and refuses an existing administrator. Only synthetic disposable accounts were created for testing.

README now describes required PostgreSQL/configuration/migrations, first administrator, manual links, optional tutor, persistent learning data, credential-page hosting fallback, and separate Phoenix opt-in. No deployment, credential provisioning for real users, network/security configuration, live provider calls, real transcript export or recorded audio occurred. Real voice/device/Phoenix acceptance and operational retention/deletion configuration remain deferred.

Capture retains its bounded queue, two-second drain, redaction and source distinction. Replay protection covers the latest 256 segment records and is not durable across restart/eviction. Automatic observer reconnect/backfill is not implemented; capture is best-effort diagnostics.

## Validation evidence

Disposable loopback PostgreSQL exercises all registered migrations, canonical history/cleanup/close, orientative interval union and ownership, initial administrator bootstrap, actual Better Auth login, root HTTP issuance/redemption, hash-only storage, replay rejection, reset session invalidation and blocked public signup. P2 additionally covers expiry, concurrent redemption, transaction rollback, login/reset races and bounded-pool lock behavior. Mocked Chromium separately covers shipped written-only/optional-tutor exits, IndexedDB restore, timezone/daily pagination and orientative labels, admin link issuance, credential fragment clearing and dictionary completion. No mocked evidence is presented as live voice acceptance.

Full aggregate command: P2_DISPOSABLE_DATABASE_URL=postgres://postgres@127.0.0.1:55433/p2_test P2_P6_COORDINATOR=file:///workspace/lang-lessons-root/server/feedback/coordinator.ts npm run check. Logs and previous failures are preserved in /workspace/integration-oct18-completion/final-*.log. P2's older concurrent-release discrepancy does not reproduce with the preserved synchronized test in this composition. An HTTP browser fixture required the new reconciliation route; a combined browser run hit a Vite startup timeout, then the isolated dictionary browser suite passed. The admission regression exposed an async catch omission, corrected before final publication. Bundle-size warning is retained.

Historical GitGuardian incident 38356190 and occurrences 304951765/304951766 point to fabricated Basic-auth fixtures in 959ad101. Check 117672446041 on 84ced70 remained NEUTRAL because the PR scan includes that history. Fixtures now generate synthetic values at runtime. No scanner suppression, rule change, credential rotation or history rewriting occurred; NEUTRAL is not clean. Review-only alert mapping remains reviewer-owned.

Requested model/effort: gpt-6-astra/medium. Actual routing metadata is not exposed to this executor.
