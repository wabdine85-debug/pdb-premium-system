import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../src/config/pool.js';
import router from '../src/routes/bookings.js';
import { treatments } from '../src/data/treatments.data.js';

function response() {
  return { code: 200, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; } };
}

test('retired treatments stay inactive and the new full-area Titan is BEYOND', () => {
  for (const key of ['hautaufhellung', 'g8-cellulite', 'oxy-geneo-define']) {
    assert.equal(treatments.find(t => t.treatment_key === key)?.is_active, false);
  }
  const titan = treatments.find(t => t.treatment_key === 'ultraschall-titan-komplett');
  assert.equal(titan.category_key, 'beyond');
  assert.equal(titan.is_active, true);
});

test('inactive treatments cannot create tokens or use previously issued tokens', async () => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const writes = [];
  const query = async (sql) => {
    if (/^(BEGIN|ROLLBACK|COMMIT)$/.test(sql.trim())) return { rows: [] };
    if (/^(INSERT|UPDATE|DELETE)\b/.test(sql.trim())) {
      writes.push(sql);
      throw new Error('Inactive treatment must not mutate bookings');
    }
    if (/FROM members/.test(sql)) return { rows: [{ id: 1, shopify_customer_id: 'test-member', status: 'active', package_key: 'beyond' }] };
    if (/contract_applications/.test(sql)) return { rows: [] };
    // Simulate the database retaining a retired row for historical references.
    return { rows: /(?:\bt\.)?is_active\s*=\s*true/.test(sql)
      ? [] : [{ id: 108, treatment_key: 'hautaufhellung', category_key: 'pure', is_active: false }] };
  };
  pool.query = query;
  pool.connect = async () => ({ query, release() {} });
  try {
    for (const path of ['/create', '/validate-slot', '/consume', '/redirect/:token']) {
      const handler = router.stack.find(layer => layer.route?.path === path).route.stack.at(-1).handle;
      const res = response();
      const date = new Date();
      date.setDate(1);
      const appointment_date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-15`;
      await handler({ body: { treatment_key: 'hautaufhellung', token: 'retired-token',
        shopify_customer_id: 'test-member', appointment_date }, params: { token: 'retired-token' } }, res);
      assert.equal(res.code, 404, path);
      assert.equal(typeof res.body === 'string' ? res.body : res.body.error,
        path === '/create' ? 'TREATMENT_NOT_FOUND' : 'TOKEN_NOT_FOUND', path);
    }
    assert.deepEqual(writes, []);
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }
});
