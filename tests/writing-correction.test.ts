import test from 'node:test';
import assert from 'node:assert/strict';
import { writingCorrection } from '../src/features/writing/writing-correction';

test('writing corrections highlight capitalization, agreement, spelling and punctuation separately', () => {
  const parts = writingCorrection('i has a bok', 'I have a book.', 'en');
  assert.deepEqual(parts.filter(part => part.kind === 'change'), [
    { kind: 'change', removed: 'i', added: 'I' },
    { kind: 'change', removed: 'has', added: 'have' },
    { kind: 'change', removed: 'bok', added: 'book.' },
  ]);
});

test('writing corrections preserve exact input and output through repetitions, accents and insertions', () => {
  const cases = [
    ['I I finish homework', 'I finish my homework.'],
    ['Je suis alle a Paris', 'Je suis allé à Paris.'],
    ['je vais 👩‍👩‍👧‍👧', 'Je vais 👩‍👩‍👧‍👧.'],
    ['I  have\na book.', 'I have a book.'],
    ['I have a book.', 'I have a book.'],
    ['<script>oops</script>', '<script>oops</script>.'],
    ['x'.repeat(1000), 'y'.repeat(1000)],
  ];
  for (const [draft, corrected] of cases) {
    const parts = writingCorrection(draft!, corrected!, 'fr');
    assert.equal(parts.map(part => part.kind === 'unchanged' ? part.text : part.removed).join(''), draft);
    assert.equal(parts.map(part => part.kind === 'unchanged' ? part.text : part.added).join(''), corrected);
  }
});
