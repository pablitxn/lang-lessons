# P3 account view integration receipt — 2026-10-18

## Scope and provenance

Interface base: `8316baa745acf0280181cf72ef6fa400561dcd05` (PR12).
Accepted application base: `c0b4e470aef77050792122a42f67e6633653a5c6`.
Branch: `feat/p3-account-views`. This receipt is frozen with the delivery commit;
the draft PR records its exact head. Sole integration writer remains task
`01a14e4c-74cd-7047-9c85-194a390d3001`.

Read the owner AGENTS, architecture, parallel handoff, final partial ADR freeze,
Atlas navigation skill and the merged Atlas plan/decisions at
`b24bad2ed6fa3360bdd3a877af755870df11b866`. The final ADR and current delegation
supersede older planning-only and ownership paragraphs. Requested execution model
is Astra/medium; an independently verifiable runtime routing receipt is unavailable.
No agents were launched.

## Integration requests

- Import `AccountShell` from `src/features/accounts`, `AdminUsers` from
  `src/features/administration`, and `ProfessorStudents` from
  `src/features/professor`. Styles are scoped and transitively imported. Root owns
  route registration, initial account loading, auth expiry and navigation.
- Supply canonical `CurrentUser` and server-supplied grants. Explicit capability
  names are adapter props, defaulting to null/deny. No role grants are inferred;
  even administrator does not automatically gain professor reads. The only named
  grants in this patch are clearly labeled fixtures.
- P2/integrator should adapt validated, private/no-store read responses to
  `AdminUsersApi` and `ProfessorApi`. These feature-local interfaces are view
  adapters, not new shared HTTP contracts. Map 401/403 to `denied`, other failures
  to rejection, honor AbortSignal and enforce authorization server-side for every
  request. Client capability checks are presentation guards, not security controls.
- `listAllStudents(cursor, signal)` deliberately has no assignment filter. Wire
  every server page, with bounded opaque cursors. Previous/Next replace the visible
  page; no client filtering or inferred totals. Only frozen public IDs/roles appear.
- `readProgress` receives a student ID and returns a matching student ID plus
  authorized session feedback states/comments. The view rejects mismatched student
  IDs and comment/session joins, renders comment text as text, and provides no
  grade or regeneration control. Server must validate ownership, schema, lengths,
  provenance and permitted disclosure before adapting. No metrics are computed.
- Bind `LoginApi` only after approved login policy and P2 integration. Credentials
  stay in the submitted form/request only, never browser storage; failure clears
  the form, reports a generic message and focuses it. Root owns canonical account
  refresh after `onAuthenticated`, including navigation focus. No logout action is
  selected because exercise-close/logout policy is unresolved.
- Mount/key account state by the current authentication epoch and clear it promptly
  on expiry/revocation. Read views discard previous data when the supplied actor,
  grants or requested resource changes; unmounted reads ignore late responses even
  if an adapter ignores cancellation. APIs should be stable object identities.
- Keep the internal `accounts/__fixtures__/preview.html` out of production route
  registration. It uses only injected fake accounts, comments and capabilities.

## Unselected policy and acceptance gaps

Q10: No create, edit, role assignment, disable/reactivate/delete, recovery,
registration, remember-me, session duration, student-history grant or admin-progress
grant is bound. Admin management is a paginated read-only shell until exact writable
DTOs/actions and grants are frozen. No live account provisioning occurred.

Q11: Performed/solved/mistake/performance/time definitions remain absent; progress
shows unavailable metrics rather than zeros or invented aggregates. Written and
oral results remain distinct. P5's eventual accepted projection needs a new adapter.

Q12/Q13: Session comments display supplied states only, with no retry, polling,
generation, retention/deletion, extra personal fields or evidence collection.
Production read disclosure and feedback availability need approved policy and P2/P6
integration; fixture rendering does not establish those rights or persistence.

Root wiring, actual authenticated P2 reads, production focus after login, physical
mobile/assistive technology and live auth remain integration acceptance gaps.
No deployment, credentials, paid calls, network configuration or Mac work occurred.

## Verification

- `npm ci --cache /tmp/p3-npm-cache`: passed. Initial default-cache `npm ci`
  failed because `/home/agent/.npm/_cacache` was unavailable; no lockfile changes.
- Final `npm run check`: 220 Node passes / 224 total, four opt-in browser skips;
  26 Python tests/content validation, strict TypeScript and Vite build passed.
- Initial full check: one failure in the unchanged voice-server concurrent-release
  fixture (`403 !== 200` at line 192). Isolated `tests/voice-server.test.ts` and the
  final full check passed. Preserve this observed nondeterminism for the integrator;
  no server/test fix or assertion of root cause is made here.
- `NODE_PATH=/opt/codex/cua_node/lib/node_modules P3_BROWSER=1 node --import tsx
  --test tests/p3-*.test.ts`: two tests passed. Actual supplied Chromium, mocked
  APIs only. Tested unresolved/role capability matrix; all-student second page;
  loading/empty/denial/error/retry; late old-student reply; grant revocation;
  comment/session mismatch suppression; generic login error/password clearing;
  duplicate login guard; detail keyboard focus and return focus; 320, 390, 844,
  1024 pixel reflow; no external requests or browser errors.
- Existing 530.35 kB bundle warning remains. Root bundle is unchanged because
  root registration belongs to integration; TypeScript checks the new modules and
  Chromium renders the dedicated fixture.
- Whitespace and scoped PR metadata checks run before publication. Identity guard
  passes with explicit per-command author/committer identity; global user settings
  are preserved. No shared contracts/foundation, root routes/styles, manifests,
  server router or migration registry changed. Eight tenses, exact 25 verbs,
  photographs and existing oral/written assessment behavior are untouched.

Temporary logs: `/tmp/p3-npm-ci.log`, `/tmp/p3-check.log`,
`/tmp/p3-voice-recheck.log`, `/tmp/p3-check-final.log`,
`/tmp/p3-targeted-final.log`. These are local evidence, not hosted CI results.
