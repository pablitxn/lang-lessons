# Sentence dictionary, prompt help and optional rewriting

Date: 2026-10-25. Local working-tree evidence on `codex/exercise-feedback`,
based on `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. No commit, publication or
deployment is claimed. Existing exercise-feedback and concurrent voice-readiness
changes were preserved.

## Delivered behavior

- The information icon sits inside the Spanish prompt. Help expands within that
  cue, above the answer, without covering the input. Outside-click dismissal runs
  after the target action so collapsing help cannot swallow a navigation click.
- Dictionary mode makes the submitted annotation's whole words selectable,
  including contractions and French elisions. A selection opens a dictionary
  card inside the exercise. Unambiguous reviewed verb forms reuse the local
  entry; other words use the same-origin dictionary broker and official English
  Wiktionary endpoint. Only the selected word goes to Wiktionary. Dynamic French
  entries have explicitly labelled English definitions; missing entries and
  service failures remain distinct, without generated definitions or IPA.
- `DictionaryEntryCard` is shared with both verb modes. Remote entries show
  source links, CC BY-SA attribution and the excerpt/format adaptation notice.
- Accepted written translations expose optional `SentenceRewritePractice`.
  Explicit submission asks for a grammatical paraphrase preserving the source
  meaning. Spanish feedback distinguishes grammar corrections, meaning drift,
  valid variants and uncertainty. Original translations remain intact.
- Sentence and verb coaching reuse `useWrittenCoaching` and the shared validated
  feedback contract. Credentials stay server-side. Edits, close, replacement and
  unmount cancel outstanding work; coaching writes no progress or oral evidence.

## Automated validation

- `npm run check`: 505 Node tests passed, 93 opt-in tests skipped; 28 Python
  tests, content integrity, TypeScript and Vite build passed. The existing
  bundle-size warning remains.
- `SENTENCE_REWRITE_BROWSER=1`: four viewport sizes passed explicit dispatch,
  original-answer preservation, cache reuse, errors, identity changes, IME,
  French content and stale-response cancellation.
- `SENTENCE_TOOLS_BROWSER=1` and `SENTENCES_BROWSER=1`: four sizes passed the
  actual lesson integration, help geometry, contraction lookup, local verb
  reuse, dictionary cleanup, optional rewrite behavior and navigation.
- `scripts/smoke-written-sentences.cjs 5174`: eight viewport/call-state cases
  plus tense, hint-race and touch checks passed. A first run exposed the
  pointerdown dismissal/navigation race; the fix and focused one-click Next
  regressions passed before the full helper was rerun successfully.
- `VERBS_BROWSER=1`, `VERB_WRITING_BROWSER=1` and `P5_BROWSER=1`: shared-card and
  coaching regressions passed, including both verb modes, four sizes, stale
  results, dictionary completion and attribution.
- Thirteen sentence-rewrite HTTP tests and eleven dictionary HTTP tests cover
  authenticated routing, authorization denial, bounded transport, source data,
  response validation and cancellation/deadlines with mocked providers.
- TypeScript and `git diff --check` passed after integration. Independent scoped
  reviews found no remaining actionable defects.

The browser suites used the supplied Playwright runtime and installed Chrome,
with intercepted model/dictionary transport and no real voice calls. Disposable
PostgreSQL authorization tests remained skipped because no disposable database
URL was supplied. No paid inference, microphone or physical-device validation
was performed.

## Live local observation

The development stack was restarted using its existing saved configuration.
The authenticated app at `http://127.0.0.1:5174/#/sentence` retained the learner's
homework translation and tense selection. Selecting `homework` returned the real
Wiktionary definitions and source attribution through the new broker route.
The tutor remained stopped and no rewrite was submitted to the real model.

Screenshots:

- `/tmp/lang-lessons-sentence-dictionary-live.png`: actual app and public
  dictionary response.
- `/tmp/lang-lessons-sentence-tools-mobile.png`: integrated mobile fixture with
  explicitly mocked dictionary and rewrite feedback.

Wikimedia documents the definition endpoint as experimental; graceful service
failure remains part of the feature rather than an assertion of word absence.
See [the source documentation](https://www.mediawiki.org/wiki/Wikimedia_REST_API).
