# English Wiktionary snapshot

The dictionary text and its selection in `wiktionary.snapshot.json` are by
**English Wiktionary contributors**, redistributed under **Creative Commons
Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**:
https://creativecommons.org/licenses/by-sa/4.0/
Legal code: https://creativecommons.org/licenses/by-sa/4.0/legalcode.en

This content notice applies to the attributed dictionary material, not a change
to the license of the surrounding application code. Keep this notice, the source
links, attribution and modification notice with copies or adaptations of the
snapshot. Adapted dictionary content is offered under CC BY-SA 4.0. Wiktionary
and its contributors do not endorse this application.

## Source verification and changes

Retrieved October 18, 2026 directly from the English section of each linked
Wiktionary entry. Each record carries the observed permanent revision URL,
current entry URL, contributor-history URL, selected source excerpts and SHA-256
of its `content` object (UTF-8, compact JSON, insertion order preserved).

Reviewed licensing sources:
- Wikimedia Foundation Terms of Use, section 7 (licensing, attribution by links,
  modification notices and exceptions):
  https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content
- Wiktionary's copyright guidance (also identifies third-party quotation exceptions):
  https://en.wiktionary.org/wiki/Wiktionary:Copyrights
- CC BY-SA 4.0 deed and legal code linked above.

The page text extractor did not expose entry footers; licensing relies on the
Wikimedia text-reuse terms and the Wiktionary guidance, not an inferred license
from a third-party dump. No Kaikki data, dictionary API, paid account, media,
recordings or third-party cited quotation was imported. Each selected definition
and example was read in its English verb context. No additional source notice was
visible on the selected passages. Only uncredited contributor usage examples were
selected; cited passages from books, newspapers, television or songs are excluded,
including apparently old/public-domain quotations (no separate rights assumption).

Modifications: one relevant English verb sense and one pronunciation line selected
per lemma; link markup and numeric list markers removed; display whitespace
normalized. Grammatical qualifiers and dating retained. Other senses, phonetic
variants, etymologies and translations omitted. Definitions and examples are
**not generated, paraphrased or translated**. Regional/form labels reproduce the
selected source labels; unspecified regions remain recorded in the snapshot but
are omitted from the exercise display.

Coverage: **25/25 exact curriculum verbs** have a sourced English verb definition,
part of speech and phonemic IPA; **24/25** have a contributor usage example.
The selected “bleed” example gives medical instructions and is deliberately omitted;
the card omits the example block when no reviewed example is available. This is a
limited learning snapshot, not a comprehensive dictionary or a live-updating service. Sense choices
follow existing photo cues (e.g. beat/mix food, catch/intercept a ball, deal/cards,
draw/depict). Spelling guidance and the photo ledger are unchanged.

Preferences > Credits lists each exact entry revision, links the license, describes
the changes and offers the attributed JSON as a downloadable asset. The exercise
card presents the reviewed content without repeated source links. No runtime
dictionary request or generation occurs.

## Maintenance and integration

Producer base: PR19 `660f55764df7ed3c24615b8959b1604f0f9ac697`.
Owned boundary: `getPictureDictionaryEntry(context.verb.id)` is called only inside
the existing written-completion card branch. The current exercise identity and
manual Next callback are unchanged; no scheduler, controller or root edits.

To update, review the English verb sense and its example context in the exact
source revision, reject quoted third-party examples, preserve source and license
notices, update the observation date and content hash, and run the P5 tests plus
`npm run check`. Never fill an absent field by generation. No automated refresh
is configured. Publication/merging belongs to the sole integration writer.

Validation on this producer: `npm ci --cache /tmp/p5-npm-cache`; `npm run check`
(348 Node passes, 55 environment/opt-in skips, 26 content/Python passes, strict
TypeScript/Vite build); all 39 P5 tests with `P5_BROWSER=1`; repository browser
smoke at 320×640, 390×844, 844×390 and 1024×768. Chromium tests use mocked transport
and disabled broker, verify no external runtime requests, and cover dictionary
absence before all three correct forms, removal on edit, attributed snapshot
asset, source/license links and explicit Next without oral completion. No real
voice/device/account/provider acceptance is implied. Existing chunk-size warning
remains (651.21 kB before gzip); downloadable dictionary JSON is 31.59 kB.
