# P7 exact-pin final disposition

**APPROVE** candidate `16a0e8598a3a5f96fa77532e3250a90288cfc2ab`, tree `d0acf98f68be81b96997feba9b56fdf5c725f34d`, relative to accepted main `c0b4e470aef77050792122a42f67e6633653a5c6`, for the approved product scope and documented operational limits. No remaining reproduced code blocker in this review. This is not deployment, live provider/device acceptance or a clean secret-scanner assertion.

## F7 closed

Narrow delta from reviewed `c5ab7bd20ef2b1ca6d235b29a01567c2f852d267` changes only session lifecycle observer handling, its regression test and candidate documentation. `activate()` restores the observer only if absent; `dispose()` ends the observed interval before detaching and clears the unsubscribe reference. Repeated activation/disposal is idempotent. The original independent reproduction was converted to required corrected behavior: cleanup/reactivate/start/wait/stop now emits one positive-duration interval. The producer regression additionally verifies observer counts, a subsequent call and exclusion of a 60-second disposed period. No new regression found in inspection.

Targeted execution: **38/38 pass**, comprising 24 lifecycle tests plus 14 independent tests covering F7, earlier session/restart/disconnect/Pictures/durable queue/F6/resume and capture/redaction/shutdown/replay/bounded-handle regressions.

## Carried composed review

The immediately preceding composed review at c5ab7bd established credential HTTP/UI/admission wiring, optional tutor and written-only paths, safe cleanup/recovery, explicit unknown/insufficient evidence, student timezone/daily progress, attributed dictionary gates, and capture/privacy boundaries. Its 11/11 mocked Chromium checks are carried forward; they were not rerun for this narrow observer fix. Direct WebRTC and orientative client duration are explicitly approved: absence of server-certified duration is not a defect. All tests here use synthetic data and injected/local transport; no live provider calls or external exports.

PostgreSQL-backed evidence remains integrator/producer evidence, not independently rerun here. The historical database-tested producer receipts are documented in docs/oct18-final-candidate.md; local optional database checks remain skipped. Retention/deletion configuration, real provider/device/Phoenix acceptance and deployment remain operational work. Best-effort capture has no automatic reconnect/backfill; eviction/restart may duplicate transcript capture. No audio persistence or professor raw-trace path was introduced.

Parent reports GitGuardian check 117705359215 is NEUTRAL for historical synthetic incident 38356190 / occurrences 304951765 and 304951766, with no new head finding reported. This review does not independently attest scanner state; NEUTRAL is not clean, and the historical review-only alert mapping remains unconfirmed. No scanner suppression, rotation or incident closure is performed or implied.

Commands:

```sh
npm run check
NODE_PATH=/opt/codex/cua_node/lib/node_modules node --import tsx --test tests/integration/*.test.ts tests/p4-lifecycle.test.ts
```

Logs: `/tmp/p7-final-f7-check.log`, `/tmp/p7-final-f7-targeted.log`. Review-only evidence changes; no product edits or merge. Approval binds the candidate SHA above, not a future changed head.

Completed independent standard checks: **428 Node tests: 367 pass / 61 skipped / 0 fail; 26 Python pass; TypeScript/Vite build pass**. Existing chunk-size advisory remains. These are the observed local counts, not the producer's database-enabled counts.
