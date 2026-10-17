# EN-WP-08 four-past-tense implementation evidence

Date: 2026-10-17. Repository: pablitxn/lang-lessons. Branch:
`feat/en-wp-08-past-tenses`. Base: `58658440109c7344a40d67e17dad6cb3cae7f720`.
Tested code/contract/content/test/browser-script revision:
`fc59af336ea21cbf693fa7aed209fc49b6472e28`. A follow-up commit contains only
this report, screenshots and the coordinator handoff; executable sources remain
identical. The draft PR records the final published head and current remote base.

## Mandate and implementation

Pablo's explicit instruction to add the four new past tenses, relayed in source
thread `01a118ed-6bf7-7481-93e6-336de48270f7`, activates EN-D15 / EN-WP-08 after
the prerequisite app PR9 and Atlas PR19 merges. This task implements and publishes
a draft only; it does not merge the feature, operate the Mac, deploy, use provider
credentials or make paid calls. The later scope clarification explicitly defers
real provider/device acceptance, Phoenix readback and deployment without blocking
this feature. The separate Cloud Tailscale documentation task was untouched.

Delivered: past simple, past continuous, past perfect and past perfect continuous
alongside all present tenses. Preferences selects all eight or one sentence tense.
Independent grammar/vocabulary and old version-one storage migrate safely;
selection affects the next prompt, preserving current accepted work and session.
Empty pools remain explicit with no silent fallback. All 17 original present
prompt records and their alternatives were compared against base and preserved.

Sixteen new Spanish prompts provide natural past reference contexts, affirmative/
negative/question coverage, regular/irregular forms and open-set rubrics. Totals:
33 prompts, 56 accepted translation examples, 98 authored oracle cases. Both verb
modes receive 98 contextual past examples and a generic eight-tense guide, keeping
exact25, spelling variants, the 75 original examples, images and nine/ten gates.

Past progressive derivatives belong to the base family; they do not prove the
lexical participle. Provider instructions distinguish did + base, was/were + -ing,
had + lexical participle and had been + -ing, temporal reference and stative uses.
The sentence guide remains meaning-only before translation acceptance. The
original staged evidence, uncertainty, no-spoiler envelopes and stale-attempt
boundaries remain in force. A tense preference filters prompt selection, not
otherwise valid learner wording or alternate constructions.

## Executed checks

Saved Cloud environment: Node 24.19.0, npm 11.9.0, Python 3.12.14; supplied
Playwright and desktop Chromium. Vite alone served loopback port 5187. The real
voice broker and external collector smoke were not started.

| Command | Result on frozen candidate |
| --- | --- |
| `npm ci --cache /tmp/lang-lessons-npm-cache` | PASS; manifest/lockfile unchanged |
| `npm run check` | PASS; 180 Node tests total, 177 pass, zero fail, three optional browser-suite skips; 25 Python tests, content integrity, strict TypeScript and Vite build |
| `npm run test:browser -- 5187` | PASS; 4 shell viewport cases (320x640, 390x844, 844x390, 1024x768) |
| `node scripts/smoke-practice.cjs 5187` | PASS; 12 mode/viewport cases plus 8 failure/cancellation/release checks |
| `UX_BROWSER=1 SENTENCES_BROWSER=1 VERBS_BROWSER=1 node --import tsx --test tests/ux-browser.test.ts tests/sentences-browser.test.ts tests/verbs-browser.test.ts` | PASS; all 3 suites, zero skips, 16 viewport/mode cases |
| `node scripts/smoke-past-tenses.cjs 5187` | PASS; all 8 tenses at 320x640, 390x844 and 1024x768 (24 staged cases), plus both verb-mode reference cases |
| Base-data preservation comparison | PASS; original 17 present prompt records, exact25 forms/variants, 75 examples and cue metadata preserved |
| `git diff --check` and effective identity guard | PASS; new commits use Pablo Coronel <git@pablocoronel.com> in both local roles |

New regressions cover legacy preference migration/invalid values, independent
selection and no fallback, all past-tense staged flows, uncertainty, safe hint
replacement, partial explanation correction, manual/held continuation, mid-stage
selection, old-result rejection and completed work with an empty requested pool.
Protocol tests inspect actual submitted context and accepted-translation routing
for each past tense and both verb modes. Content mutations detect removed past
coverage, missing question/negative cases, wrong form-family attribution and
corrupted auxiliary-error oracles.

Earlier authoring runs found an unused test import and an assertion that compared
raw multiline context against JSON-escaped task data. Both test-authoring issues
were corrected before the frozen revision. Final full/optional/browser commands
passed; no failed result is included in the final pass counts.

## Screenshots and evidence boundaries

Screenshots are actual production UI rendering with injected media and explicit
provider verdicts. They show layout and state integration, not actual acoustic
or linguistic success. The guide is shown only after a simulated translation
acceptance. The screenshots/receipt are committed durable artifacts; temporary
raw logs below remain Cloud-local and are not a hosted or indefinite archive.
Preferences and the explanation guide were visually inspected in this task.

- [Mobile selection](en-wp-08-past-tenses-2026-10-17/preferences-past-perfect-continuous.png)
- [Past perfect continuous prompt](en-wp-08-past-tenses-2026-10-17/sentence-past-perfect-continuous.png)
- [Eight-tense explanation guide](en-wp-08-past-tenses-2026-10-17/sentence-eight-tense-guide.png)
- [Image-verb guide](en-wp-08-past-tenses-2026-10-17/verb-image-past-guide.png)
- [Visible-verb guide](en-wp-08-past-tenses-2026-10-17/verb-visible-past-guide.png)

All browser helpers reported no page errors/external requests. Transport is
intercepted and injected, optional feature fixtures are labelled, and authored
oracle expectations are not a runtime grammar classifier. No paid provider,
physical microphone/device, independent linguistic acceptance, authenticated
Phoenix readback, deployment or security/credential setting was exercised or
marked complete. These are deferred acceptance work, not blockers for this PR.
Hosted check status is returned separately after draft publication.

The [coordinator handoff](../atlas-intake-en-wp-08.md) prepares the existing Atlas
source/minutes/decision/backlog flow and Notion records. No Atlas/Notion mutation,
duplicate feature/recovery task or main merge is performed by this feature task.

## Artifact integrity

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `docs/evidence/en-wp-08-past-tenses-2026-10-17/preferences-past-perfect-continuous.png` | 49285 | `f5839271b49da7d88bd4c1816a2ee53a7d47bb753466144e24faa5eb0010f3ca` |
| `docs/evidence/en-wp-08-past-tenses-2026-10-17/sentence-past-perfect-continuous.png` | 58330 | `7c969285824483717fe6cc2320fccf744308bdbbeb788982402a8fcf7c5b717e` |
| `docs/evidence/en-wp-08-past-tenses-2026-10-17/sentence-eight-tense-guide.png` | 115626 | `93bab51dc59cdf0c4537c5699f4938ad71d34b451e3894affcf6965c0e5e8f89` |
| `docs/evidence/en-wp-08-past-tenses-2026-10-17/verb-image-past-guide.png` | 75595 | `c3264b3f0a60c12f8d8ba268a661b4e78bff4f518732cc6e61cd747698345186` |
| `docs/evidence/en-wp-08-past-tenses-2026-10-17/verb-visible-past-guide.png` | 65191 | `f5e6ae7e4c2ed399ea13c362720db6aa73ae5b75e3f6df6823b2b9dcd2b8e07e` |
| `/tmp/en-wp08-install.log` | 25 | `ae259122688c6b0d5cdda1ab1e413c12deda2a0464692fddcedf827e5f8da9dc` |
| `/tmp/en-wp08-check-fc59af3.log` | 20459 | `38692fc2ec4d7c4a48ef247564d3e26eb4be116c3e446ad6e8e40afb0e7c17c6` |
| `/tmp/en-wp08-shell-final.log` | 2307 | `8447eda41af4f8ab3d3bef5b1defc138535688737047b7a2af5b51b3666754d8` |
| `/tmp/en-wp08-practice-final.log` | 5395 | `d77a54cadbb48a29f75567c88e3403cb43ef36688454e6cb47cc7474c4366fc8` |
| `/tmp/en-wp08-fixtures-final.log` | 4852 | `bbcd49a324a34c232665b06f226343950872ed0a933c1e583bd4ae69994ce416` |
| `/tmp/en-wp08-browser-final.log` | 8320 | `b5d4f527758c5119de5a28dc0cffdc856d93a173020a731c0bf3b13977b3e45c` |
