# Archived exercise design context

These files preserve the design discovery snapshots and verb-completion mockup
created on 2026-10-24 and 2026-10-25 during the exercise-feedback work. They were
recovered from the original local checkout on 2026-10-26 at the user's request.
The application changes were already integrated through PRs #30 and #31, followed
by the structured voice-result correction in PR #32.

- `init/` contains dated source excerpts, fingerprints and design observations.
- `resume.json` retains the design project/draft references and original hashes.
- `tmp/verb-completion.html` is the original standalone exploratory mockup.

This directory is historical design material. Source excerpts, file references
and fingerprints describe the original working tree and may differ from current
implementation. The application source and `docs/architecture.md` own current
behavior; these snapshots are not release, runtime or provider evidence.

The application does not import or serve this directory. The standalone HTML
loads Tailwind from an external CDN if opened manually; it is not part of the
application bundle. Its Spanish learner-facing text is intentional localization.
