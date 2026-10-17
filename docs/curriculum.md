# EN-WP-03 curriculum integration

## EN-WP-08 eight-tense extension

The feature candidate adds past simple, past continuous, past perfect and past
perfect continuous alongside all four present tenses. Existing 17 prompts and
their alternatives remain; 16 new prompts bring the total to 33, with independent
difficulty axes and affirmative/negative/question coverage for each new tense.
Each prompt supplies visible past-time context and an open-set meaning rubric.
Regular and irregular constructions include did + base, was/were + -ing,
had + past participle and had been + -ing; explanation assesses the actual
accepted response, including contractions and valid alternative wording.

`TENSES` and `Tense` cover eight; `PRESENT_TENSES`/`PresentTense` remain compatible
exports. `sentenceTense` selects all eight or one tense and defaults to all for
older version-one preferences. Matching uses accepted alternative metadata,
so either residence construction remains selectable. Selection does not impose
a closed translation whitelist. Unsupported difficulty/tense cells stay explicit.
Changes apply at Next/Skip and preserve current identity, evidence, hints and stage.

Both verb modes retain ten/nine existing obligations, exact25 and spelling
variants. They receive 98 additional contextual past-tense teaching examples
through `tenseExamples`, plus a generic eight-tense reference guide. A progressive
derivative belongs to the base family; `had been buying` does not prove the
lexical participle `bought`. Past-family examples require a finite past form;
participle examples require a complete construction with the lexical participle.
Do not force progressive stative readings: be's location examples remain simple/
perfect, while the provider considers contextually valid dynamic uses separately.
Examples are model context, not prefilled responses or learner evidence.

The authored oracle set grows from 69 to 98. Integrity/mutation tests check
coverage, references and required error cases; they are not an NLP grammar
classifier. Provider instructions, protocol/state regressions and actual Chromium
with injected verdicts verify integration without paid calls. Real acoustic,
linguistic/device acceptance, Phoenix readback and deployment remain deferred.

## Original integration checkpoint

The [authored reference package](../content/en-wp-03/README.md) owns standalone
data, source notes, assessment specifications, no-spoiler policy and authored
evaluation fixtures. Its proposed content shape is independent of the UI.
`src/content/index.ts` adapts it to the shared version-1 contracts inspected at
EN-WP-01 foundation `aff7aabe8b755090924fca176ffeb82ff5dbe384`; its complete
scaffold at `fd1678b93b3a55166fd8492bea307e6191e9a7dd` is now additively merged
and the content compiles against the unchanged compiler settings.

Exports: `VERBS: readonly VerbEntry[]`, `SENTENCES: readonly SentenceEntry[]`,
`pickNextVerb(previous?: VerbId, random?: () => number): VerbEntry`, and
`VERB_CUE_BRIEFS` for asset work. Random selection is uniform over eligible
verbs, excludes an immediate repeat and rejects invalid injected samples. It
does not claim a long-term coverage/repetition policy. Sentence vocabulary is
not restricted to the exact25 irregular-practice inventory.

All base/past/participle alternatives survive adaptation. The shared contract
has one IPA/Spanish-guide string per family, so alternative-specific guidance
is labelled and combined. Full reference records retain individual phonetics.
The shared sentence text includes its Spanish context so assessment cannot rely
on context hidden from learners. Accepted alternatives retain their actual
tense and explanation; the shared explanation rubric asks about that actual
construction. The independent `primary_tense` never acts as an exclusive answer.
Grammar and vocabulary levels map independently to the shared 1–3 values.

Each `image.src` is now `/images/verbs/{id}.svg`, pointing to an original local
scene with no printed English target word/form or tense. Spanish accessible
alt combines its nonvisual description and context. `VERB_CUE_BRIEFS` exposes
`context_es` and `ambiguous`; show the context beside images marked ambiguous
(abstract or directional meanings) and clarify alternate learner readings.
Keep supplied cue information separate from learner-produced oral evidence.
All 25 SVGs and their ledger checksums are verified. The [asset strategy](../content/en-wp-03/ASSETS.md)
records provenance and the remaining independent comprehension review.

Runtime hints remain model-generated. `hintSeeds` are only semantic intents.
Never display/speak private alternatives or examples before the appropriate
stage. Apply the [hint policy](../content/en-wp-03/hint-policy.json) to generation
and semantic output guarding. Authored oracle cases are not bundled by the
adapter and do not establish runtime model compliance.

Validate with Python and the installed foundation's locked Node toolchain:

```sh
python3 content/en-wp-03/check_content.py
python3 -m unittest discover -s content/en-wp-03/tests -v
node --import tsx --test tests/content.test.ts
npm run check
# With dev and production preview already running on these loopback ports:
node content/en-wp-03/check_assets_browser.cjs 5193 4193
```

The asset amendment fixes extensionful test imports and replaces the example
record cast with explicit typed family fields. Existing bundler resolution and
JSON import attributes compile without compiler-setting changes. The combined
checks now pass. No shared settings, manifests, routing, contracts or global
styles were authored/changed by this task; their updates came from the additive
foundation merge. Prior published evidence remains in VALIDATION.md and the
new current receipt is VALIDATION-ASSETS.md.
