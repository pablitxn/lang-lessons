import { WIKTIONARY_NOTICE } from './dictionary';
import snapshotUrl from './dictionary/wiktionary.snapshot.json?url';
import type { PictureCompletion, SourcedDictionaryText } from '../../contracts';
import './picture-dictionary.css';

function SourcedText({ value }: { value: SourcedDictionaryText }) {
  const source = value.source;
  const safeUrl = /^https?:\/\//u.test(source.url) ? source.url : undefined;
  return <div><p>{value.text}</p><small>
    {safeUrl ? <a href={safeUrl} target="_blank" rel="noreferrer">{source.attribution}</a> : source.attribution}
    {' · '}{source.license === 'CC BY-SA 4.0' ? <a href={WIKTIONARY_NOTICE.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a> : source.license}
  </small></div>;
}

/** Caller must supply only the current accepted completion, never a preview. */
export function PictureDictionaryCard({ completion, onNext }: { completion: PictureCompletion; onNext: () => void }) {
  const entry = completion.dictionary;
  const source = entry?.senses[0]?.definition.source;
  const isWiktionary = source?.snapshotId === WIKTIONARY_NOTICE.snapshotId;
  return <section className="picture-dictionary" aria-label="Completed picture dictionary">
    <h2>Written forms complete</h2>
    {entry ? <><h3>{entry.lemma}</h3>
      {!entry.pronunciations.length && <p>Pronunciation unavailable in this snapshot.</p>}
      {entry.pronunciations.map((item, index) => <div key={index}><span>{item.dialect}</span><SourcedText value={item.notation} /></div>)}
      {entry.senses.map(sense => <section key={sense.id}><SourcedText value={sense.partOfSpeech} />
        <SourcedText value={sense.definition} />{!sense.examples.length && <p>Example unavailable in this snapshot.</p>}{sense.examples.map((example, index) => <SourcedText key={index} value={example} />)}</section>)}
      {isWiktionary && <details><summary>Source and reuse details</summary>
        <p>Selected English verb sense from Wiktionary; other senses and regional pronunciations are not included.</p>
        <p>{WIKTIONARY_NOTICE.modifications}</p>
        <p>Retrieved {source.retrievedOn}. Snapshot {source.snapshotId}. Content hash {source.contentHash}.</p>
        <a href={snapshotUrl} download="wiktionary.snapshot.json">Download attributed snapshot (CC BY-SA 4.0)</a>
      </details>}
    </> : <p>Dictionary content is unavailable for this entry.</p>}
    <button type="button" className="ll-button" onClick={onNext}>Next picture</button>
  </section>;
}
