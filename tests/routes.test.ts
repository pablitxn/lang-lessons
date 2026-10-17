import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODES, modeHref, resolveMode } from '../src/app/routes';

test('all three modes have stable reloadable hash routes', () => {
  assert.equal(MODES.length, 3);
  for (const mode of MODES) assert.equal(resolveMode(modeHref(mode.id)), mode.id);
  assert.equal(resolveMode('#/unknown'), 'verb-image');
  assert.equal(resolveMode('', 'sentence'), 'sentence');
});
