# EN-WP-03 curriculum integration

The [authored reference package](../content/en-wp-03/README.md) owns standalone
data, source notes, assessment specifications, no-spoiler policy and authored
evaluation fixtures. Its proposed content shape is independent of the UI.
`src/content/index.ts` adapts it to the shared version-1 contracts inspected at
EN-WP-01 foundation `aff7aabe8b755090924fca176ffeb82ff5dbe384`.

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

`image.src` is the empty string: a required string cannot express a pending
asset more accurately. No image file is claimed. Consumers must check for this
gap, avoid rendering an empty-src image, and offer visible-base/accessibility
fallback until EN-WP-01/02 coordinate actual assets. A descriptive alt can reveal
the verb; do not silently score it as hidden-image identification. The 25
[briefs and rights strategy](../content/en-wp-03/ASSETS.md) remain asset inputs.
This is an explicit image-mode integration blocker, not a production-ready cue.

Runtime hints remain model-generated. `hintSeeds` are only semantic intents.
Never display/speak private alternatives or examples before the appropriate
stage. Apply the [hint policy](../content/en-wp-03/hint-policy.json) to generation
and semantic output guarding. Authored oracle cases are not bundled by the
adapter and do not establish runtime model compliance.

Validate independently with Python and with Node 24's native TypeScript test
support (no package installation required):

```sh
python3 content/en-wp-03/check_content.py
python3 -m unittest discover -s content/en-wp-03/tests -v
node --test tests/content.test.ts
```

Foundation's package manifests/scripts were not present at the inspected
contract commit; `npm ci` / `npm run check` cannot run there yet. The integration
owner must run its combined TypeScript/build/tests once available, including
JSON-module and TypeScript-extension compiler options. No shared settings,
manifests, routing, contracts or global styles were changed by this task.
