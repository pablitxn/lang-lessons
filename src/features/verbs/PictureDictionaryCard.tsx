import type { PictureCompletion } from '../../contracts';
import './picture-dictionary.css';

/** Caller must supply only the current accepted completion, never a preview. */
export function PictureDictionaryCard({ completion, onNext }: { completion: PictureCompletion; onNext: () => void }) {
  const entry = completion.dictionary;
  return <section className="picture-dictionary" aria-label="Completed picture dictionary">
    {entry ? <>
      <header className="dictionary-heading">
        <h2>{entry.lemma}</h2>
        <div className="dictionary-pronunciations">{entry.pronunciations.map((item, index) => <div key={index} className="dictionary-pronunciation">
          <span className="dictionary-ipa">{item.notation.text}</span>
          {!item.dialect.includes('not specified') && <span className="dictionary-dialect">{item.dialect}</span>}
        </div>)}</div>
      </header>
      <div className="dictionary-senses">{entry.senses.map(sense => <section key={sense.id} className="dictionary-sense">
        <span className="dictionary-part-of-speech">{sense.partOfSpeech.text}</span>
        <p className="dictionary-definition">{sense.definition.text}</p>
        {sense.examples.length > 0 && <div className="dictionary-examples">
          <span className="dictionary-example-label">{sense.examples.length === 1 ? 'Example' : 'Examples'}</span>
          {sense.examples.map((example, index) => <blockquote key={index}><p>{example.text}</p></blockquote>)}
        </div>}
      </section>)}</div>
    </> : <p>Dictionary content is unavailable for this entry.</p>}
    <button type="button" className="ll-button dictionary-next" onClick={onNext}>Next picture
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
    </button>
  </section>;
}
