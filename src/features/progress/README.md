# P5 progress and Pictures handoff

Producer base: `8316baa745acf0280181cf72ef6fa400561dcd05` (PR12).
Accepted application base: `c0b4e470aef77050792122a42f67e6633653a5c6`.
Branch: `codex/p5-progress-pictures`. Sole integrator:
`01a14e4c-74cd-7047-9c85-194a390d3001`.

## Implemented behavior

Both feature sessions observe reduced controller evidence and submit only the
frozen processed-result/invalidation envelopes to an optional injected
`ProgressSink`. Results carry the actual controller AttemptRef, claimed source
and fixed client-reported trust. No answer, transcript, provider feedback,
keystroke stream, aggregate, grade or usage timer is sent. Duplicate view updates
emit nothing. Editing processed spelling invalidates once before a later result;
revising oral translation invalidates its dependent explanation with real
controller-allocated refs before the reset removes it. Stale provider results
remain rejected by the controller. Offline spelling uses the existing local
adapter assessment and preserves independent oral obligations.

Both lesson components accept `progressSink`, `onProgressError` and `canWrite`.
Provide a stable sink for the mounted session. The root-owned sink must enqueue
synchronously at submit, own serialization/replay/receipts, and reject flush if
any queued event is rejected. Feature errors display a save-failure status and
invoke onProgressError; no automatic retry, persistent queue or invented close
policy is added. Root must retain the failed queue/error for its exit coordinator.
The optional canWrite callback blocks controller-based draft submission,
navigation, and assessment/transcript consumption during root preparation without
remounting. Local sentence comparison is intentionally separate from this sink.

Pictures removes automatic startNext at the accepted completion callback. The
card is revealed only after all existing accepted gates and quiet checks, reports
completion once, and stays until explicit Next. Next checks the completed exercise
identity, so a second callback for the old card cannot skip another exercise.
Completed fields cannot mutate the displayed drafts behind the frozen ledger.
History retains typed work and does not restore old oral evidence. Visible-word
mode retains its existing automatic advancement.

The card renders field-level dictionary provenance when supplied, but production
passes null until source/content approval. Missing content is visibly unavailable;
no dictionary definitions, examples, phonetics or corpus were authored/imported.
The preload adapter uses the frozen scheduler with one running decode and one
latest queued descriptor. It peeks only the existing deck, never draws randomness,
never changes the displayed cue, and never delays Next. The last entry has no
preload until the next round is normally selected. Disposal and generation changes
suppress stale callbacks; decode failure falls back to ordinary image loading.

## Requests to P4 and the integration writer

1. Pass the mounted session's stable ProgressSink and canWrite gate through
   LessonSession to both feature components. Connect onProgressError to the
   coordinator's failure state; preserve the complete queue until flush receipts.
   Use root exit coordination for flush/fence/close; this branch edits no root files.
2. The frozen AttemptRef obligation union has only oral sentence translation and
   tense identifiers. Add a distinct written comparison/tense event identity before
   persisting local sentence feedback. A reference mismatch is not a semantic
   incorrect verdict. This branch never maps written success to an oral gate.
3. Update the two integration-owned assertions in tests/verbs.test.ts named
   "completed history retains typed work ..." and "both verb modes require every
   oral gate ... then advance once after quiet". In Pictures, explicitly call
   nextPicture(completedExerciseId) before asserting generation 2 or visiting back.
   Preserve the visible-word auto-advance assertion. Existing verb browser tests
   also contain the historical auto-advance expectation and need owner updates.
4. Home-only Progress/Reference navigation remains root-owned. No progress totals
   screen can be populated before Q11 metric definitions/read DTOs are frozen.
5. Approve dictionary source/revision, field content and reuse/attribution handling
   before injecting DictionaryEntry or adding a content corpus. Q10-Q13 remain
   unselected; this implementation defines no policy defaults.

## Evidence and limits

- `npm ci --cache /tmp/p5-npm-cache`: passed (79 packages). Initial default-cache
  attempt failed on the inaccessible home cache; no manifest/lock change.
- `P5_BROWSER=1 node --import tsx --test tests/p5-*.test.ts`: eight passes, including
  actual Chromium rendering at 320x640 with injected oral verdicts, zero external
  requests and no page errors. Cases cover completion/Next, no early reveal,
  decoding bounds/staleness/failure/disposal, offline progress, invalidations,
  duplicate observations, sink failures, write freeze and stale oral results.
- One uncontrolled-wall-clock browser run timed out waiting for completion after
  earlier passes. The final fixture installs and pauses the browser clock before
  navigation, then advances through the quiet interval; final run passes. This is
  mocked timing evidence, not real human timing acceptance.
- `SENTENCES_BROWSER=1 node --import tsx --test tests/sentences-browser.test.ts`:
  passes at 320x640, 390x844, 844x390 and 1024x768, simulated transport/verdicts.
- `npm run check`: remains non-green on the two owned-by-integrator historical
  Pictures auto-advance assertions above. No test was weakened or edited outside
  P5 ownership. An initial concurrent server release fixture failed (403 vs 200);
  its 16-test isolated suite and subsequent full run pass. Keep this transient
  failure distinct from the two deliberate expectation changes.
- `npm run test:content`: passes, including 26 Python tests. Strict TypeScript and
  production build pass separately because npm check stops at test failure.
  Existing bundle-size warning remains (approximately 535 kB JavaScript).
- No shared contracts/helpers, root routing/runtime/styles, dependencies, migration
  registry, server router, curriculum, eight tenses, exact25 list or photo ledger
  changed. No paid provider, live accounts, deployment, Mac or network configuration
  changes. Hosted CI, real voice/device and linguistic/source-license acceptance
  are not claimed. Requested Astra/medium routing is not independently exposed by
  this executor; no model-switch receipt is claimed. No agents were launched.

## Atlas intake for the parent

Read Atlas navigation and maintenance instructions for boundaries only; no Atlas
or Notion writes. This handoff is the producer intake for the parent to reconcile
against [merged plan and decisions](https://github.com/pablitxn/sysadmin-workspace/tree/b24bad2ed6fa3360bdd3a877af755870df11b866/atlas),
EN-D16-D26 and open Q10-Q14. Application contracts and the final partial freeze in
`docs/adr/p1-accounts-progress-sessions-2026-10-18.md` govern this implementation.
No merge or deployment is performed by this producer.
