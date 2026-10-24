# French curriculum for Spanish-speaking learners

This pack adds French to the existing three lesson modes. It has 25 useful
third-group/irregular verbs and 54 sentence prompts: all nine independently
selectable grammar/vocabulary pairs for each of six constructions. These local
levels describe task complexity, not CEFR certification.

## Pedagogical contract

French verb practice requests **infinitive**, **present for je/j’ without the
pronoun**, and **past participle in masculine singular**. These are French form
categories, not a translation of English base/past/participle. The reference
includes all six present persons, the auxiliary, pronunciation guidance,
Spanish meanings, agreement notes and six contextual tense examples with Spanish
translations. A sentence using an infinitive must be a complete natural
construction, not an infinitive misidentified as a tense. A participle sentence
must include the appropriate finite construction.

The six sentence constructions are présent, passé composé, imparfait, futur
proche, futur simple and conditionnel présent. The conditional is named as a
French construction with its own uses; the pack does not equate them mechanically with English form families. The course introduces affirmative clauses,
negation/questions, agreement, pronouns, and subordinate clauses while keeping
vocabulary selection independent. Authored translations are examples, not an
exhaustive whitelist of valid oral answers.

The inventory is: être, avoir, aller, faire, dire, pouvoir, vouloir, devoir,
savoir, voir, venir, tenir, prendre, mettre, lire, écrire, boire, ouvrir, offrir,
courir, partir, sortir, dormir, recevoir and connaître. The rectified spelling
connaitre is also accepted in the infinitive field. Sortir explicitly teaches
être for intransitive movement and avoir for taking an object out. Être itself
uses avoir in the passé composé. IPA and Spanish sound guides are teaching aids;
they cannot establish pronunciation correctness without audio.

## Source and authorship record

The exercises, Spanish explanations, sound guides and translations were authored
for Lang Lessons. They are not copied dictionary example quotations. French meanings and infinitive IPA were cross-checked against the corresponding
French Wiktionnaire entries. The authored paradigms and examples also received
an independent curriculum review. On 2026-10-24 the MediaWiki API returned all 25 live
revision IDs and wikitext; the pinned URLs, selected source excerpts and content
hashes are in
[`french.snapshot.json`](../../src/features/verbs/dictionary/french.snapshot.json).
Raw external pages, audio and third-party photographs from those pages are not
redistributed.

Grammar reference checks include the Office québécois de la langue française:

- [Être conjugation](https://vitrinelinguistique.oqlf.gouv.qc.ca/24656/la-grammaire/le-verbe/conjugaison/conjugaison-du-verbe-etre)
- [Avoir conjugation](https://vitrinelinguistique.oqlf.gouv.qc.ca/24657/la-grammaire/le-verbe/conjugaison/conjugaison-du-verbe-avoir)
- [Passé composé](https://vitrinelinguistique.oqlf.gouv.qc.ca/24218/la-grammaire/le-verbe/temps-grammaticaux/passe/generalites-sur-le-passe-compose)
- [Participle agreement with être](https://vitrinelinguistique.oqlf.gouv.qc.ca/21547/la-grammaire/le-verbe/accord-du-participe-passe/avec-lauxiliaire-etre/accord-du-participe-passe-employe-avec-lauxiliaire-etre)
- [Simple and compound forms](https://vitrinelinguistique.oqlf.gouv.qc.ca/24658/la-grammaire/le-verbe/temps-grammaticaux/temps-simples-et-temps-composes)

The dictionary's selected definitions are Spanish adaptations of Wiktionnaire
under CC BY-SA 4.0. Each original course example has separate attribution in the
adapter, so it is never presented as a Wiktionnaire quotation. Definitions are
not exhaustive. The original English snapshot is unchanged.

## Real photograph reuse

[`asset-ledger.json`](asset-ledger.json) maps every French verb to three real local
photographs already reviewed and shipped with English. It preserves the source
asset ID, exact file bytes, source/download/license URLs, creator, attribution,
original review date and transformations. No generated image, stock subscription,
new photo download or external runtime request is introduced. Reused files stay
at their original paths; French context and selection are independent.

Each mapping has its own Spanish context, accessible description and tooltip.
Abstract states and actions absent from a still photograph are explicitly marked
as contextual. For example, vouloir describes an imagined desire, offrir uses
flowers with an explicit gift context, and boire identifies a visible drink
without claiming the photograph captures swallowing. The mapping review used retained photograph descriptions and independent
inspection of selected local images; this does not claim a new source
license audit or independent learner comprehension study. The screenshot/browser
acceptance receipt separately records current rendering evidence.

Run `node --import tsx --test tests/french-content.test.ts` for inventory,
paradigms, complete difficulty coverage, source hashes, photograph byte integrity,
language separation and dictionary attribution. Run the repository's integrated
checks and French browser smoke for actual rendering and navigation. These tests
make no real provider or microphone claim.
