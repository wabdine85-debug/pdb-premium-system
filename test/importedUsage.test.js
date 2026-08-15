import assert from 'node:assert/strict';
import test from 'node:test';
import { getEntitlementsForMonth } from '../src/services/entitlement.service.js';

test('imported legacy usage blocks August without creating a fake booking', async () => {
  const queries = [];
  const db = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('member_monthly_usage_imports')) {
        return { rows: [{ category_key: 'beyond', used_count: 1 }] };
      }
      return { rows: [] };
    }
  };

  const result = await getEntitlementsForMonth(
    { id: 42, package_key: 'beyond' },
    '2026-08-01',
    db
  );

  assert.equal(result.usage.beyond, 1);
  assert.equal(result.remaining.beyond, 0);
  assert.equal(queries.some((sql) => sql.includes('INSERT INTO bookings')), false);
});
