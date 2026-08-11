import assert from 'node:assert/strict';
import test from 'node:test';
import { canUseLocalMemberFallback } from '../src/services/memberAuthorization.service.js';

test('legacy active BEYOND members keep access during Shopify API outages', () => {
  assert.equal(
    canUseLocalMemberFallback({ status: 'active', package_key: 'beyond' }, null),
    true
  );
});

test('a pending PRIVATE application cannot authorize a local PRIVATE record', () => {
  assert.equal(
    canUseLocalMemberFallback(
      { status: 'active', package_key: 'private' },
      { status: 'sepa_pending', package_key: 'private' }
    ),
    false
  );
});

test('an accepted matching contract authorizes its local member fallback', () => {
  assert.equal(
    canUseLocalMemberFallback(
      { status: 'active', package_key: 'private' },
      { status: 'active', package_key: 'private' }
    ),
    true
  );
});

test('inactive or package-mismatched local members never pass fallback', () => {
  assert.equal(
    canUseLocalMemberFallback(
      { status: 'inactive', package_key: 'beyond' },
      null
    ),
    false
  );
  assert.equal(
    canUseLocalMemberFallback(
      { status: 'active', package_key: 'pure' },
      { status: 'active', package_key: 'private' }
    ),
    false
  );
});
