import { useEffect, useMemo, useState } from 'react';
import { ALL_VERBS } from '../../content';
import { getFormGuidance, getVerbForms, parseWordDictionaryResponse, type ExerciseIdentity, type SentenceEntry, type WordDictionaryResponse } from '../../contracts';
import { DictionaryEntryCard } from '../../ui/dictionary/DictionaryEntryCard';
import { rememberDictionarySources } from '../../ui/dictionary/dictionary-credits';
import { getPictureDictionaryEntry } from '../verbs/dictionary';
import { VerbFormSummary } from '../verbs/VerbFormSummary';

type LookupState = { status: 'loading' | 'error' } | { status: 'ready'; result: WordDictionaryResponse };

/** Fetch only an explicitly selected word. Exercise/draft changes unmount and cancel this view. */
export function SentenceDictionaryCard({ word, sentence, identity, onClose }: {
  word: string; sentence: SentenceEntry; identity: ExerciseIdentity; onClose(): void;
}) {
  const language = sentence.language ?? 'en';
  const normalized = word.normalize('NFC').toLocaleLowerCase(language);
  const local = useMemo(() => {
    const candidates = ALL_VERBS.filter(verb => (verb.language ?? 'en') === language
      && getVerbForms(verb).some(form => getFormGuidance(verb, form)?.accepted.some(value => value.toLocaleLowerCase(language) === normalized)));
    if (candidates.length !== 1) return null;
    const verb = candidates[0]!; const entry = getPictureDictionaryEntry(verb.id);
    return entry ? { verb, entry } : null;
  }, [language, normalized]);
  const [state, setState] = useState<LookupState>({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (local) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    void (async () => {
      try {
        const response = await fetch('/api/realtime/word-dictionary', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          body: JSON.stringify({ identity: { sessionId: identity.sessionId, exerciseId: identity.exerciseId, generation: identity.generation }, sentenceId: sentence.id, word }),
        });
        if (!response.ok) throw new Error('Dictionary unavailable');
        const result = parseWordDictionaryResponse(await response.json());
        if (!result || result.language !== language || result.word.normalize('NFC').replaceAll('’', "'").toLocaleLowerCase(language) !== normalized.replaceAll('’', "'")) throw new Error('Invalid dictionary response');
        if (!controller.signal.aborted) {
          if (result.entry) rememberDictionarySources(result.entry, language);
          setState({ status: 'ready', result });
        }
      } catch { if (!controller.signal.aborted) setState({ status: 'error' }); }
    })();
    return () => controller.abort();
  }, [word, sentence.id, language, identity.sessionId, identity.exerciseId, identity.generation, local, normalized, retry]);

  return <section className="sentence-dictionary" aria-label={`Diccionario: ${word}`} lang="es">
    <div className="sentence-dictionary-heading">
      <span>Tu palabra: <strong lang={language}>{word}</strong></span>
      <button type="button" className="sentence-dictionary-close" aria-label="Cerrar diccionario" onClick={onClose}>×</button>
    </div>
    {local ? <DictionaryEntryCard entry={local.entry} language={language} definitionLanguage={language === 'fr' ? 'es' : 'en'}
      meaning={local.verb.spanishMeanings.join(' · ')} forms={<VerbFormSummary verb={local.verb} />} />
      : state.status === 'ready' && state.result.entry ? <>
        <DictionaryEntryCard entry={state.result.entry} language={language} definitionLanguage="en" title={language === 'fr' ? 'Diccionario · definiciones en inglés' : 'Diccionario'} />
      </> : <div className="sentence-dictionary-message" role="status">
        {state.status === 'loading' ? 'Buscando la palabra…'
          : state.status === 'error' ? <><p>No se pudo abrir el diccionario. Tu frase sigue acá.</p><button type="button" className="ll-button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></>
            : 'No encontramos una entrada para esta palabra. Podés consultar otra palabra de tu frase.'}
      </div>}
  </section>;
}
