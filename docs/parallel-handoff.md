# EN-WP-01 parallel implementation handoff

Repository: `pablitxn/lang-lessons`. Branch: `feat/en-wp-01-foundation`.
Foundation owner: this EN-WP-01 executor; coordinator: source thread
`01a118ed-6bf7-7481-93e6-336de48270f7`. No repository existed at the inspected
starting revision; use the exact published foundation commit from the receipt
as each worker's base. Do not independently create alternative scaffolds.

## Exclusive file ownership

| Owner | Owned paths | Public output |
| --- | --- | --- |
| EN-WP-01 foundation/integration | Root manifests/lockfile/config, AGENTS, README, `src/contracts/**`, `src/app/**`, `src/platform/**`, `src/main.tsx`, `index.html`, `.github/**`, `docs/architecture.md`, this handoff, foundation tests/scripts | Shared types, routing, settings, feature composition |
| EN-WP-02 UX | `src/ui/mobile/**`, `docs/ux.md`, `tests/ux*.test.ts` | Accessible components and scoped styles; request global changes |
| EN-WP-03 curriculum | `src/content/**`, `public/images/verbs/**`, `docs/curriculum.md`, `tests/content*.test.ts` | `VERBS`, `SENTENCES`, `pickNextVerb` from `src/content/index.ts` |
| EN-WP-04 voice and assessment | `src/voice/**`, `src/assessment/**`, `server/**`, `docs/voice.md`, `tests/voice*.test.ts`, `tests/assessment*.test.ts` | `createMockVoiceAdapter`, `createRealtimeVoiceAdapter`; reducer/scheduler exports |
| EN-WP-05 verbs | `src/features/verbs/**`, `docs/verbs.md`, `tests/verbs*.test.ts` | `VerbLesson` component, named export from `src/features/verbs/index.ts` |
| EN-WP-06 sentences | `src/features/sentences/**`, `docs/sentences.md`, `tests/sentences*.test.ts` | `SentenceLesson` component, named export from `src/features/sentences/index.ts` |
| EN-WP-07 verification | `tests/integration/**`, `scripts/verify-*.cjs`, task-specific `docs/evidence/en-wp-07-*.md` | Requirement/evidence receipt, independent combined-revision checks |

Use scoped CSS imports within owned UI/features. Only foundation changes global
CSS (`src/app/global.css`), manifests, scripts, shared types or route registration.
Request new dependency/scripts once; do not regenerate lockfiles independently.
All worker test entry points must match `tests/*.test.ts` until the integrator
adds an explicitly coordinated discovery mechanism. Browser checks use the
environment's current Playwright/Chromium helper, not a copied stale executable.

## Stable entry points

Import shared contracts from `src/contracts/index.ts`. `VerbLesson` accepts
`LessonModuleProps & { mode: VerbMode }`; `SentenceLesson` accepts
`LessonModuleProps`. The root owns one `VoiceAdapter` and session ID; feature
unmount invalidates the exercise but helper open/close never unmounts the feature.
Feature implementations set context, allocate attempt refs through the assessment
controller, submit typed/utterance inputs, subscribe to events, and clean up their
subscription. The voice adapter must also stop on root unmount or mode change.
`onComplete(exerciseId)` reports completion, not permission to bypass gates.

Curriculum returns `readonly VerbEntry[]` and `readonly SentenceEntry[]` matching
the shared schema. Export `pickNextVerb(previous?: VerbId, random?: () => number):
VerbEntry` with no immediate repeat when there is an alternative. Randomness is
injectable and stays in exactly `VERB_IDS`; tests can use fixed random values.
Use original local SVG cues with attribution; no image-generation calls needed.

Voice factory signatures are `createMockVoiceAdapter(): VoiceAdapter` and
`createRealtimeVoiceAdapter(options?: { sessionEndpoint?: string }): VoiceAdapter`.
Default real endpoint is `/api/realtime/session`; receive `RealtimeSessionResponse`.
The server reads credentials from its environment, never `VITE_*`. Coordinate
dev proxy and npm server scripts with foundation. The shared default limits are
in `TIMING`. Provide mock simulation controls through separate named exports or
an extended mock interface; do not add test-only methods to real adapters.

The assessment worker owns reducer API design inside its boundary but must use
the shared refs/statuses/events/policies. Return its exact exported API promptly
for both feature workers. Do not put transport/network logic in contract helpers.
Unknown provider JSON must be validated before becoming a typed event; casting
JSON is not validation. All accepted evidence must satisfy source policy before
it reaches the ledger. Future typed practice is not oral completion by default.

## Mandatory acceptance cases

- A single batch can satisfy several independent obligations, in any order.
- Late prior exercise/generation, old field revision, duplicate events and older
  hint revisions cannot update current state or overwrite newer feedback.
- New spelling in one field preserves valid audio evidence for other obligations.
- Uncertain audio, connection failure and processing never count as learner error
  or success. A text-only transcript cannot pass pronunciation.
- No verb advances with any missing obligation, continued speech, pending question,
  assistant audio, focused typing or unresolved processing; a timer rechecks state.
- Translation precedes explanation; accepting translation alone cannot complete
  sentence mode. An edited translation invalidates its dependent explanation.
- Both since-2020 examples, contractions, connected speech, "he buys" and complete
  participle constructions receive contextual assessment, not exact-string gates.
- Hints are gradual; sentence tense/translation are hidden until translation is
  accepted. Mock hints/evidence are never reported as real model or audio results.

## Integration receipt and Atlas intake

Return branch, immutable commit, base, owned paths, commands and actual results,
mock/real/mobile distinctions, dependencies and limitations. Freeze a dated
task-specific receipt; amend later instead of overwriting published evidence.
Do not merge. The integration owner composes a candidate after feature branches
are ready, verifies current remote heads and runs combined checks. Each task
owns its independent draft PR; stacked PRs may target this foundation until main
exists. Shared Atlas edits remain with the coordinator. Foundation supplies
`docs/atlas-intake-en-wp-01.md` for eventual sourced integration.
