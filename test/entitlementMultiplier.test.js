import test from 'node:test';
import assert from 'node:assert/strict';

import { getEntitlementsForMonth } from '../src/services/entitlement.service.js';

function createFakeDb(bookings) {
  return {
    async query(sql) {
      if (sql.includes('member_monthly_usage_imports')) return { rows: [] };
      return { rows: bookings.map(category_key => ({ category_key })) };
    }
  };
}

test('a second BEYOND contract doubles the monthly entitlement', async () => {
  const member = {
    id: 1,
    package_key: 'beyond',
    entitlement_multiplier: 2
  };

  const unused = await getEntitlementsForMonth(member, '2026-08-01', createFakeDb([]));
  const usedOnce = await getEntitlementsForMonth(member, '2026-08-01', createFakeDb(['beyond']));

  assert.equal(unused.remaining.beyond, 2);
  assert.equal(usedOnce.remaining.beyond, 1);
  assert.deepEqual(usedOnce.allowedCategories, ['beyond']);
});

test('members without a multiplier retain the standard entitlement', async () => {
  const entitlements = await getEntitlementsForMonth(
    { id: 1, package_key: 'beyond' },
    '2026-08-01',
    createFakeDb([])
  );

  assert.equal(entitlements.remaining.beyond, 1);
});

test('a future member has no entitlement before the contract start month', async () => {
  const member = {
    id: 2,
    package_key: 'beyond',
    status: 'active',
    started_at: '2026-09-01'
  };

  const august = await getEntitlementsForMonth(member, '2026-08-01', createFakeDb([]));
  const september = await getEntitlementsForMonth(member, '2026-09-01', createFakeDb([]));

  assert.equal(august.remaining.beyond, 0);
  assert.deepEqual(august.allowedCategories, []);
  assert.equal(september.remaining.beyond, 1);
});

test('database Date objects are interpreted as calendar months', async () => {
  const entitlements = await getEntitlementsForMonth(
    {
      id: 3,
      package_key: 'beyond',
      status: 'active',
      started_at: new Date(2026, 5, 1),
      entitlement_multiplier: 2
    },
    '2026-08-01',
    createFakeDb([])
  );

  assert.equal(entitlements.remaining.beyond, 2);
});
