import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalStudentTimeZone } from '../src/features/accounts/student-timezone';
test('student timezone requires an explicit IANA identifier or UTC and rejects guesses and offsets', () => {
  for (const invalid of ['', 'EST', 'PST', 'GMT', '+03:00', '-0300', 'Europe/Imaginary', ' UTC ', 'x'.repeat(129)]) assert.equal(canonicalStudentTimeZone(invalid), null, invalid);
  assert.equal(canonicalStudentTimeZone('UTC'), 'UTC');
  assert.equal(canonicalStudentTimeZone('America/New_York'), 'America/New_York');
  assert.equal(canonicalStudentTimeZone('Europe/Paris'), 'Europe/Paris');
});
