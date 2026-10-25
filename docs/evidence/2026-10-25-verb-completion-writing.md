# Verb completion and optional written coaching

Date: 2026-10-25. Local working-tree evidence on `codex/exercise-feedback`,
based on `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. No commit, publication or deployment
is claimed. Concurrent voice-readiness changes were preserved.

## Delivered behavior

Both verb modes now compose `VerbCompletionCard`, `VerbDictionaryEntry`,
`VerbFormSummary` and `VerbSentencePractice`. The dictionary retains reviewed
source wording, pronunciation, Spanish meanings, three written forms and any
available source example. Credits remain in preferences.

After the required written forms are accepted, learners may expand an optional
composer and write a sentence using the current verb in any tense. Only an
explicit submission calls `POST /api/realtime/verb-writing`. The existing
server-side OpenAI credential and hint-model configuration are reused following
the user's explicit key-reuse choice. No credentials were changed or copied into
the client. No additional provider dependency was introduced.

The broker validates origin, payload, known curriculum, authenticated owned
active session and structured provider output. Body sizes, concurrency, rate
and total request duration are bounded. Edits, close, exercise replacement and
unmount cancel requests and reject stale responses. Operational failures retain
the learner's draft and offer manual retry. Successful duplicate drafts reuse
the mounted exercise's bounded memory cache. Coaching never creates oral
evidence, alters progress or satisfies a completion requirement.

## Validation

- `npm run check`: 481 Node tests passed, 90 opt-in tests skipped; 28 Python
  tests passed; curriculum integrity, TypeScript and Vite production build passed.
  The existing bundle-size warning remains. Loopback tests required execution
  outside the restricted sandbox after its bind permission returned `EPERM`.
- `VERBS_BROWSER=1`: both modes passed at 320x640, 390x844, 844x390 and
  1024x768, including explicit-submit-only dispatch, form-edit cleanup and Next.
- `VERB_WRITING_BROWSER=1`: responsive composer, English/French content,
  keyboard/IME handling, malformed responses, error retry, cancellation and
  stale session/exercise/generation behavior passed with intercepted transport.
- `P5_BROWSER=1`: dictionary visibility, writing invalidation, manual navigation
  and source attribution through preferences passed at mobile width.
- Twelve HTTP tests cover the real route with mocked provider transport;
  strict parser regression tests also reject non-string status coercion.
- An independent scoped static review found no remaining actionable defects.
- The local stack was restarted using its existing saved configuration.
  `http://127.0.0.1:5174/` returned 200; unauthenticated status and writing routes
  returned 401. The authenticated in-app browser retained the completed `bleed`
  exercise, rendered the new card and opened the empty optional composer.
  The tutor remained stopped and no correction was submitted there.

Browser tests used the supplied Playwright runtime and installed Google Chrome.
Provider outcomes in tests are fixtures, not linguistic evidence. The opt-in
PostgreSQL authorization test was not run because no disposable database URL was
provided. No real inference, microphone, pronunciation or physical-device test
was performed.

Local visual evidence:

- `/tmp/lang-lessons-verb-completion-mobile.png`: completed dictionary at 390px.
- `/tmp/lang-lessons-verb-completion-live.png`: actual local app in dark mode,
  showing the completed verb and expanded optional composer.

The Superdesign reference was imported from authored HTML without AI generation:
[canvas](https://superdesign.dev/teams/8e22fdf1-c847-4485-a20c-dd877eb35305/projects/5d70e86e-5a49-451e-8193-cfe5ec514283).
Local resume metadata records the component context and fingerprints.
