# EN-WP-04 stable controller handoff

Recovery owner: EN-WP-01 integration executor. The separately dispatched voice
task failed provisioning and made no writes; parent explicitly transferred
`src/assessment/**`, `src/voice/**` and `server/**` to this working session.
Do not implement verb/sentence feature modules here. Foundation remains frozen.

Import `createAssessmentController`, `AssessmentSnapshot`, `AssessmentController`
and `AssessmentClock` from `src/assessment/index.ts`. Create one controller per
mounted lesson feature, with `{ context, allowMock: voice.mode === 'mock',
onAdvance, onContextChange: context => voice.setContext(context),
onCancelHint: () => voice.cancelPendingHints?.() }`.
Subscribe the controller to the adapter using `voice.subscribe(controller.handleVoiceEvent)`;
on unmount unsubscribe and `controller.dispose()`. The root owns connecting and
disconnecting the adapter. Controller subscription fits `useSyncExternalStore`:
`subscribe(listener)` plus stable `getSnapshot()` until a state change.

## Commands and read model

- `startExercise(context)` replaces an exercise using a new ID/generation and
  clears old results/timers. Repeating the same identity is idempotent.
- `invalidate(obligation)` immediately neutralizes an edited field and makes
  its older results stale. It preserves other obligations. Debounce and IME
  handling remain with the feature/UI; empty fields stay unattempted.
- `beginAttempt(obligations, attemptId?)` returns independent current refs and
  sets processing. Pass those refs in `LearnerInput.attempts` to `voice.submit`.
  One utterance can attempt multiple obligations. `getOpenObligations()` returns
  applicable unaccepted obligations in the current stage; passing an empty or
  disallowed target set returns no refs. Do not dispatch an empty request.
- `applyBatch(batch)` returns the applied result count. It checks generation,
  per-obligation revision/attempt, duplicate IDs and final-result settlement.
  Old results cannot overwrite a settled attempt, even after dedupe eviction.
- `setInteraction(patch)` updates authoritative speech, connection, question,
  focus, composition, draft and intent signals. `activity()` cancels/restarts
  pending quiet time. `setPresentationHold(id, held)` keeps helpers independent.
- `beginHint(target, level)` creates a correlated request; call the adapter's
  `requestHint`. `applyHint` rejects obsolete requests/stages and forbidden mocks.
- `manualContinue()` works only for a fully explained, quiet sentence exercise;
  returns false for verbs, incomplete lessons or active conversation/holds.
- `handleVoiceEvent(event)` handles structured adapter events. Feature transcript
  listeners may allocate an attempt after a final learner utterance, using the
  event's real `utteranceId`; uncertainty must never be recast as a learner error.

Snapshot fields: shared learning state plus `context`, `results` (full processed
feedback including spelling graphemes), `hint`, `hintPending`, `systemError`,
`advancePending`, `canContinue`, and `completed`. Use status/refs to associate
feedback with the current draft; do not render stale green/red against new text.

## Lifecycle rules

All accepted oral evidence needs actual audio or explicit mock permission.
Invalid-source acceptances become uncertain. A system error clears pending work
to uncertainty and preserves previously accepted independent work. On reconnect,
the caller deliberately creates fresh attempts; no automatic paid resubmission.
Each result settles only its own pending obligation. Ask for a new attempt to
correct or retry a terminal result. Source validation does not establish acoustic
quality: the provider's calibrated audio assessment remains unverified.

Sentence attempts may cover translation first, then tense/structure/meaning-fit.
Do not combine translation and explanation in one dispatched attempt. A corrected
translation invalidates dependent explanation and late hints. Each valid stage
change invokes `onContextChange`; helpers must never invoke `startExercise`.

For verbs the controller alone schedules the 1,800 ms quiet gate. Every activity
invalidates its ticket. It rechecks complete evidence, connection, speech,
questions, focus, composition, draft, presentation holds and stop/pause intent
inside the callback; completion emits only once. Features use `onAdvance` to pick
the next cue. Sentence completion waits for explicit `manualContinue()`.

UI/content owners remain independent. The root integration owner will supply
adapter/session/settings composition after their exports are ready. This API
does not require a provider key or a functioning new Cloud container.

Integration additions preserve the original API: `presentation-hold` is a scoped
root UI hold; `response-pending` blocks advancement during provider generation;
intent `practice` explicitly resumes after pause. Optional `voice.askQuestion`
handles typed conversational questions without oral evidence. Root composition
is in `LessonSession`; see [voice integration](voice-integration.md) for the
mock simulator, lifecycle, live setup and evidence boundaries.
