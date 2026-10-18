# Shared foundation interface receipt

Date: 2026-10-18. Owner: sole integration writer.
Base: accepted main `c0b4e470aef77050792122a42f67e6633653a5c6`.
Continuation base: PR12 `a369792a49fc6ce86d7c42e5539abca256f8fcbb`.
Implementation: the immutable commit containing this receipt, returned in handoff.
Dedicated local branch: `feat/shared-foundation`; PR12 continuation retains all
published commits and is not merged by this task.

## Delivered scope

Five additive contracts (accounts/progress/session/feedback/dictionary), barrel
exports, three pure foundation helpers and nine focused tests. The ADR's partial
implementation freeze specifies rollback receipts, independent journal/lifecycle
revisions, final event acknowledgment before confirmed close, root/P4 navigation
boundaries and serialized generation-safe decoding. PostgreSQL/Better Auth pins
and compatibility evidence are documented there. No feature UI, live route/auth
handler, database/schema/account provisioning or dictionary corpus is implemented.

The helpers are producer seams and pure transaction specifications. In particular,
the progress journal is not the application database and does not authenticate an
actor. P2 must implement actual ownership checks/transactions and response parsing.
P4 supplies exit policy/UI; root later wires browser history. P5 adapts the decoder
and completed Pictures UI. Their policies are not inferred here.

## Validation

- `npm ci --cache /tmp/p0-npm-cache`: pass, 79 installed packages at final lockfile.
- `npm run check`: 222 Node tests, 219 pass, three optional browser skips; 26 Python
  tests/content integrity, strict TypeScript and production build pass.
- All three opt-in browser suites ran concurrently with supplied Playwright and
  Chromium: UX, sentence and verb tests pass, zero skips/failures (four UX, four
  sentence and eight verb mode/viewport cases). Mocked transport only.
- Nine new tests cover atomic rollback/no false acknowledgments; conflicting and
  identical replay; committed versus current revision; input validation/trust;
  decision/flush/read/close/navigation ordering; cancel/rejection/stale identity;
  same-key explicit close retry; serialized/coalesced decoding, rejection,
  disposal and external URL exclusion; independent obligation revisions.
- An initial new negative test caught string coercion accepting a non-string source.
  Fixed by strict string validation for source/result enums; the original failed
  run is retained in external task evidence, subsequent full run passes.
- Better Auth core/Node adapter and pg ESM import smoke passes without configuration,
  pool creation, credentials or network connections. npm lists exact requested pins.
- `git diff --check`: pass. Atlas identity guard passes for both effective roles
  after its authorized repository-local email correction. No credentials changed.
- Existing 530.35 kB JS / 134.81 kB gzip warning remains. Built JS/CSS filenames
  match P0; no foundation/helper or auth server runtime is wired into the browser.
  Historical tooltip flake is not reproduced in the current concurrent run; it is
  not erased or claimed fixed.

## Producer boundary

The [ADR](../adr/p1-accounts-progress-sessions-2026-10-18.md#integration-owned-partial-implementation-freeze-2026-10-18)
is the exact file-owner and semantic handoff. Integrator owns shared contracts,
foundation helpers/tests, root/server composition, manifests/lockfile and migration
registry; producers request edits. P1 is idle and technical ADR ownership was
explicitly transferred. Parent launches producers and controls merge sequencing.

Q10-Q13 (account/access, metrics/time, qualifying calls/exit/retries and feedback
evidence/retention) remain unresolved. Dictionary source/license/content is pending.
No paid provider, physical device/voice, Phoenix, production or external source
rights acceptance is claimed. Atlas was not edited. Requested model is
`gpt-6-astra`/`medium`; runtime accepted-model metadata is not exposed to the worker.
