# EN-WP-03: authored curriculum and evaluation fixtures

Owner: EN-WP-03 curriculum executor. Owned paths: `content/en-wp-03/**`,
`src/content/**`, `public/images/verbs/**`, `docs/curriculum.md`, and `tests/content.test.ts`.
Status: framework-independent authored data with a thin adapter to the published
EN-WP-01 contracts, plus 25 original repository-native SVG illustrations, ready
for educational review. No shared application types, routing, manifests, runtime
provider or audio recordings are edited by this package.

The active dispatch in conversation `01a118ed-6bf7-7481-93e6-336de48270f7`
authorizes this work and supersedes Atlas's historical dispatch-pending status.
Product requirements remain EN-D01–D14 at Atlas main
`62dcbe9079eb6c447a00786405fb7976dc94e92c`. No canonical Atlas file is edited.

| Deliverable | Purpose |
| --- | --- |
| [verbs.json](verbs.json) | Exact ordered 25-verb inventory, all three forms, variants, Spanish meanings, broad IPA, Spanish sound guides, 75 grammatical examples and 25 image briefs |
| [sentences.json](sentences.json) | 17 Spanish prompts/context records across four present tenses, accepted examples and explanations, independent grammar/vocabulary dimensions |
| [hint-policy.json](hint-policy.json) | Stage-aware constraints for future model-generated coaching |
| [evaluation-fixtures.json](evaluation-fixtures.json) | Authored positive, negative, partial, uncertain and adversarial expected outcomes |
| [CONTRACT.md](CONTRACT.md) | Proposed portable data shape and assessment semantics |
| [ASSETS.md](ASSETS.md) | Rights-safe cue strategy and accessibility boundary |
| [asset-ledger.json](asset-ledger.json) | Original asset provenance and all 25 SVG checksums |
| [COVERAGE.md](COVERAGE.md) | Requirement and inventory coverage; execution limits |
| [SOURCES.md](SOURCES.md) | Source provenance, access limits and review status |
| [INTEGRATION-INTAKE.md](INTEGRATION-INTAKE.md) | Architect and final Atlas integrator handoff |
| [Typed adapter](../../src/content/index.ts) | Shared-contract exports and injectable exact25 selection |
| [VALIDATION.md](VALIDATION.md) | Pinned base, executed checks and real-versus-authored evidence limits |
| [VALIDATION-ASSETS.md](VALIDATION-ASSETS.md) | Follow-up receipt: complete assets, combined build and browser evidence |

Run integrity checks with Python 3 standard library, and adapter tests from the
repository after the foundation's locked dependency installation:

```sh
python3 /workspace/lang-lessons/content/en-wp-03/check_content.py
python3 -m unittest discover -s /workspace/lang-lessons/content/en-wp-03/tests -v
node --import tsx --test tests/content.test.ts
npm run check
```

These commands validate content integrity, coverage and authored oracle
consistency. They do not run a grammar evaluator, speech recognizer, hint model,
semantic learner assessment. No mocked recognizer is passed off as real speech.
The separate browser check in VALIDATION-ASSETS.md verifies actual local image
loads/rendering; it does not establish educational recognition or real audio.

Spanish strings and IPA are deliberate learning content/fixtures. Technical
prose, identifiers, test names and commit/PR metadata are English. The verb set
restricts irregular/random practice; sentence vocabulary may include other
verbs such as live and sleep. Accepted examples are an open-set teaching aid,
not an exhaustive translation whitelist or learner sentence scripts.
