import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVerbWritingFeedback } from '../src/contracts';

test('optional writing does not coerce provider values into trusted statuses', () => {
  const valid = { status: 'correct', correctedSentence: null, explanation: 'La frase usa el verbo correctamente.' };
  assert.deepEqual(parseVerbWritingFeedback(valid), valid);
  for (const status of [['correct'], { toString: 'correct' }, null, true, 'accepted']) {
    assert.equal(parseVerbWritingFeedback({ ...valid, status }), null);
  }
});

test('only a revision result may carry a proposed replacement sentence', () => {
  const revision = { status: 'needs-revision', correctedSentence: 'I bet on the result.', explanation: 'Usá una frase completa.' };
  assert.deepEqual(parseVerbWritingFeedback(revision), revision);
  assert.equal(parseVerbWritingFeedback({ ...revision, correctedSentence: null }), null);
  for (const status of ['correct', 'off-topic', 'uncertain']) assert.equal(parseVerbWritingFeedback({ ...revision, status }), null);
});
