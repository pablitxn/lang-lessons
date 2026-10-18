# P7 final composed review

Exact candidate: `c5ab7bd20ef2b1ca6d235b29a01567c2f852d267` (PR26).
Accepted main: `c0b4e470aef77050792122a42f67e6633653a5c6`.

## Verdict: REQUEST CHANGES — one reproduced P2 integration regression

The approved direct WebRTC tradeoff is accepted: client-derived tutor duration may be orientative, unavailable observations stay unavailable, and safe cleanup permits unknown historical calls to close with insufficient evidence. Lack of server-certified duration is not a finding.

**F7, P2: effect cleanup/reactivation permanently removes orientative timing observation.** `src/app/session-lifecycle.ts:33,148–149` subscribes once during creation, unsubscribes on dispose, then only resets `disposed` during activate. `src/app/LessonSession.tsx:35–40` retains the lifecycle across effect cleanup/setup; `src/main.tsx:15–16` renders StrictMode. In development StrictMode's initial effect cycle therefore disables timing observation before the user's first call. An effect rerun caused by a changed registration callback has the same lifecycle consequence. This is not a claim that production StrictMode itself performs the development double-effect cycle.

Independent reproduction in `tests/integration/p7-candidate-time.test.ts`: construct real session runtime/mock voice and lifecycle with reportCall, run dispose/activate, start, remain ready briefly, stop. A fresh lifecycle reports one interval; the reactivated lifecycle reports `[]`. The server accepts an empty observation list and can display zero, rather than unavailable, for a call that elapsed. No real voice needed. Restore an idempotent runtime subscription on activate (or bind/unbind consistently with lifecycle activation), with a regression proving cleanup/activate observes subsequent ready/offline transitions and does not duplicate intervals. No product fix made by reviewer.

## Other inspected areas

- Credential producer now wired into root services, migration registry, authenticated admin issuance, anonymous redemption and policy routes. Origin/JSON/byte limits, no-store replies and the shared eight-request login/redemption admission cap are present. Runtime-generated synthetic browser checks exercise issuance, dismissal, fragment clearing and no browser persistence. Operator bootstrap is local-only. Credential transaction/lock review carries forward; actual PostgreSQL revalidation is unavailable in this environment.
- Direct WebRTC observations use an owned canonical segment, separate table and explicit orientative labels. Unknown history returns insufficient-evidence only after broker cleanup guard; unconfirmed provider cleanup still fails closed. Recovery accepts unknown history and requests confirmation. No-call sessions without segments retain direct exit.
- Dictionary composition retains written-only gates, explicit Next and local attributed snapshot. Source revision/hash/license metadata and unavailable example remain intact. Sample source-page retrieval was unavailable during the scoped producer review; source authenticity is producer evidence.
- Capture C1/C2 and bounded replay fixes remain; generated review fixtures avoid committed credential-shaped values. No new audio-persistence or raw-professor-trace path found. No external export/live provider test performed.
- GitGuardian check 117704296225 was reported pending by parent. No independent clean verdict is claimed. Historical synthetic incidents and unconfirmed review-only occurrence mapping are not dismissed by newer heads.

## Independent execution

- `npm run check`: **427 Node tests: 366 pass, 61 skipped, 0 fail; 26 Python pass; TypeScript/Vite build pass**, existing chunk advisory. Producer DB-backed pass counts were not substituted for local skipped tests.
- Prepared independent regressions plus F7 reproduction: **14/14 pass**. Thirteen verify existing fixes (restart, disconnect reconciliation, Pictures, IndexedDB stalled-network persistence, resume, F6, capture privacy/draining/replay/bounds); F7 test passes by asserting the current defect, not by establishing correct time collection.
- Browser results are recorded below after completion. All exercise the actual rendered checkout with mocked services/local transport; they are not live Better Auth/PostgreSQL/provider acceptance.

Commands:

```sh
npm run check
NODE_PATH=/opt/codex/cua_node/lib/node_modules node --import tsx --test tests/integration/*.test.ts
NODE_PATH=/opt/codex/cua_node/lib/node_modules PERSISTED_BROWSER=1 RECOVERY_BROWSER=1 P3_BROWSER=1 P5_BROWSER=1 ROOT_NAVIGATION_BROWSER=1 node --import tsx --test --test-concurrency=1 tests/integration-credential-browser.test.ts tests/integration-persisted-browser.test.ts tests/integration-written-recovery-browser.test.ts tests/integration-recovery-catalog-browser.test.ts tests/p3-daily-browser.test.ts tests/p3-timezone-browser.test.ts tests/p5-browser.test.ts tests/root-navigation-browser.test.ts
```

Logs: `/tmp/p7-candidate-check.log`, `/tmp/p7-candidate-independent.log`, `/tmp/p7-candidate-browser.log`. No product edits, merge, deployment, actual credentials, live provider or external telemetry operations. This is a scoped manual review, not an exhaustive security scan.

Completed Chromium run: **11/11 pass** — credential redemption and admin issue/dismiss (2), persisted root/optional tutor/close ordering (3), recovery catalog and same-session written draft restore (2), professor daily and student timezone (2), attributed written-only dictionary (1), root history/navigation/flush/retry across four viewports (1). These existing browser assertions do not inspect emitted orientative call interval contents and therefore do not detect F7.
