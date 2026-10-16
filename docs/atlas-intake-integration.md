# Integration intake for the Atlas coordinator

Source context: sysadmin-workspace `62dcbe9079eb6c447a00786405fb7976dc94e92c`,
English-learning main page, roadmap, backlog and 2026-10-16 consolidation.
Canonical Atlas files are unchanged. This document is an intake, not a competing
project source of truth or a request to mark the entire roadmap complete.

## Delivery and ownership

- Foundation is frozen at `fd1678b93b3a55166fd8492bea307e6191e9a7dd`, draft
  [PR #2](https://github.com/pablitxn/lang-lessons/pull/2).
- Dedicated branch `integration/en-roadmap-local`, draft
  [PR #5](https://github.com/pablitxn/lang-lessons/pull/5), targets the frozen
  foundation. No GitHub PR has been merged.
- EN-WP-01 owns shared manifests/lockfile, contracts, routing, settings persistence,
  root/session composition, integration scripts and these receipts. Parent
  transferred EN-WP-04 recovery ownership for `src/assessment/**`, `src/voice/**`,
  `server/**` and their focused tests after a separately launched container failed
  provisioning without writes. No additional worker was spawned here.
- Content PR #1 at `5e0fec5e3f3c20c4327d59c77d72c75d07250dde` owns
  `src/content/**`, `content/en-wp-03/**`, `public/images/verbs/**` and associated
  content docs/tests: 25 verbs, 17 prompts, 69 authored oracle cases and 25 SVGs.
- UI PR #3 at `462fbda76c9931c7ef6736228e7280f1a7a628d0` owns
  `src/ui/mobile/**`, `docs/ux.md` and UI tests.
- Sentence PR #4 at `dbd1cf214326a361cdcb8251aff6cfbe8ef9c278` owns
  `src/features/sentences/**`, `docs/sentences.md` and sentence tests. Its owner
  supplied final compatibility changes for questions, mock registration and hint
  cancellation. Overlapping temporary local edits were discarded in favor of
  that published commit. Integration owns only its root entry-point composition.
- Verb PR #6 at `bb92fdd20e52a11016eeec130d69748dc14d1fc5`, feature commit
  `37f288fcda5942a9c51e8988ec9b33f886ac17c8`, owns `src/features/verbs/**`,
  `docs/verbs.md` and verb tests. It is incorporated additively. Both root verb
  routes use `VerbLesson`, root lifecycle controls and the stable queued-audio
  reservation callback; no producer-owned files were independently edited.

## Implemented decisions and assumptions

React/Vite/TypeScript follow the selected environment's existing exact versions.
Hash routes provide three modes; whitelisted localStorage preferences are the
only persistence. Provider choice, audio, transcripts, scores and credentials do
not persist. Help starts disabled; grammar/vocabulary remain independently set.

Evidence remains independent for spelling, Spanish meaning, each pronunciation
and three own sentences. Per-obligation revisions protect concurrent/out-of-order
results. Only actual audio or explicit mock permission can satisfy oral evidence.
Uncertainty is distinct from learner error. A cancellable 1,800 ms verb quiet gate
checks editing/IME, speech, pending work, questions, helper/root holds and intent.
Sentence learning requires translation then independent explanation, with manual
Next; EN-Q07 is not silently resolved into automatic advancement.

The default adapter is a deterministic, explicitly labelled simulator. The real
adapter uses native WebRTC through a loopback same-origin SDP broker and server-only
credentials. Paid creation requires separate explicit enablement. The local
ten-minute lease and browser cleanup are development guards, not a price guarantee
or production auth boundary. No real provider call was made.

Hints are requested by level/stage from the model adapter. Known lexical spoilers
are withheld; the sentence feature additionally uses its documented reviewed
display envelope and labels authored fallbacks. This remains a limitation for
free-form generated hints, not evidence that semantic no-spoiler behavior has
been solved. Acoustic correctness, grammar judgment, output speech adherence,
latency, physical mobile behavior and provider retention/cost remain unvalidated.

## Environment and approval boundaries

Local Git transport works and this existing environment started with an empty
repository. Remote `main` is absent; GitHub auto-selected the first pushed branch
as default. This is a plausible ref mismatch for new provisioning, not a proven
cause of the separate connector/capability-query failures. Detailed failed-task
logs are unavailable here. No main/default setting or credential was changed.
If the coordinator supplies approval and evidence calls for it, the smallest
candidate repair is publishing the existing empty bootstrap
`4a45e658bd587701559c4bc4eb6fb6f392ac0e94` as main, without merging code or
changing the default setting. That action has not been performed.

Stored Git identity remains unchanged. Commits use the approved author/committer
`Pablo Coronel <git@pablocoronel.com>` through command-scoped variables and the
Atlas identity guard. No force push, deployment, security-setting change, paid
call or canonical Atlas edit was performed. Actual agent model/effort metadata
was unavailable; requested settings were not falsely reported as verified.

Exact tested heads and evidence categories are recorded in the integration
evidence receipt and PR body. Only the coordinator should update Atlas completion
statuses after review of those limits and the remaining feature handoff.

## All-mode integration follow-up

All three feature routes are now usable locally in deterministic mock mode.
The previous receipt's pending verb integration item is superseded by
`docs/evidence/integration-all-modes-2026-10-16.md`; its historical evidence stays
intact. New runtime tests prove claimed queued audio is not also sent as a
conversation request, post-checklist questions still work, and stop/restart drops
unsubmitted old work. The root browser suite covers all three modes and both
dev/production preview. Real-provider and physical-device checks remain open.
