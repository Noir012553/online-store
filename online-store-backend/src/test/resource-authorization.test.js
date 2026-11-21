const test = require('node:test');
const assert = require('node:assert/strict');
const { isAdmin, isOrderOwner } = require('../utils/resourceAuthorization');

test('order owner access accepts the matching user id', () => {
  assert.equal(isOrderOwner({ user: 'user-1' }, { _id: 'user-1' }), true);
  assert.equal(isOrderOwner({ user: 'user-2' }, { _id: 'user-1' }), false);
});

test('order owner access preserves the customer email fallback', () => {
  assert.equal(
    isOrderOwner({ customer: { email: 'buyer@example.com' } }, { email: 'BUYER@example.com' }),
    true,
  );
  assert.equal(
    isOrderOwner({ customer: { email: 'buyer@example.com' } }, { email: 'other@example.com' }),
    false,
  );
});

test('admin roles are identified for protected resource access', () => {
  assert.equal(isAdmin({ role: 'admin' }), true);
  assert.equal(isAdmin({ role: 'super-admin' }), true);
  assert.equal(isAdmin({ role: 'user' }), false);
});
