# Lang Lessons

This repository owns the English-learning application and its implementation contracts.
Read [docs/architecture.md](docs/architecture.md) and [docs/parallel-handoff.md](docs/parallel-handoff.md)
before editing shared or feature modules. Preserve concurrent work and inspect status first.

Write technical repository text, comments, test names and PR metadata in English.
Spanish learning prompts and sound guides are intentional curriculum/localization.
Use English Conventional Commits with a meaningful scope. Use the five-section
[PR template](.github/PULL_REQUEST_TEMPLATE.md). Publish code through draft PRs;
no merge, force push, deployment, paid inference or security-setting change is
authorized by this file. Honor explicit session authorization.

The [Atlas engineering directive](https://github.com/pablitxn/sysadmin-workspace/blob/main/atlas/ops/standards/engineering-language-and-commits.md)
and [parallel integration standard](https://github.com/pablitxn/sysadmin-workspace/blob/main/atlas/ops/standards/pull-request-and-parallel-integration.md)
apply. For personal Cloud commits, author and committer must be
`Pablo Coronel <git@pablocoronel.com>`; use the accessible Atlas identity guard.
Do not overwrite credentials or conflicting role-specific identity settings.

Resolve Atlas from the actual neighboring `sysadmin-workspace` Git root. Read
its `AGENTS.md`, `atlas/AGENTS.md`, and `.agents/skills/atlas-navigate/SKILL.md`
for project context when the skill catalog does not expose it. For authorized
Atlas maintenance, read `atlas-maintain/SKILL.md` and follow intake. Application
workers deliver intake notes to the coordinator; they do not independently edit
shared Atlas canonical documents. Never invent historical filesystem mounts.

EN-WP-01 is the sole writer for manifests, lockfile, routing, global styles and
`src/contracts/`. Feature workers request contract changes rather than editing
these paths. Keep provider events untrusted, validate at the boundary, reject
stale attempts, and never infer pronunciation from text. Mark mock evidence.
No permanent key belongs in browser code, Vite variables, logs or committed files.

Use `npm ci`, `npm run check`, and the supplied browser helper documented in
the README. New tests should target behavior and race conditions. Separate unit
fixtures, mocked provider transport, actual browser rendering, physical device
testing and real provider evidence. A green build is not real voice validation.
