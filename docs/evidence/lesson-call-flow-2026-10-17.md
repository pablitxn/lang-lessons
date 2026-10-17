# Lesson catalog and automatic call flow

Date: 2026-10-17. Status: local implementation and fixture verification.
Base: `57db399` on `codex/local-development-setup`. No commit, PR, merge or deployment
was performed. The pre-existing local-development launcher, env example and
setup evidence were preserved. README and voice documentation retain that setup
and now describe the revised product flow.

## Request and integration ownership

The user's nine browser comments and three final requirements authorize a home
catalog, automatic voice on lesson selection, pause/mute, modal preferences and
lesson progress, and removal of simulation and developer UI from the product.
The root executor acted as EN-WP-01 integration writer for shared contracts,
routing, settings and global styles. Parallel workers owned lesson UI, voice
lifecycle and browser verification with disjoint files. No shared Atlas canonical
files were edited; this application receipt is available for coordinator intake.

## Implemented behavior

- Home has Picture, Verb and Sentence cards. Empty/unknown routes show the catalog.
- Selecting a lesson starts one live adapter after feature context and service
  readiness exist. Unsupported sentence difficulty does not request media or a
  session; choosing an available difficulty can initialize that lesson.
- Mute changes track state. Pause stops local media and requests provider hangup;
  resume retains exercise/evidence. Route changes, unmount and pagehide clean up.
- Broker release tokens remain in memory and are scoped to the active lease.
  Confirmed hangup releases the lease; failed or ambiguous outcomes remain
  conservative. A subsequent explicit start waits for prior cleanup.
- Preferences is a native modal with appearance, microphone, learning and device
  sections. Theme defaults safely for older stored settings. Permission checks
  release their temporary stream immediately and do not start provider calls.
- Progress and reference dialogs hold advancement and restore focus. Requested
  hints and short audio-clarification statuses remain; inline coach panels, typed
  coach questions, simulation controls, introductory hero, aside note and footer
  are removed. Simulation adapters and evidence remain explicitly internal tests.

## Verification

`npm ci --cache /tmp/lang-lessons-npm-cache` completed. `npm run check` completed:
143 passing Node tests (3 opt-in browser suites skipped in that command),
21 Python content tests, curriculum integrity for 25 verbs,
17 prompts and 69 authored cases, TypeScript, and Vite production build.
Three opt-in browser suites are intentionally skipped by the default Node run
and were executed separately by the UI worker.

Browser verification used the README's supplied Playwright/Chrome helper against
local port 5174, with no external requests:

- Main helper: 4 viewport cases (320x640, 390x844, 844x390, 1024x768).
- Practice helper: 12 lesson/viewport cases and 8 failure/cancellation cases.
- Independent UI/feature suites: 16 viewport/mode cases, plus targeted uncertainty
  rendering regression checks.
- Preferences focus/Escape, dark/system themes, persistence, independent settings,
  owned-key reset and permission-check cleanup were exercised.
- Automatic connection, single startup under StrictMode, mute, pause/resume,
  progress preservation, route cleanup, delayed permission/preflight/broker
  cancellation, failed cleanup retry and unavailable lesson gating were exercised.
- Text enlargement at 200% was checked, including the corrected Preferences
  reflow at 320px and 390px.

Root visually inspected the catalog and Preferences in the existing in-app
browser, and reviewed current Chromium screenshots of the revised lesson UI.
`git diff --check` passed. No production dependency or lockfile change was made.

## Evidence limits and local runtime

All media, provider assessment and hangup tests used explicit fixtures or injected
transport. Actual Chromium rendering is verified; physical microphone behavior,
real provider pronunciation/latency, account/model access and audio quality are
not verified. No paid inference was performed. The existing local broker returned
`enabled: false`; its disabled state and credentials were not changed. The broker
process needs restarting to load server changes before separately enabling voice
with the documented local launcher. Vite hot reload already displays the UI.

This task follows the repository architecture/handoff and the Atlas engineering
language and parallel-integration standards. The accessible Atlas checkout was
read-only at `76eda32`; no catalog entry was inferred from absent lookup results.
