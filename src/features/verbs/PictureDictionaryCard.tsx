import type { PictureCompletion, SourcedDictionaryText } from '../../contracts';
import './picture-dictionary.css';

function SourcedText({ value }: { value: SourcedDictionaryText }) {
  const source = value.source;
  const safeUrl = /^https?:\/\//u.test(source.url) ? source.url : undefined;
  return <div><p>{value.text}</p><small>
    {safeUrl ? <a href={safeUrl} target="_blank" rel="noreferrer">{source.attribution}</a> : source.attribution}
    {' · '}{source.license}{' · Snapshot '}{source.snapshotId}{' · Retrieved '}{source.retrievedOn}
    {' · Content hash '}{source.contentHash}
  </small></div>;
}

/** Caller must supply only the current accepted completion, never a preview. */
export function PictureDictionaryCard({ completion, onNext }: { completion: PictureCompletion; onNext: () => void }) {
  const entry = completion.dictionary;
  return <section className="picture-dictionary" aria-label="Completed picture dictionary">
    <h2>Written forms complete</h2>
    {entry ? <><h3>{entry.lemma}</h3>
      {entry.pronunciations.map((item, index) => <div key={index}><span>{item.dialect}</span><SourcedText value={item.notation} /></div>)}
      {entry.senses.map(sense => <section key={sense.id}><SourcedText value={sense.partOfSpeech} />
        <SourcedText value={sense.definition} />{sense.examples.map((example, index) => <SourcedText key={index} value={example} />)}</section>)}
    </> : <p>Dictionary content is unavailable while its source and reuse terms await approval.</p>}
    <button type="button" className="ll-button" onClick={onNext}>Next picture</button>
  </section>;
}
