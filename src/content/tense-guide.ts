import type { Tense, LearningLanguage } from '../contracts';

/** Full structures shown after a sentence translation is accepted. */
export const TENSE_GUIDE: readonly { tense: Tense; label: string; guidance: string }[] = [
  { tense: 'present-simple', label: 'Present simple', guidance: 'Base family with subject agreement; habits and states. Questions/negatives use do/does + base (be uses am/is/are).' },
  { tense: 'present-continuous', label: 'Present continuous', guidance: 'Am/is/are + -ing; activity in progress around now.' },
  { tense: 'present-perfect', label: 'Present perfect', guidance: 'Have/has + past participle; earlier events or states connected to now.' },
  { tense: 'present-perfect-continuous', label: 'Present perfect continuous', guidance: 'Have/has been + -ing; duration or repetition leading up to now.' },
  { tense: 'past-simple', label: 'Past simple', guidance: 'Past form for finished past events/states. Questions/negatives use did + base; be uses was/were without did.' },
  { tense: 'past-continuous', label: 'Past continuous', guidance: 'Was/were + -ing; activity in progress at a past reference time. Invert was/were for questions; add not for negatives.' },
  { tense: 'past-perfect', label: 'Past perfect', guidance: 'Had + past participle; an event or state earlier than a later past reference. Invert had for questions; use had not for negatives.' },
  { tense: 'past-perfect-continuous', label: 'Past perfect continuous', guidance: 'Had been + -ing; duration or repetition up to a past reference. Questions use had + subject + been; negatives use had not been.' },
  { tense: 'future-simple', label: 'Future simple · will', guidance: 'Will + base; predictions, promises, offers and decisions. Questions invert will; negatives use will not / won’t. In future time clauses after when or as soon as, normally use a present form.' },
  { tense: 'future-going-to', label: 'Future going to', guidance: 'Am/is/are going to + base; intentions and predictions based on present evidence. Questions invert am/is/are; negation follows it. Will and going to can overlap; judge the actual meaning and context.' },
  { tense: 'future-continuous', label: 'Future continuous', guidance: 'Will be + -ing; an activity in progress at a future reference time. Questions invert will; negatives use will not be. Distinguish the ongoing activity from its completion.' },
  { tense: 'future-perfect', label: 'Future perfect', guidance: 'Will have + past participle; completion or a state viewed from a future reference point, often with by. Questions invert will; negatives use will not have.' },
  { tense: 'future-perfect-continuous', label: 'Future perfect continuous', guidance: 'Will have been + -ing; duration or repetition leading up to a future reference point. Use action verbs naturally; stative meanings normally use the perfect simple. The activity may continue beyond that point.' },
];

/** Verb practice omits concrete auxiliaries, which can be the requested forms of be/do. */
const VERB_STRUCTURES: Partial<Record<Tense, string>> = {
  'present-simple': 'Base family with subject agreement; habits and states. Use the appropriate auxiliary for questions and negatives, except with the copular verb.',
  'present-continuous': 'Present progressive auxiliary + present participle (-ing); activity in progress around now.',
  'present-perfect': 'Present perfect auxiliary + past participle; earlier events or states connected to now.',
  'present-perfect-continuous': 'Present perfect auxiliary + progressive auxiliary participle + -ing; duration or repetition leading up to now.',
  'past-simple': 'Past form for finished past events or states. Questions and negatives usually use a past auxiliary + base; the copular verb follows its own pattern.',
  'past-continuous': 'Past progressive auxiliary + present participle (-ing); activity in progress at a past reference time.',
  'past-perfect': 'Past perfect auxiliary + past participle; an event or state earlier than a later past reference.',
  'past-perfect-continuous': 'Past perfect auxiliary + progressive auxiliary participle + -ing; duration or repetition up to a past reference.',
  'future-simple': 'Future modal + base; predictions, promises, offers and decisions. Invert the modal for questions and negate it for negatives.',
  'future-going-to': 'Present auxiliary + going to + base; intentions and predictions based on present evidence. Invert the finite auxiliary for questions.',
  'future-continuous': 'Future modal + progressive auxiliary + -ing; activity in progress at a future reference time.',
  'future-perfect': 'Future modal + perfect auxiliary + past participle; completion or a state viewed from a future reference point.',
  'future-perfect-continuous': 'Future modal + perfect auxiliary + progressive auxiliary participle + -ing; duration or repetition leading up to a future reference point.',
};

export const VERB_TENSE_GUIDE = TENSE_GUIDE.map(item => ({ ...item, guidance: VERB_STRUCTURES[item.tense]! }));

export const FRENCH_TENSE_GUIDE: readonly { tense: Tense; label: string; guidance: string }[] = [
  { tense: 'fr-present', label: 'Présent · presente', guidance: 'Sujeto + verbo conjugado. Expresa estados, hábitos o acciones actuales. No necesita una forma continua equivalente al inglés. Ejemplo: je lis — leo / estoy leyendo.' },
  { tense: 'fr-passe-compose', label: 'Passé composé · pasado compuesto', guidance: 'Avoir o être en presente + participio pasado. Expresa un hecho terminado. Con être, el participio concuerda con el sujeto: elle est partie. Con avoir, concuerda con un objeto directo anterior: les lettres que j’ai écrites.' },
  { tense: 'fr-imparfait', label: 'Imparfait · imperfecto', guidance: 'Radical de nous en presente sin -ons + -ais, -ais, -ait, -ions, -iez, -aient. Être usa ét-. Describe hábitos, estados o acciones en curso en el pasado: je lisais — leía.' },
  { tense: 'fr-futur-proche', label: 'Futur proche · ir a + infinitivo', guidance: 'Aller en presente + infinitivo: je vais lire — voy a leer. Expresa una intención o un hecho ligado al presente; no significa solamente que falte poco tiempo.' },
  { tense: 'fr-futur-simple', label: 'Futur simple · futuro', guidance: 'Radical de futuro + -ai, -as, -a, -ons, -ez, -ont. Hay radicales irregulares: ser-, aur-, ir-, fer-, viendr-. Ejemplo: je lirai — leeré. En quand / dès que con referencia futura se usa futuro; después de si condicional, presente.' },
  { tense: 'fr-conditionnel-present', label: 'Conditionnel présent · condicional', guidance: 'Radical del futuro + terminaciones del imperfecto. Cortesía, deseo o hipótesis: je voudrais — quisiera; si j’avais le temps, je lirais — si tuviera tiempo, leería. También puede expresar futuro visto desde el pasado; no se enseña como una forma inglesa.' },
  { tense: 'fr-passe-recent', label: 'Passé récent · pasado reciente', guidance: 'Venir en presente + de / d’ + infinitivo: elle vient de partir — acaba de salir. Sitúa un hecho justo antes del momento actual. Con venait de, el punto de referencia es pasado. Negar la construcción puede negar que el hecho sea reciente; no equivale automáticamente a todavía no.' },
  { tense: 'fr-plus-que-parfait', label: 'Plus-que-parfait · pluscuamperfecto', guidance: 'Avoir o être en imperfecto + participio pasado: elle était partie — ella había salido. El hecho es anterior a otro punto pasado. Mantiene las reglas de concordancia del participio según el auxiliar y los complementos.' },
  { tense: 'fr-futur-anterieur', label: 'Futur antérieur · futuro anterior', guidance: 'Avoir o être en futuro simple + participio pasado: elle sera partie — ella habrá salido. Expresa un hecho terminado antes de un punto futuro; también puede expresar una suposición sobre el pasado. En quand / dès que, marca anterioridad respecto de otra acción futura.' },
];
export function getTenseGuide(language: LearningLanguage = 'en') { return language === 'fr' ? FRENCH_TENSE_GUIDE : TENSE_GUIDE; }
/** Verb-reference guidance does not reveal the current exercise’s requested forms. */
export function getVerbTenseGuide(language: LearningLanguage = 'en') {
  return language === 'fr' ? FRENCH_TENSE_GUIDE.map(item => ({ ...item,
    guidance: item.tense === 'fr-passe-compose'
      ? 'Auxiliar adecuado en presente + participio pasado; revisa la concordancia con el sujeto o con un objeto directo anterior según el auxiliar.'
      : item.tense === 'fr-plus-que-parfait'
        ? 'Auxiliar adecuado en imperfecto + participio pasado; hecho anterior a otro punto pasado. Revisa la concordancia según el auxiliar y los complementos.'
      : item.tense === 'fr-futur-anterieur'
        ? 'Auxiliar adecuado en futuro + participio pasado; hecho completado antes de un punto futuro. Revisa la concordancia según el auxiliar y los complementos.'
      : item.tense === 'fr-passe-recent'
        ? 'Verbo que expresa procedencia conjugado + preposición de / d’ + infinitivo; hecho inmediatamente anterior al punto de referencia.'
      : item.tense === 'fr-futur-proche'
        ? 'Verbo de movimiento conjugado en presente + infinitivo; expresa una intención o un hecho ligado al presente.'
        : item.tense === 'fr-futur-simple' || item.tense === 'fr-conditionnel-present'
          ? 'Usa el radical de futuro propio del verbo y las terminaciones del tiempo seleccionado. Revisa las raíces irregulares y la concordancia con el sujeto.'
          : item.tense === 'fr-present'
            ? 'Verbo conjugado según la persona; estados, hábitos y acciones actuales. La casilla de esta práctica pide la forma de je / j’.'
            : 'Radical del presente plural y terminaciones del imperfecto; describe hábitos o estados del pasado. El verbo copulativo tiene un radical propio.'
  })) : VERB_TENSE_GUIDE;
}
