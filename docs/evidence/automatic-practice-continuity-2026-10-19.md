# Automatic practice continuity

## Delivered behavior

Picture, Verb and Sentence open their saved exercise directly. The learner sees
no recovery list, start-new gate or manual resume/finalize action for written
practice. A single current-practice pointer belongs to each account. Concurrent
entry requests reuse the selected record; switching modes retains each mode's
saved work without presenting historical sessions as competing active sessions.

The last selected record is remembered for each mode, including installations
with duplicate legacy records. Reentry cannot silently choose a newer legacy
record instead of the exercise the learner last used. Exercise identity, picture
selection and unfinished text survive reload and return navigation. Initial
exercise snapshots are saved even before the learner types.

Ordinary departure saves written progress and keeps its canonical record open.
Only a currently connected call requires confirmation. Confirming ends that call,
reconciles transport cleanup and saves the same written practice. Cancellation
keeps the call and draft. Failed cleanup or progress acknowledgment remains
retryable without closing or replacing the practice. Explicit legacy maintenance
still retains its close-receipt and ambiguous-result safeguards.

Current call transport is separate from historical connection evidence. Restored
call controls only reflect the mounted session, including when another tab has
changed the current practice. The production broker excludes receipts older than
65 minutes: OpenAI documents a [60-minute maximum Realtime session duration](https://developers.openai.com/api/docs/guides/realtime-conversations#session-lifecycle-events),
and five minutes conservatively cover setup beyond the bounded creation request.
Entry reconciles expired transport receipts without calling the provider or
rewriting whether the historical call connected.

## Verification

- `npm run check`: 420 Node tests passed, 82 opt-in tests skipped, zero failures;
  26 Python tests, content integrity, TypeScript and production build passed.
  The existing bundle-size advisory remains.
- Thirteen direct-entry backend tests passed against isolated local PostgreSQL.
  Coverage includes concurrent entry, stale operation replay, actor isolation,
  mode switching, preserved queued progress, legacy duplicate selection, expired
  receipt reconciliation and continued rejection of competing live calls.
- Fifty-six lifecycle and recovery unit tests passed. A stopped or disconnected
  historical call does not trigger confirmation. Connected-call confirmation
  preserves the written record; cleanup retry does not skip a failed broker
  reconciliation after its segment was already stopped.
- Chromium continuity checks passed in eight groups: each mode at 390px and
  705px widths, an all-mode roundtrip, and another tab changing the active call.
  They verify untouched and edited exercise restoration, stable session/exercise/
  photo identity, local-only drafts, no manual recovery and no text-exit popup.
- Three persisted browser integration tests passed, including active-call
  cancel/confirm, waiting for the written acknowledgment before navigation, and
  reentry with the same session, exercise and draft. Authenticated HTTP and media
  transport were mocked for these tests. The legacy recovery fixture, written
  recovery fixture and account-switch/sign-out race checks also passed.
- The running local application was inspected through the existing in-app
  browser: all three lesson routes entered directly, reload preserved their
  exercise, and returning from Verb preserved Picture's selected image. The
  previous stale-call notice disappeared; a local aggregate query found zero
  outstanding call receipts. No call was initiated during verification.
- `git diff --check` passed.

## Runtime and scope

The additive `2026-10-19-active-practice` and `2026-10-19-practice-reentry`
migrations were applied to the verified loopback development database. The local
launcher was restarted with its existing configuration. Existing account,
preferences and UI changes were preserved. This is local, uncommitted work;
no publication or deployment occurred. Real provider audio and physical-device
behavior were not tested.
