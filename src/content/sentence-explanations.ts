import type { SentenceEntry, Tense, TranslationAlternative } from '../contracts';
import sentenceReference from '../../content/en-wp-03/sentences.json';

const englishContexts = new Map(sentenceReference.sentences.map(sentence => [sentence.id, sentence]));
type EnglishTense = Exclude<Tense, `fr-${string}`>;

export interface SentenceExplanationDetails {
  /** Construction fragments use the same authored rules as the full explanation. */
  formula: readonly string[];
  structure?: string;
  context: readonly string[];
  notes: readonly string[];
  /** Existing plain-text consumers retain the complete original explanation. */
  text: string;
}

const formulas: Readonly<Record<Tense, readonly string[]>> = {
  'present-simple': ['verbo conjugado'],
  'present-continuous': ['am/is/are', 'verbo en -ing'],
  'present-perfect': ['have/has', 'participio'],
  'present-perfect-continuous': ['have/has been', 'verbo en -ing'],
  'past-simple': ['verbo en pasado'],
  'past-continuous': ['was/were', 'verbo en -ing'],
  'past-perfect': ['had', 'participio'],
  'past-perfect-continuous': ['had been', 'verbo en -ing'],
  'future-simple': ['will', 'verbo base'],
  'future-going-to': ['am/is/are going to', 'verbo base'],
  'future-continuous': ['will be', 'verbo en -ing'],
  'future-perfect': ['will have', 'participio'],
  'future-perfect-continuous': ['will have been', 'verbo en -ing'],
  'fr-present': ['sujeto', 'verbo conjugado'],
  'fr-passe-compose': ['avoir o être en presente', 'participio pasado'],
  'fr-imparfait': ['radical del imperfecto', 'terminación'],
  'fr-futur-proche': ['aller en presente', 'infinitivo'],
  'fr-futur-simple': ['radical del futuro', 'terminación'],
  'fr-conditionnel-present': ['radical del futuro', 'terminaciones del imperfecto'],
  'fr-passe-recent': ['venir en presente', 'de / d’', 'infinitivo'],
  'fr-plus-que-parfait': ['avoir o être en imperfecto', 'participio pasado'],
  'fr-futur-anterieur': ['avoir o être en futuro simple', 'participio pasado'],
};

/** Readable companions to the formula; the complete original copy remains below. */
const structureSummaries: Readonly<Record<EnglishTense, string>> = {
  'present-simple': 'El verbo concuerda con el sujeto: lleva -s con he, she o it. Con do/does, el verbo principal va en forma base; be tiene sus propias formas.',
  'present-continuous': 'El contexto distingue una actividad en curso de un plan futuro ya organizado.',
  'present-perfect': 'Relaciona un hecho o una situación anterior con el presente.',
  'present-perfect-continuous': 'Destaca la duración o repetición de una actividad hasta el presente.',
  'past-simple': 'Con did, el verbo principal va en forma base; be usa was/were.',
  'past-continuous': 'Presenta una actividad en curso en un momento del pasado.',
  'past-perfect': 'Sitúa un hecho antes de otro momento del pasado.',
  'past-perfect-continuous': 'Destaca una actividad o su duración hasta un momento del pasado.',
  'future-simple': 'Will puede expresar una previsión, una promesa o una decisión según el contexto.',
  'future-going-to': 'Expresa una intención o una previsión basada en indicios.',
  'future-continuous': 'Sitúa una actividad en curso en un momento futuro.',
  'future-perfect': 'Mira un hecho desde un punto futuro para indicar si ya habrá ocurrido.',
  'future-perfect-continuous': 'Mide la duración de una actividad hasta un punto futuro, sin afirmar que esté terminada.',
};

const spanishSentences = new Intl.Segmenter('es', { granularity: 'sentence' });
function paragraphs(text: string): string[] {
  return Array.from(spanishSentences.segment(text), item => item.segment.trim()).filter(Boolean);
}

/** Spanish teaching copy; each structure describes the matched construction. */
const structures: Readonly<Record<EnglishTense, string>> = {
  'present-simple': 'El verbo concuerda con el sujeto: lleva -s con he, she o it. Cuando aparece do/does, el verbo principal va en forma base; be tiene sus propias formas.',
  'present-continuous': 'Se forma con am/is/are + verbo en -ing. El contexto distingue una actividad en curso de un plan futuro ya organizado.',
  'present-perfect': 'Se forma con have/has + participio y relaciona un hecho o una situación anterior con el presente.',
  'present-perfect-continuous': 'Se forma con have/has been + verbo en -ing y destaca la duración o repetición de una actividad hasta el presente.',
  'past-simple': 'Se usa la forma pasada del verbo. Cuando aparece did, el verbo principal va en forma base; be usa was/were.',
  'past-continuous': 'Se forma con was/were + verbo en -ing y presenta una actividad en curso en un momento del pasado.',
  'past-perfect': 'Se forma con had + participio y sitúa un hecho antes de otro momento del pasado.',
  'past-perfect-continuous': 'Se forma con had been + verbo en -ing y destaca una actividad o su duración hasta un momento del pasado.',
  'future-simple': 'Se forma con will + verbo base. Will puede expresar una previsión, una promesa o una decisión según el contexto.',
  'future-going-to': 'Se forma con am/is/are going to + verbo base y expresa una intención o una previsión basada en indicios.',
  'future-continuous': 'Se forma con will be + verbo en -ing y sitúa una actividad en curso en un momento futuro.',
  'future-perfect': 'Se forma con will have + participio y mira un hecho desde un punto futuro para indicar si ya habrá ocurrido.',
  'future-perfect-continuous': 'Se forma con will have been + verbo en -ing y mide la duración de una actividad hasta un punto futuro, sin afirmar que esté terminada.',
};

/** Mixed-tense prompts need the accepted reading, not only the primary prompt's context. */
const alternativeContexts: Readonly<Record<string, Partial<Record<EnglishTense, string>>>> = {
  'sentence-past-simple-question': {
    'past-simple': 'La pregunta presenta su residencia durante el año pasado como una situación pasada; no afirma dónde viven ahora.',
    'past-continuous': 'La pregunta sitúa su residencia en el transcurso del año pasado. El continuo es una lectura válida de este contexto y no afirma dónde viven ahora.',
  },
  'sentence-expand-pp-lost-keys': {
    'present-perfect': 'La pérdida de las llaves se presenta como relevante en el momento de hablar.',
    'past-simple': 'Se relata la pérdida de las llaves. Esta variante también es natural en algunos dialectos; la frase no afirma que las llaves ya se hayan recuperado.',
  },
  'sentence-future-simple-guide': {
    'future-simple': 'Se anticipa o promete que la guía mostrará un camino más corto mañana.',
    'future-going-to': 'La acción de la guía se presenta como un plan: mostrar un camino más corto mañana.',
  },
  'sentence-future-going-to-bookshop': {
    'future-going-to': 'La vecina tiene la intención de abrir una librería el mes próximo.',
    'present-continuous': 'La apertura de la librería se presenta como un plan organizado para el mes próximo, no como una actividad que esté ocurriendo ahora.',
  },
  'sentence-future-going-to-shelf': {
    'future-going-to': 'Se prevé, por la capacidad aparente del estante, que no podrá soportar esa cantidad de peso.',
    'future-simple': 'Se predice que el estante no soportará esa cantidad de peso. Will también permite expresar esta previsión.',
  },
};

/** Completion-only copy. Unrecognized alternatives never inherit another sentence's explanation. */
export function getSentenceExplanationDetails(sentence: SentenceEntry, alternative: TranslationAlternative): SentenceExplanationDetails | undefined {
  const matched = sentence.alternatives.find(item => item.text === alternative.text && item.tense === alternative.tense);
  if (!matched) return undefined;
  if (sentence.language === 'fr') return {
    formula: formulas[matched.tense], context: paragraphs(matched.explanation), notes: [], text: matched.explanation,
  };

  const reference = englishContexts.get(sentence.id);
  const authored = reference?.accepted_examples.find(item => item.text === matched.text && item.tense.replaceAll('_', '-') === matched.tense);
  if (!reference || !authored || !(matched.tense in structures)) return undefined;
  const structure = structures[matched.tense as EnglishTense];

  if (sentence.id === 'sentence-since-2020') {
    const continuous = matched.tense === 'present-perfect-continuous';
    return {
      formula: formulas[matched.tense],
      structure: continuous ? 'Destaca cuánto tiempo llevamos viviendo aquí.' : 'Presenta una situación que empezó antes y continúa ahora.',
      context: [continuous
        ? 'Since 2020 marca el inicio y seguimos viviendo aquí; no implica que la residencia sea temporal o esté terminando.'
        : 'Since 2020 marca el inicio: vivimos aquí desde entonces y seguimos viviendo aquí.'],
      notes: [],
      text: continuous
        ? 'Have/has been + verbo en -ing destaca cuánto tiempo llevamos viviendo aquí. Since 2020 marca el inicio y seguimos viviendo aquí; no implica que la residencia sea temporal o esté terminando.'
        : 'Have/has + participio presenta una situación que empezó antes y continúa ahora. Since 2020 marca el inicio: vivimos aquí desde entonces y seguimos viviendo aquí.',
    };
  }

  const notes: string[] = [];
  if (authored.structure.includes('subject question')) {
    notes.push('La palabra interrogativa ocupa el lugar del sujeto; no se agrega do/does/did.');
  } else if (matched.text.endsWith('?')) {
    notes.push('En esta pregunta, el primer auxiliar va antes del sujeto.');
  }
  const futureClause = matched.tense.startsWith('future-') && /(when|before|if) \+ (?:subject \+ )?present simple/u.exec(authored.structure);
  if (futureClause) {
    notes.push(`La cláusula con ${futureClause[1]} usa presente simple aunque se refiera al futuro.`);
  }
  const context = alternativeContexts[sentence.id]?.[matched.tense as EnglishTense] ?? reference.context_es;
  return {
    formula: formulas[matched.tense], structure: structureSummaries[matched.tense as EnglishTense],
    context: paragraphs(context), notes, text: [structure, context, ...notes].join(' '),
  };
}

/** Plain-text compatibility for existing consumers and evidence checks. */
export function getSentenceExplanation(sentence: SentenceEntry, alternative: TranslationAlternative): string | undefined {
  return getSentenceExplanationDetails(sentence, alternative)?.text;
}
