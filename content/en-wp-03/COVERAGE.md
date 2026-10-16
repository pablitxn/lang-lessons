# EN-WP-03 coverage matrix

Inventory and authoring coverage at content revision `en-wp-03/1`: 25 verbs,
82 form-slot alternatives (including repeated spellings across slots), 75
sentence-family examples, 25 image briefs, 17 sentence prompts, 32 accepted
translation examples and 69 authored oracle fixtures. The 17 Python unit tests mutate
data to verify that important integrity/coverage regressions are detected.
Seven Node tests also exercise the actual typed adapter and injectable random
selection against the architect's inventory and curriculum contracts.

## Requirement to evidence

| Requirement | Authored evidence | Deterministic verification / remaining evaluation |
| --- | --- | --- |
| EN-D12 exact25 and bounded random source | verbs.json, ordered stable inventory; pickNextVerb adapter | Exact membership/order/uniqueness; extra/replaced verb mutation tests; all 24 eligible selection bins tested for each prior verb and invalid samples rejected. |
| Forms and Spanish meanings | Every verb has base/past/participle, sense and meanings | Nonempty fields and variant checks; semantics need educational review. |
| Pronunciation and Spanish sound explanation | 82 reference IPA slots with Spanish guide references and notes | Reference integrity checked. No pronunciation scoring or real audio validated. |
| Burn/dream alternatives | Both variants in past and participle; all eight pair combinations | Required pair-oracle coverage; no suffix-based exclusion. |
| EN-D04 base-family agreement | buy-base-agreement, be-base-agreement, ordinary inflected examples | Oracle accepts he buys and she is; no NLP evaluator is run. |
| EN-D04 complete participle construction | 25 complete perfect examples; perfect-pp, passive-pp; bare/malformed/past-only counterexamples | Authored perfect auxiliary integrity and required oracle checks. Passive/adjective ambiguity clarified. |
| EN-D09 alternatives and explanations | 32 examples, semantic-open-set policy, open-set-synonym | Closed-whitelist mutation fails. Oracle expects translation retention when a later explanation is wrong/partial. |
| EN-D10 four present tenses | Four core prompts per tense, plus shared residence prompt | Exact tense coverage and example structure/meaning metadata checked. |
| EN-D10 separate difficulty | Each tense has independently varied grammar and vocabulary | Mutation tying vocabulary to grammar fails. Local levels need calibration. |
| EN-D11 both residence answers | sentence-since-2020: expanded/contracted simple and continuous perfect | Correct actual-tense tags plus accept-and-explain oracles required. |
| EN-D08 no ed/ing/ongoing shortcut | hint-suffix-shortcut, hint-ongoing-shortcut, finite-aux-needed, since examples | Authored block/incorrect/accept expectations; live evaluator compliance untested. |
| EN-D08/09 progressive no-spoiler hints | hint-policy.json; 14 hint oracles | 11 block cases cover tense names, answers, auxiliary fragments, formulas, cloze, encoding, false rules and pending processing. No real model generation/guard validated. |
| EN-D08 uncertain speech | Five uncertain speech scenarios; pronunciation-not-spelling | Must clarify, preserve evidence and prohibit penalty/help eligibility/completion; mutation tests fail otherwise. |
| EN-D14 natural contractions/connected speech | Contracted examples, connected-speech-clear/uncertain, accent-not-error | Authored expected behavior only; no microphone or acoustic evidence. |
| EN-D02 image cues independent of tense | 25 cue briefs; image-not-tense, image-alt-not-answer | Brief-only/null asset invariants. Rights, cue comprehension and accessible equivalence remain open. |
| EN-D04/14 evidence independence and continuity | simultaneous-evidence, stale-evidence; CONTRACT.md | Oracle specifications; state machine, helpers and natural-pause behavior owned by app work packages. |

## Inventory coverage

Every row below has all three form slots, Spanish meaning/sense, IPA/Spanish
sound guidance, three grammatical examples and an image-cue brief. A brief
is not an image asset or a validated recognition cue.

| Stable ID | Base / past / participle | Contextual notes |
| --- | --- | --- |
| verb-be | be / was, were / been | Present suppletion; sentence agreement; accent variants for been |
| verb-beat | beat / beat / beaten | Whisk cue; defeat and strike senses also valid |
| verb-become | become / became / become | Change of state |
| verb-begin | begin / began / begun | Start an activity |
| verb-bend | bend / bent / bent | Shape change |
| verb-bet | bet / bet, betted / bet, betted | Less common standard variant retained |
| verb-bite | bite / bit / bitten | Food cue |
| verb-bleed | bleed / bled / bled | Non-graphic cue |
| verb-blow | blow / blew / blown | Air/bubbles cue |
| verb-break | break / broke / broken | Verbal/adjectival participle ambiguity handled |
| verb-bring | bring / brought / brought | Motion toward reference point |
| verb-build | build / built / built | Structure creation |
| verb-burn | burn / burned, burnt / burned, burnt | Either variant independently valid |
| verb-burst | burst / burst / burst | Sudden rupture |
| verb-buy | buy / bought / bought | He buys explicitly accepted |
| verb-catch | catch / caught / caught | Ball cue; legitimate vowel-accent variation |
| verb-choose | choose / chose / chosen | Selection cue |
| verb-come | come / came / come | Motion toward reference point |
| verb-cost | cost / cost / cost | Price cue; budget-calculation costed is a separate valid sense |
| verb-cut | cut / cut / cut | Paper/craft cue |
| verb-deal | deal / dealt / dealt | Cards cue; deal with also valid in context |
| verb-dig | dig / dug / dug | Soil cue |
| verb-do | do / did / done | Perform a task; does accepted in base family |
| verb-draw | draw / drew / drawn | Picture cue; other senses need explanation |
| verb-dream | dream / dreamed, dreamt / dreamed, dreamt | Sleep cue; aspiration sense also valid |

## Sentence and difficulty coverage

G/V are local grammar/vocabulary authoring levels, not calibrated learner
scores. Fixed G with different V and fixed V with different G exist in each
tense. The matrix is representative; it does not fill every possible G/V cell.

| Primary teaching tense | Prompt IDs after sentence- prefix | G/V pairs |
| --- | --- | --- |
| Present simple | ps-bread, ps-tools, ps-negative, ps-question | 1/1, 1/3, 2/1, 3/2 |
| Present continuous | pc-picture, pc-trench, pc-negative, pc-question | 1/1, 1/3, 2/1, 3/2 |
| Present perfect | pp-done, pp-budget, pp-negative, pp-question | 1/1, 1/3, 2/2, 3/2 |
| Present perfect continuous | ppc-drawing, ppc-negotiation, ppc-negative, ppc-question | 1/1, 1/3, 2/1, 3/2 |
| Shared perfect alternatives | since-2020 | 2/1; either perfect aspect accepted |

Fixture areas: spelling 12; sentence family 11; translation 18; explanation 2;
evidence 2; speech 8; image 2; hint 14. Expected outcomes: accept 31,
incorrect 12, clarify 10, incomplete 1, ignore 1, allow 3, block 11.

## Evidence classification

- Executed: local standard-library JSON/content integrity validation, 17 Python
  mutation/unit tests and seven Node adapter/selection tests. These establish
  data consistency, oracle coverage and adapter behavior at the pinned contract
  base. No full application TypeScript/build result is claimed.
- Authored only: semantic grading, explanation assessment, uncertainty handling,
  accent/contraction acceptance and no-spoiler behavioral specifications.
- Mocked provider/browser evidence: none. Fixture input objects are authored
  examples, not mocked recognizer execution.
- Real provider, live voice, microphone, mobile/browser, classroom, asset rights,
  deployment and user acceptance: not run or claimed. No app exists in this
  task's inspected baseline, so browser helpers are not applicable yet.
