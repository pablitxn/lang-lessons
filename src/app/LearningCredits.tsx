import englishSnapshot from '../features/verbs/dictionary/wiktionary.snapshot.json';
import frenchSnapshot from '../features/verbs/dictionary/french.snapshot.json';
import type { LearningLanguage } from '../contracts';
import englishSnapshotUrl from '../features/verbs/dictionary/wiktionary.snapshot.json?url';
import frenchSnapshotUrl from '../features/verbs/dictionary/french.snapshot.json?url';

/** Keep the full attribution available without interrupting a learning exercise. */
export function LearningCredits({ language = 'en' }: { language?: LearningLanguage }) {
  const snapshot = language === 'fr' ? frenchSnapshot : englishSnapshot;
  const snapshotUrl = language === 'fr' ? frenchSnapshotUrl : englishSnapshotUrl;
  return <section className="preferences-section learning-credits" aria-labelledby="credits-title">
    <h3 id="credits-title">Credits</h3>
    <h4>Dictionary</h4>
    <p>Definitions, pronunciations and examples by {snapshot.attribution}, under <a href={snapshot.licenseUrl} target="_blank" rel="noreferrer">{snapshot.license}</a>.</p>
    <p>Selected {language === 'fr' ? 'French' : 'English'} verb senses. {snapshot.modifications}</p>
    <p>Adapted dictionary content is offered under the same license. Wiktionary and its contributors do not endorse this application.</p>
    <p>Retrieved {snapshot.retrievedOn}. These entries are a selected learning reference, not a complete dictionary.</p>
    <ul className="learning-credit-entries">{snapshot.entries.map(entry => <li key={entry.content.lemma}>
      <a href={entry.sourceUrl} target="_blank" rel="noreferrer">{entry.content.lemma}</a>
    </li>)}</ul>
    <a className="learning-credits-download" href={snapshotUrl} download={language === 'fr' ? 'french.snapshot.json' : 'wiktionary.snapshot.json'}>Download attributed snapshot (CC BY-SA 4.0)</a>
  </section>;
}
