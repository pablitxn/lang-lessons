import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCapability } from '../src/features/accounts/access';
import type { CurrentUser, Role } from '../src/contracts';

test('capabilities deny unresolved grants and never infer access from a role', () => {
  for (const role of ['administrator', 'professor', 'student'] as Role[]) {
    const user: CurrentUser = { id: role, role, capabilities: { granted: [] } };
    assert.equal(hasCapability(user, 'read'), false);
    assert.equal(hasCapability(user, null), false);
    assert.equal(hasCapability({ ...user, capabilities: { granted: ['read'] } }, 'read'), true);
    assert.equal(hasCapability({ ...user, capabilities: { granted: ['read'] } }, ''), false);
  }
  assert.equal(hasCapability(null, 'read'), false);
});

