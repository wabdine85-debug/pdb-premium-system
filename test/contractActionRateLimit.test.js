import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contractActionClientIp,
  recordContractActionAttempt
} from '../src/middleware/contractActionRateLimit.js';
import { ensureContractActionRateLimitSchema } from '../src/services/schema.service.js';

test('storefront client IP is used ahead of the Shopify proxy IP', () => {
  const req = {
    get: () => '198.51.100.7, 203.0.113.10',
    ip: '203.0.113.10'
  };
  assert.equal(contractActionClientIp(req), '198.51.100.7');
  req.get = () => 'invalid';
  assert.equal(contractActionClientIp(req), '203.0.113.10');
});

test('persistent contract action counter blocks the eleventh request', async () => {
  const attempts = new Map();
  const db = {
    async query(sql, values) {
      if (sql.startsWith('DELETE')) return { rows: [] };
      const key = `${values[0]}:${values[1]}`;
      const count = (attempts.get(key) || 0) + 1;
      attempts.set(key, count);
      return { rows: [{ attempts: count, reset_at: new Date(Date.now() + values[2]) }] };
    }
  };
  for (let index = 0; index < 10; index += 1) {
    assert.equal((await recordContractActionAttempt('198.51.100.7', db)).allowed, true);
  }
  const blocked = await recordContractActionAttempt('198.51.100.7', db);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter > 0);
  assert.equal((await recordContractActionAttempt('198.51.100.8', db)).allowed, true);
});

test('rate limit schema contains only hashed source identifiers', async () => {
  const queries = [];
  await ensureContractActionRateLimitSchema({ query: async (sql) => queries.push(sql) });
  assert.match(queries[0], /CREATE TABLE IF NOT EXISTS contract_action_rate_limits/);
  assert.match(queries[0], /source_hash TEXT NOT NULL/);
  assert.doesNotMatch(queries[0], /client_ip|email/);
});
