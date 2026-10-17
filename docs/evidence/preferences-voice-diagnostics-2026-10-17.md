# Preferences navigation and voice diagnostics

Date: 2026-10-17. Scope: local browser review follow-up.
Branch: `codex/local-development-setup`.
Base HEAD: `57db399d8ea5ee800b915390622a73f10a9cd8c2`.
Status: uncommitted changes on the existing dirty development tree. Earlier
lesson call-flow changes were retained; this receipt does not claim their authorship.

## Observed causes

Read-only loopback checks found the frontend and broker reporting `enabled: false`.
The existing launcher ran without `--voice`, explicitly disabling paid calls.
The ignored server environment file contained an API key; no credential value was
printed or copied. This confirms local configuration presence, not account/model access.

The verb spelling path required a connected realtime protocol before reaching its
local assessor. Submitting written spelling offline therefore produced a misleading
response-processing/reconnect error.

## Changes

- Remove the catalog microphone note requested in browser comment 1.
- Group Preferences into Appearance, Voice, Learning and Storage. Use a sidebar
  on wider screens and compact section navigation on small screens. Preserve native
  modal focus handling, microphone release, settings persistence and scoped reset.
- Expose a bounded readiness reason: disabled, missing-credentials or ready.
  Display distinct app messages without forwarding provider error bodies.
- Evaluate typed spelling locally before connection and during pause, preserving
  exercise identity checks and typed evidence provenance. Typed work cannot satisfy
  oral requirements. Guard remote questions and hints while disconnected.
- Update supplied browser helpers to navigate sections and exercise offline spelling.
- Correct the launcher notice: selecting a lesson starts a call when voice is enabled.

The verified existing launcher was restarted in the same disabled-voice mode.
The updated live readiness endpoint returned:
`{"enabled":false,"reason":"disabled","maxDurationSeconds":600}`.

## Validation

- `npm ci --cache /tmp/lang-lessons-npm-cache`: passed.
- `npm run check`: passed; 149 Node tests passed, 3 opt-in browser fixture tests
  skipped, 21 Python tests passed, curriculum integrity and production build passed.
- `npm run test:browser -- 5174`: passed at 320x640, 390x844, 844x390 and 1024x768,
  including section layout, focus/Escape, persistence/reset and offline spelling.
- `node scripts/smoke-practice.cjs 5174`: passed for three modes at the same four
  viewport sizes, plus cancellation/release/retry cases.
- Browser helpers used the supplied Playwright package and installed Chrome with
  mocked media and provider transport; external provider requests remained absent.
- The user's in-app browser visibly showed the new disabled-voice message and
  sidebar preferences at 692x1026. Screenshot: temporary local artifact
  `/tmp/lang-lessons-preferences-sidebar.png`.
- JavaScript syntax checks for the edited launch/smoke scripts and
  `git diff --check`: passed.

No live voice/provider, physical microphone/device, pronunciation, account access,
credit or cost validation was performed. No commit, publication, merge or deployment
was performed. Real voice remains disabled pending explicit paid-use authorization.
