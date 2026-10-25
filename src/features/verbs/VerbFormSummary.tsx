import { getFormGuidance, getVerbForms, type PracticeVerbForm, type VerbEntry } from '../../contracts';

/** A compact reference of the forms the learner has just completed. */
export function VerbFormSummary({ verb }: { verb: VerbEntry }) {
  const labels: Record<PracticeVerbForm, string> = { base: 'Base', past: 'Past', participle: verb.language === 'fr' ? 'Participio' : 'Participle', infinitive: 'Infinitivo', present: 'Presente · je' };
  return <dl className="dictionary-forms" aria-label={verb.language === 'fr' ? 'Formas del verbo' : 'Verb forms'}>
    {getVerbForms(verb).map(form => <div key={form}>
      <dt>{labels[form]}</dt>
      <dd lang={verb.language ?? 'en'}>{getFormGuidance(verb, form)?.accepted.join(' / ')}</dd>
    </div>)}
  </dl>;
}
