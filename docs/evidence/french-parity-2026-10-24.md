# French parity validation — 2026-10-24

The isolated feature branch starts from source main
`6347dd4c08ff487d0933dc7c06da9139c7f9fddd`. The user authorized implementation
and publication for Lang Lessons; unrelated application checkouts were preserved.

## Implemented scope

- Account-persisted English/French selection with legacy English defaults.
- Shared three-mode experience and language-isolated canonical sessions.
- 25 French irregular verbs, six French constructions, 54 Spanish prompts,
  150 translated verb examples, and 75 local photograph associations.
- French references, sourced dictionary, written spelling/translation/tense
  practice, Spanish hints, tutor rubrics and language-labelled professor results.
- Additive database migration without rewriting existing English progress.

## Local evidence

`npm run check` passed: 448 Node tests passed, 88 explicitly optional browser/SQL
or provider-fixture tests skipped; 26 Python content mutation tests passed;
TypeScript and the production build passed. The Vite bundle-size advisory remains
non-fatal. Dedicated SQL execution against a throwaway PostgreSQL instance passed
51 tests with one existing optional feedback fixture skipped. No production
database was targeted by the test suite.

Actual Chromium checks exercise English/French switching, all six canonical
mode/language practices, repeated return and reload, exact draft/photo preservation,
server-only first-device French preference hydration, accent-sensitive spelling,
six tense filters, local translation/tense completion, the dictionary and decoding
all photographs used by French. Browser transport and authenticated responses are
explicit fixtures; no microphone, paid hint or real provider request is made.
The independent English continuity helper passed all three modes at mobile and
desktop widths and retained cross-tab call scope.

The browser found and drove fixes for an English-only detached snapshot validator
and a first-hydration language race. Independent review drove normalization of
cross-device merged tense settings, latest-field merging after asynchronous exit,
and French pronunciation/tense/example/cue corrections. Source integrity tests
verify retained photograph bytes and pinned dictionary attribution.

## Boundaries

These checks establish local behavior and browser rendering. They do not establish
physical-device audio quality or deployment. Source PR, immutable runtime image,
migration and deployed smoke results are recorded separately by the release owner.
No new credentials, access expansion or security-setting changes are included.
