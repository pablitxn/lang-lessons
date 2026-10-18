# P5 written recovery handoff

Additive producer branch `codex/p5-written-recovery`, based exactly on PR19
`1f1583bd6fafe381e70d723a25c0dd35e31feb29` (`feat/oct18-completion`).
This preserves PR16 and F5 producer history, including
`54a8257626404e6137b1c648324e22a6eca2a64b`. No root/shared contract changes.

## Integration ports

Both `SentenceLesson` and `VerbLesson` accept `writtenPractice: WrittenPracticeBinding`
from `written-snapshot.ts`. Root must key/remount the feature by authenticated
user, canonical learning session and mode, and supply a stable binding per mount:

- `userId`: authenticated identity, not a guest/display-name fallback.
- `initialSnapshot`: optional previously loaded snapshot (omit when load returns null).
- `register(port)`: registers `snapshotWrittenPractice()` and
  `restoreWrittenPractice(unknown): boolean`; returns root's unregister callback.
- `onSnapshot(snapshot)`: save locally, surface storage failures, and ignore callbacks
  from a superseded actor/session. Draft text must never enter a server request.
- `onRestoreRejected()`: surface invalid/incompatible recovery; do not silently
  replace saved work. The binding suppresses saves after rejection.

`createIndexedDbWrittenSnapshotStore()` in `written-snapshot-store.ts` supplies
`load(scope, mode)`, `save(scope, snapshot)`, `remove(scope, mode)` and `close()`.
Scope is `{userId, sessionId}`. Load before mounting the feature. The database
holds one current exercise per mode/scope and rejects extra fields, oral event
payloads and mismatched scope. Feature restore also validates known curriculum,
photo selection and written progression. Root owns discovery, storage errors,
recovery confirmation, lifetime and any approved deletion policy.

Underlying feature sessions expose the same two methods and accept
`writtenPracticeUserId` plus `onWrittenPracticeChange`. Without user scope they
return null. Restore into a **newly created feature session**; a snapshot with the
same exercise ID as the current live controller is rejected because shared
`startExercise` deliberately does not reset an identical identity. Restore does
not connect/unmute the microphone or restore utterances, oral evidence or live
interaction. The source photo is restored only when it matches the reviewed ledger.

The root/P4 recovery flow must await the canonical session reconciliation and
local snapshot load/validation before reporting resumed. Continue injecting the
existing user/session-scoped queued `ProgressSink`, with its independent local
append chain from F5. Snapshot storage and progress storage use separate IndexedDB
transactions: there is no claim of atomicity across those databases. Root should
surface pending/unsaved storage state before deliberate navigation; abrupt browser
termination before local commits cannot be guaranteed durable.

## Written event behavior

Sentence translation emits typed/client-reported `written:translation`; tense
recognition emits `written:tense`. A reference match is accepted; a non-match is
uncertain because authored comparison cannot establish semantic incorrectness.
Tense choices use the matched alternative. Editing or starting composition
invalidates finalized translation and any dependent written tense, never oral
obligations. Repeated finalization of one draft is deduplicated.

Sentence snapshots preserve immutable event/attempt IDs and revision counters.
Verb snapshots preserve selected verb/photo, all drafts and finalized spelling
refs; local spelling is re-evaluated during hydration without emitting duplicate
results. Subsequent spelling events advance persisted revision numbers. No draft,
answer, transcript or feedback text is sent through progress. Pending journal
replay retains original event IDs and exercise ID/generation; restoration never
resubmits old result events with new IDs. Root must retain the existing journal.

Written and oral recovery remain distinct. Fresh oral attempt IDs reject delayed
pre-reload assessments. **Oral revision counters are not restored**: if prior oral
events exist for this recovered exercise, reconnecting and submitting new oral
results under that identity may conflict with the server journal. Root must start
oral practice under a fresh exercise identity/generation (or obtain a separately
specified revision-reset seam) rather than treating written recovery as oral resume.
No such root/controller/server policy was invented in this producer.

The snapshot is the current exercise, not the entire shuffled navigation history.
Restoring Pictures retains its selected approved photo and written completion
card, but creates a fresh future deck without changing the exact 25-verb inventory.
Dictionary content/source approval, metric totals, timezone, retention/deletion and
credential delivery remain outside this change and unselected where unresolved.

## Validation

`npm ci --cache /tmp/p5-npm-cache` and `npm run check` passed: 329 Node tests,
41 opt-in/environment skips; 26 Python/content tests; strict TypeScript and Vite
build. No disposable PostgreSQL environment was selected for this producer run.
Build retains the existing large-chunk warning (607.02 kB before gzip).

P5 tests with `P5_BROWSER=1` pass 37/37, including actual Chromium/IndexedDB reload,
held network delivery with subsequent durable appends, original-ID replay,
user/session isolation, rendered restored input, monotonic spelling refs,
dependent written invalidation, malformed-snapshot rejection and stale oral-result
rejection. Sentence feature browser test passes all four viewports using explicit
mocked transport/verdicts. No paid inference, real microphone/provider/device or
live account validation occurred.

The repository-wide browser helper fails the compact lesson-header assertion at
`scripts/smoke-browser.cjs:102`; the same assertion fails on the unchanged PR19
base. This root/layout issue is outside P5 ownership and is left for integration.
