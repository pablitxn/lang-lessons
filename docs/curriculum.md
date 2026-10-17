# EN-WP-03 curriculum integration

## EN-WP-08 eight-tense extension

The curriculum includes past simple, past continuous, past perfect and past
perfect continuous alongside all four present tenses. Existing 17 prompts and
their alternatives remain; 16 new prompts bring the total to 33, with independent
difficulty axes and affirmative/negative/question coverage for each new tense.
Each prompt supplies its past-time reference within the Spanish sentence and an
open-set meaning rubric; the separate authoring context is not shown or required.
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
through `tenseExamples`, plus a generic eight-tense reference guide. Verb reference
rows describe auxiliary roles without revealing the requested forms of be/do;
the full sentence guide is available after translation acceptance. A progressive
derivative belongs to the base family; `had been buying` does not prove the
lexical participle `bought`. Past-family examples require a finite past form;
participle examples require a complete construction with the lexical participle.
Do not force progressive stative readings: be's location examples remain simple/
perfect, while the provider considers contextually valid dynamic uses separately.
Examples are model context, not prefilled responses or learner evidence.

The authored oracle set contains 99 cases, including both past residence readings. Integrity/mutation tests check
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
is labelled and combined. Each reference form includes `sound_spelling_es`, an
authored Spanish-readable approximation (for example, `delt` for `/dɛlt/`).
The sound-help panel displays IPA and this approximation, without articulatory
instructions. These spellings are memory aids, not pronunciation assessments;
IPA and valid accent alternatives remain authoritative. Full reference records
retain individual phonetics and articulation notes.
The shared sentence text contains only the Spanish sentence. Reference context
remains authoring metadata; assessment must accept plausible readings without
requiring unstated context. Omitted subjects permit any pronoun compatible with
the Spanish conjugation and English agreement. The past residence question
accepts both simple and continuous readings, and the trench-duration prompt
does not assert whether the trench was completed. Accepted alternatives retain their actual
tense and explanation; the shared explanation rubric asks about that actual
construction. The independent `primary_tense` never acts as an exclusive answer.
Grammar and vocabulary levels map independently to the shared 1–3 values.

Each `image.src` resolves to a locally served, reviewed real photograph. The
[photo ledger](../content/en-wp-03/asset-ledger.json) supports one or more assets
per verb, with independent Spanish descriptions, contextual cues and provenance.
`VERB_PHOTOS`, `photosForVerb` and `pickVerbPhoto` expose the collections;
`pickNextVerb` selects one photo when creating the exercise. The shared
single-image `VerbEntry` contract stays compatible. Rerenders, spelling edits,
preferences and helper toggles do not choose another photo or replace evidence.
Ambiguous scenes show their selected photo's Spanish context. Supplied cues
are never learner-produced oral evidence. An information icon exposes the nonvisual cue on hover, keyboard focus or tap;
reading it holds automatic advancement. Credits/source/licenses remain in the
photo ledger rather than the exercise UI. The [image policy](../content/en-wp-03/ASSETS.md)
requires real photographs for future additions and describes source review.
The former SVG scenes and their generator have been removed from active content;
historical validation receipts describe the earlier implementation only.

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

The historical SVG asset amendment fixed extensionful test imports and replaces the example
record cast with explicit typed family fields. Existing bundler resolution and
JSON import attributes compile without compiler-setting changes. The combined
checks now pass. No shared settings, manifests, routing, contracts or global
styles were authored/changed by this task; their updates came from the additive
foundation merge. Prior published evidence remains in VALIDATION.md and the
new current receipt is VALIDATION-ASSETS.md.
