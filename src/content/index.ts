/** EN-WP-03: thin adapter over the independently reviewable authored JSON. */
import type { FormGuidance, PresentTense, SentenceEntry, VerbEntry, VerbForm, VerbId } from '../contracts/index';
import verbReference from '../../content/en-wp-03/verbs.json' with { type: 'json' };
import sentenceReference from '../../content/en-wp-03/sentences.json' with { type: 'json' };

type ReferenceForm = (typeof verbReference.verbs)[number]['forms']['base'][number];

function guidance(variants: readonly ReferenceForm[]): FormGuidance {
  return {
    accepted: variants.map(form => form.text),
    ipa: variants.map(form => variants.length > 1 ? `${form.text}: ${form.ipa}` : form.ipa).join('; '),
    spanishSoundGuide: variants.map(form =>
      `${variants.length > 1 ? `${form.text}: ` : ''}${form.sound_spelling_es}`
    ).join('; '),
  };
}

/** Original local illustrations; ambiguous meanings retain their Spanish context. */
export const VERBS: readonly VerbEntry[] = verbReference.verbs.map(verb => ({
  // Exact membership is pinned by the independent content check and contract tests.
  id: verb.lemma as VerbId,
  forms: {
    base: guidance(verb.forms.base),
    past: guidance(verb.forms.past),
    participle: guidance(verb.forms.participle),
  },
  spanishMeanings: verb.meanings_es,
  image: {
    src: verb.image_cue.src,
    alt: `${verb.image_cue.nonvisual_cue_es} ${verb.image_cue.context_es}`,
    attribution: verb.image_cue.attribution,
  },
  examples: {
    base: examplesFor(verb.sentence_examples, 'base'),
    past: examplesFor(verb.sentence_examples, 'past'),
    participle: examplesFor(verb.sentence_examples, 'participle'),
  },
  notes: [...verb.notes, `Cue sense: ${verb.cue_sense}.`,
    'Reference IPA is guidance, not an accent whitelist. Pronunciation needs audio evidence.'],
}));

function examplesFor(examples: readonly { family: string; text: string }[], family: VerbForm): readonly string[] {
  return examples.filter(example => example.family === family).map(example => example.text);
}

function presentTense(value: string): PresentTense {
  switch (value) {
    case 'present_simple': return 'present-simple';
    case 'present_continuous': return 'present-continuous';
    case 'present_perfect': return 'present-perfect';
    case 'present_perfect_continuous': return 'present-perfect-continuous';
    default: throw new Error(`Unsupported authored tense: ${value}`);
  }
}

function difficulty(value: number): 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value;
  throw new Error(`Unsupported authored difficulty: ${value}`);
}

/** Alternatives are rubric examples; unlisted grammatical equivalents remain valid. */
export const SENTENCES: readonly SentenceEntry[] = sentenceReference.sentences.map(sentence => ({
  id: sentence.id,
  spanish: sentence.prompt_es,
  difficulty: {
    grammar: difficulty(sentence.difficulty.grammar),
    vocabulary: difficulty(sentence.difficulty.vocabulary),
  },
  alternatives: sentence.accepted_examples.map(example => ({
    text: example.text,
    tense: presentTense(example.tense),
    explanation: `${example.structure}. ${example.meaning}`,
  })),
  hintSeeds: sentence.hint_intents,
  explanationRubric: {
    structure: 'Explain the finite verb/auxiliary construction actually used in the accepted response. A correct tense name alone is insufficient.',
    meaning: sentence.meaning_requirements.join(' '),
    usage: 'Explain why the actual construction fits the Spanish sentence. Accept plausible readings without requiring unstated context, including either perfect aspect for the since-2020 residence prompt.',
  },
}));

/** Context/ambiguity metadata for visual and nonvisual cue presentation. */
export const VERB_CUE_BRIEFS = verbReference.verbs.map(verb => ({
  id: verb.lemma as VerbId,
  ...verb.image_cue,
}));

/** Injectable uniform selection, confined to exact25, without an immediate repeat. */
export function pickNextVerb(previous?: VerbId, random: () => number = Math.random): VerbEntry {
  const candidates = VERBS.filter(verb => verb.id !== previous);
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError('Random sample must be finite and within [0, 1).');
  }
  return candidates[Math.floor(sample * candidates.length)]!;
}
