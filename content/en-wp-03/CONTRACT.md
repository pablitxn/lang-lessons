# Proposed content contract, revision en-wp-03/1

## EN-WP-08 compatible extensions

`scope`, `primary_tense` and example `tense` now accept the four past values
alongside the four present values, using the existing underscore JSON spelling.
New sentence records include `sentence_form` for affirmative/negative/question
coverage. Verb records add `tense_examples` with `tense`, form `family`, `text`
and contextual `explanation`. The adapter exposes these as optional typed
`tenseExamples`; legacy three-family examples and all existing IDs are preserved.
Shared types use hyphenated `Tense`, while `PresentTense` remains compatible.
The additive version-one preference `sentenceTense` selects a next-prompt pool;
it does not change evidence identity or make alternatives a closed whitelist.

## Original package contract

This local content format is a proposal. EN-WP-01 owns the shared schema;
the thin adapter maps these records to its version-1 schema at foundation
`aff7aabe8b755090924fca176ffeb82ff5dbe384` without adding shared app types here. Stable
content IDs are separate from transient exercise, attempt and evidence IDs.
Files are UTF-8 JSON objects with a `schema_version` and `authorship` tag.
No model-generated runtime hints are stored as authored curriculum.

| File | Record shape and invariants |
| --- | --- |
| verbs.json | `inventory_id`, `phonetic_reference`, `sound_guides_es`, `verbs[]`; exactly 25 unique ordered `verb-{lemma}` IDs |
| verb | `lemma`, `inventory_order`, `meanings_es[]`, `cue_sense`, `forms.{base,past,participle}[]`, `sentence_examples[]`, `image_cue`, `notes[]`, `source_refs[]` |
| form | `text`, slash-delimited broad `ipa`, short Spanish-readable `sound_spelling_es`, reference `sound_guide_refs[]` and `sound_note_es`; each alternative is independently accepted in its slot |
| sentence example | `family` base/past/participle, `text`, `construction`; examples demonstrate grammar, not originality or an answer whitelist |
| image cue | `brief`, Spanish `alt`/`nonvisual_cue_es`, `context_es`, `ambiguous`, `asset_status: reviewed-real-photograph`, local `file`/`src`, attribution/creator and `avoid[]` |
| asset-ledger.json | `schema_version: en-wp-03/assets/2`, curated photo provenance, one or more unique asset IDs for each of the 25 content IDs, per-photo context, local JPEG paths, SHA-256, source/creator/license and review status |
| sentences.json | four `scope` values, local `difficulty_scale`, `sentences[]`; stable `sentence-{slug}` IDs |
| sentence | `primary_tense`, `difficulty.{grammar,vocabulary}`, `prompt_es`, `context_es`, `accepted_examples[]`, `acceptance_policy: semantic-open-set`, `meaning_requirements[]`, `post_acceptance[]`, `hint_intents[]`, `source_refs[]` |
| accepted example | `text`, `tense`, `structure`, `meaning`; attach follow-up to the tense actually used, even when it differs from `primary_tense` |
| evaluation fixture | `id`, `area`, `content_ref`, `input`, `expected.{decision,reason}` and optional preservation/prohibition assertions; authored oracle, not model output |

`primary_tense` supports coverage/planning, never rejects a valid alternative.
Difficulty integers 1–3 are local proposed categories, not CEFR claims or global
enums. Grammar levels describe affirmative/negative/question structure;
vocabulary levels describe everyday/general/domain language. Select each
dimension separately; do not derive either from tense. Authoring spans paired
items with the same grammar and different vocabulary, and vice versa. Adaptive
progression thresholds and learner-level mapping still need calibration.

## Evaluation semantics

The fixture decisions describe educational outcomes. They do not prescribe
global application enums: map accept/incorrect/incomplete/clarify/ignore to the
architect's evidence contract; allow/block belong to hint-output inspection.

For spelling, trim surrounding whitespace and normalize case for comparison of
English forms; preserve the raw input for feedback. Never equate different
letters, strip suffixes, or autocorrect to an accepted answer. An isolated be
past slot can accept was or were; agreement belongs to the sentence obligation.
Slash-separated alternatives in teaching displays are not a new required input
syntax. Accept one valid variant in each slot. Burned/burnt and dreamed/dreamt
may be mixed across past and participle slots.

For oral meaning, accept an accurate Spanish paraphrase of a legitimate sense.
Do not require exact dictionary wording. If it differs from the pictured sense,
ask about the intended meaning and explain the cue; do not label the valid sense
non-English. Be, beat, deal, draw and dream need particular context sensitivity.
An image cues a lemma/sense, never a tense.

The photo ledger owns all real photographs; generated scenes are prohibited. Ambiguous,
abstract and directional meanings carry an explicit `ambiguous` flag and
Spanish contextual cue. Consumers obtain the selected photo metadata from `VERB_PHOTOS`; `VERB_CUE_BRIEFS` retains the primary cue for compatibility. The
shared `image.alt` also combines the nonvisual description and context. Display
the contextual cue with ambiguous images and accept discussion of alternative
readings. Context/alt text are supplied prompts, not learner evidence. No
printed English target word, form or tense appears in the photographs.

For the three original learner sentences, assess a complete, meaningful clause
using the requested family: normal finite present agreement, finite past, and a
complete participle construction such as a perfect or passive. A token match
does not prove grammatical role. Accept `he buys`, `she does`, `she is` and
other ordinary inflection. `He bought bread` is valid past English but does not
satisfy the participle obligation; `He has bought bread` does. A bare participle
is insufficient. A complete adjective/passive-ambiguous construction needs
context before a verbal-participle decision. No supplied example proves a
learner has created an original sentence; copied scripts are not the goal.

For translation, first evaluate intended meaning, time reference, agreement and
complete structure in the supplied prompt **and learner-visible context**.
Valid alternate wording, natural contractions, adjunct placement and synonymous
verbs are allowed. Unlisted responses require evaluation, not default rejection.
If grammatical English changes a specified meaning, explain that mismatch;
if context is insufficient, clarify without a confident error label.

Both `We have lived here since 2020` and `We have been living here since 2020`
fit the residence prompt. The former can describe a continuing situation; the
latter can emphasize duration/activity. Neither implies residence has ended,
and continuous does not necessarily mean temporary. Ask for the tense actually
used, then structure and meaning/contextual fit. A correct translation stays
accepted when its later explanation is wrong or incomplete. A correct tense
label alone does not complete the explanation obligations.

Do not infer tense from `-ing`, `-ed` or ongoingness alone. Present perfect
continuous can also describe a recently stopped activity with current evidence.
Stative/dynamic readings and dialect choices require context; the supported
teaching scope is not a universal ban on grammatical constructions outside it.
If a valid response uses a construction outside the current practice scope,
acknowledge it and request a scoped reformulation without calling it bad grammar.

## Speech and evidence boundary

The IPA is a teaching reference, not an accent whitelist or acoustic score.
Accept intelligible accent variants, contractions, reductions and linked speech.
Do not insist on isolated words. Transcripts alone cannot prove pronunciation,
editable spelling, originality, or which reduced auxiliary was audible.
Audio assessment must return calibrated uncertainty; no hard confidence threshold
is invented here. Ambiguous form/negation/auxiliary recognition requires neutral
clarification. No error, success, new phonetic-help eligibility, hint escalation
or completion follows from uncertainty. Preserve existing accepted evidence.

Evidence needs the architect's exercise/attempt identity and current-input
correlation. One clear utterance can supply several independent obligations in
any order. An old result cannot satisfy a new exercise; provider failures cannot
become a learner error. Typed spelling remains distinct from oral evidence.
Both irregular modes require all oral gates and the correct editable fields,
then a cancellable natural pause that does not interrupt questions/speech.
No exact timings are proposed here. In-call helpers preserve stage/progress.
Sentence-mode automatic advancement/pause remains undecided.

## Hint and disclosure boundary

The authored hint policy supplies constraints and semantic intents; the model
must generate attempt-specific runtime hints. Pre-acceptance includes pending,
processing, uncertain and incorrect translations. No tense name, formula,
auxiliary chain, answer fragment, cloze, close paraphrase, acrostic or encoded
answer may expose the active target. Increasing hint depth is not permission
to disclose. Avoid repeating a question that effectively selects one tense
when several are valid. Guard semantic implications as well as text matches.

After translation acceptance, elicit the learner's explanation before supplying
diagnostic teaching unless they explicitly request help. Hint evaluation and
private accepted examples must be separated from the learner presentation and
generation inputs. Rejected generated output is never shown. On guard doubt,
regenerate or use a reviewed neutral fallback. Maximum-depth coaching offers
retry/skip/change, or explicitly ends the assessed attempt before a solution.
This policy needs model-level adversarial evaluation; static checks cannot
establish reliable runtime compliance.
