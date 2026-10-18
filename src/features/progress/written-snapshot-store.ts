import { TENSES } from '../../contracts';
import { parsePracticeEvent } from '../../foundation/progress-batch';
import { validateProgressScope, type ProgressScope } from './pending-progress-store';
import { snapshotIdentity, snapshotId, snapshotObject, type WrittenPracticeSnapshot } from './written-snapshot';

type Kind = WrittenPracticeSnapshot['kind'];
const kinds: readonly Kind[] = ['sentence', 'verb-image', 'verb-visible'];
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value: unknown) => typeof value === 'string' && value.length <= 1000;
/** Structural boundary only. Feature restore additionally verifies authored content and progression. */
export function parseWrittenSnapshot(scope: ProgressScope, value: unknown): WrittenPracticeSnapshot | null {
  validateProgressScope(scope);
  if (!snapshotObject(value) || value.schemaVersion !== 1 || value.userId !== scope.userId || !snapshotIdentity(value.identity, scope.sessionId)) return null;
  if (value.kind === 'sentence') {
    if (!exact(value, ['schemaVersion','kind','userId','identity','sentenceId','draft','finalized','selectedTense','events'])
      || !snapshotId(value.sentenceId) || !text(value.draft) || typeof value.finalized !== 'boolean'
      || value.selectedTense !== null && !TENSES.includes(value.selectedTense as typeof TENSES[number])
      || !Array.isArray(value.events) || value.events.length > 10000) return null;
    for (const input of value.events) {
      const event = parsePracticeEvent(input);
      if (!event || event.source !== 'typed' || !['written:translation','written:tense'].includes(event.ref.obligation)
        || event.ref.sessionId !== scope.sessionId || event.ref.exerciseId !== value.identity.exerciseId || event.ref.generation !== value.identity.generation) return null;
    }
  } else if (value.kind === 'verb-image' || value.kind === 'verb-visible') {
    if (!exact(value, ['schemaVersion','kind','userId','identity','verbId','photoSrc','drafts','records'])
      || !snapshotId(value.verbId) || typeof value.photoSrc !== 'string' || value.photoSrc.length > 2048
      || !snapshotObject(value.drafts) || !exact(value.drafts, ['base','past','participle']) || !Object.values(value.drafts).every(text)
      || !Array.isArray(value.records) || value.records.length > 3) return null;
    const forms = new Set();
    for (const record of value.records) {
      if (!snapshotObject(record) || !exact(record, ['form','revision','attemptId','finalized'])
        || !['base','past','participle'].includes(record.form as string) || forms.has(record.form)
        || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1 || !snapshotId(record.attemptId) || typeof record.finalized !== 'boolean') return null;
      forms.add(record.form);
    }
  } else return null;
  return structuredClone(value) as unknown as WrittenPracticeSnapshot;
}

/** Local drafts only; never passed to ProgressSink or a server adapter. One current exercise per mode/scope. */
export function createIndexedDbWrittenSnapshotStore(factory: IDBFactory = indexedDB, name = 'lang-lessons.written-snapshots.v1') {
  let opening: Promise<IDBDatabase> | undefined;
  function open() {
    if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
      const pending = factory.open(name, 1); let failed = false;
      pending.onupgradeneeded = () => pending.result.createObjectStore('snapshots');
      pending.onsuccess = () => {
        if (failed) { pending.result.close(); return; }
        pending.result.onversionchange = () => { pending.result.close(); opening = undefined; };
        resolve(pending.result);
      };
      pending.onerror = pending.onblocked = () => { failed = true; opening = undefined; reject(new Error('Local written recovery storage is unavailable.')); };
    });
    return opening;
  }
  async function run(scope: ProgressScope, kind: Kind, operation: 'load' | 'save' | 'remove', value?: WrittenPracticeSnapshot) {
    validateProgressScope(scope);
    if (!kinds.includes(kind)) throw new Error('Invalid written practice mode.');
    const database = await open();
    return new Promise<WrittenPracticeSnapshot | null>((resolve, reject) => {
      const tx = database.transaction('snapshots', operation === 'load' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('snapshots'); const key = [scope.userId, scope.sessionId, kind];
      let loaded: WrittenPracticeSnapshot | null = null;
      const request = operation === 'load' ? store.get(key) : operation === 'save' ? store.put(value, key) : store.delete(key);
      request.onsuccess = () => {
        if (operation === 'load' && request.result !== undefined) {
          loaded = parseWrittenSnapshot(scope, request.result);
          if (!loaded || loaded.kind !== kind) tx.abort();
        }
      };
      tx.oncomplete = () => resolve(loaded);
      tx.onerror = () => {};
      tx.onabort = () => reject(new Error('Local written recovery transaction failed.'));
    });
  }
  return {
    async save(scope: ProgressScope, input: WrittenPracticeSnapshot) {
      const value = parseWrittenSnapshot(scope, input);
      if (!value) throw new Error('Invalid written recovery snapshot or scope.');
      await run(scope, value.kind, 'save', value);
    },
    load: (scope: ProgressScope, kind: Kind) => run(scope, kind, 'load'),
    async remove(scope: ProgressScope, kind: Kind) { await run(scope, kind, 'remove'); },
    async close() { const database = await opening; database?.close(); opening = undefined; },
  };
}
