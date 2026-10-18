import test from 'node:test';
import assert from 'node:assert/strict';
import { readCallHistoryInTransaction, createCloseEvaluator } from '../../server/data/call-history';

// Composition analysis: the production root binds no writer for either trusted
// observation. This isolates the resulting repository decision, without a DB or
// provider, rather than substituting an injected successful history in the UI.
test('P7 known gap: an attempted but never connected segment also blocks history and close without observations', async () => {
  const client = { query: async () => ({ rows: [{ connected: false, never_connected: false }] }) } as any;
  await assert.rejects(readCallHistoryInTransaction(client, 's'), /policy-unresolved/);
  let feedback = false;
  const close = createCloseEvaluator({ guardBroker: async () => {}, connectedFeedback: async () => { feedback = true; return 'pending'; } });
  await assert.rejects(close(client, { sessionId: 's', segments: [{ sessionId: 's', segmentId: 'c', connectionEpoch: 1 }] }), /policy-unresolved/);
  assert.equal(feedback, false);
  assert.deepEqual(await readCallHistoryInTransaction({ query: async () => ({ rows: [] }) } as any, 's'), { sessionId: 's', hadConnectedCall: false });
});
