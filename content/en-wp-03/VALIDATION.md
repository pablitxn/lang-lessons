# EN-WP-03 validation receipt, 2026-10-16

Pinned application contract base: `aff7aabe8b755090924fca176ffeb82ff5dbe384`
(`feat/en-wp-01-foundation`). Content branch:
`content/en-wp-03-curriculum-v1`. Atlas context:
`62dcbe9079eb6c447a00786405fb7976dc94e92c`, clean when consulted.
The final response and draft PR identify the immutable resulting content commit.

| Command / check | Actual result |
| --- | --- |
| `python3 content/en-wp-03/check_content.py` | Passed: exact25, 17 prompts, 69 authored oracles, references/variants/coverage/policy invariants |
| `python3 -m unittest discover -s content/en-wp-03/tests -v` | 17 passed; mutation checks for required content and oracle invariants |
| `node --test tests/content.test.ts` | Seven passed on Node v24.19.0; actual adapter and all eligible random-selection bins, invalid randomness, contract inventory, alternatives and difficulty preservation |
| `git diff --cached --check` | Passed before content commit |
| Atlas `python3 tools/check_engineering_content.py check` | 176 reviewed Atlas files checked; this reads the unchanged KB allowlist, not app semantics |
| Atlas identity guard with command-scoped approved author/committer | Passed; global/local configuration and credentials left unchanged |

The required app `npm ci` and `npm run check` are unrun: this pinned foundation
commit contains only contracts/docs and no package manifest, lockfile or scripts.
No compiler/typecheck/build success is claimed from Node's type stripping.
The integrator must run combined checks against the final scaffold/settings,
including JSON import attributes and TypeScript extension resolution.

No browser app exists at this task's pinned base. Browser/microphone/physical
mobile, paid provider, live speech/pronunciation, actual hint-generation/semantic
guard and independent educational review were not run. No mocked transport was
executed. Authored input/expected-output fixtures are specifications, not real
or mocked speech evidence. No image asset or rights approval is claimed.

New prose and metadata are English; Spanish prompt/context/meaning/sound-guide
strings and adversarial fixtures are intentional teaching/localization data.
IPA is deliberate Unicode educational notation. The source/access and
linguistic-review limits are in [SOURCES.md](SOURCES.md).

The CLI GitHub API initially returned `Forbidden`, but the existing connected
GitHub app successfully read repository metadata, so publication can use that
authorized path without changing credentials or security. Main did not exist at
inspection; a draft PR can stack on the foundation branch. No merge, deployment
or paid provider call is authorized/executed. Publication status and remote
checks are returned after the immutable commit is created.
